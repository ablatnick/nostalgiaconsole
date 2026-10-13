<#
  Installs NostalgiaConsole on a Windows Sunshine host and adds it as a Sunshine
  app, so it shows up with its own cover in Moonlight.

  Run in PowerShell on the host:
    .\add-to-sunshine.ps1 -Source <folder or http URL with the installer and cover>

  Without -Installer it only adds the Sunshine app (NostalgiaConsole already installed).
#>
param(
  [string]$Source = $PSScriptRoot,
  [string]$Installer = 'NostalgiaConsole Setup 1.1.0.exe',
  [string]$InstallerSha256 = '',
  [string]$Cover = 'nostalgiaconsole-boxart.png',
  [switch]$NoInstall,
  [string]$Exe = ''
)
$ErrorActionPreference = 'Stop'

function Test-Admin {
  ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-File([string]$name) {
  $dest = Join-Path $env:TEMP $name
  if ($Source -match '^https?://') {
    Write-Host "Downloading $name"
    Invoke-WebRequest -UseBasicParsing -Uri ($Source.TrimEnd('/') + '/' + [uri]::EscapeDataString($name)) -OutFile $dest
  } else {
    Copy-Item -LiteralPath (Join-Path $Source $name) -Destination $dest -Force
  }
  return $dest
}

function Find-NostalgiaConsole {
  foreach ($dir in @("$env:LOCALAPPDATA\Programs\nostalgiaconsole", "$env:LOCALAPPDATA\Programs\NostalgiaConsole", "$env:ProgramFiles\NostalgiaConsole")) {
    $exe = Join-Path $dir 'NostalgiaConsole.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

# 1. Install NostalgiaConsole for this user (silent, per-user NSIS installer).
if (-not $NoInstall) {
  $setup = Get-File $Installer
  if ($InstallerSha256) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $setup).Hash
    if ($hash -ne $InstallerSha256.ToUpper()) { throw "Installer checksum mismatch ($hash)" }
  }
  # The installer can't replace files of a running copy (say, one left
  # over from a stream).
  Get-Process NostalgiaConsole, Greenblade -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
  Write-Host 'Installing NostalgiaConsole'
  Start-Process -FilePath $setup -ArgumentList '/S' -Wait
}
# The app used to be called Greenblade: remove that install.
$oldUninstall = "$env:LOCALAPPDATA\Programs\greenblade\Uninstall Greenblade.exe"
if (-not $NoInstall -and (Test-Path -LiteralPath $oldUninstall)) {
  Write-Host 'Removing the old Greenblade install'
  Start-Process -FilePath $oldUninstall -ArgumentList '/S' -Wait
}

$exe = if ($Exe) { $Exe } else { Find-NostalgiaConsole }
if (-not $exe) { throw 'NostalgiaConsole.exe not found after install' }
Write-Host "NostalgiaConsole: $exe"

# 2. Find Sunshine and its apps.json.
$svc = Get-CimInstance Win32_Service -Filter "Name='SunshineService'" -ErrorAction SilentlyContinue
$sunDir = if ($svc -and $svc.PathName) { Split-Path ($svc.PathName.Trim('"') -replace '"\s.*$', '') } else { "$env:ProgramFiles\Sunshine" }
# The service binary is sunshinesvc.exe in Sunshine\tools; config is one level up.
if ((Split-Path -Leaf $sunDir) -eq 'tools') { $sunDir = Split-Path $sunDir }
if (-not (Test-Path -LiteralPath $sunDir)) { throw "Sunshine not found in $sunDir" }
$confDir = Join-Path $sunDir 'config'
$appsFile = Join-Path $confDir 'apps.json'
$conf = Join-Path $confDir 'sunshine.conf'
if (Test-Path -LiteralPath $conf) {
  $line = Select-String -LiteralPath $conf -Pattern '^\s*file_apps\s*=\s*(.+)$' | Select-Object -First 1
  if ($line) {
    $p = $line.Matches[0].Groups[1].Value.Trim()
    $appsFile = if ([IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $confDir $p }
  }
}
Write-Host "Sunshine apps: $appsFile"

# Writing under Program Files and restarting the service need admin.
if (-not (Test-Admin)) {
  Write-Host 'Asking for admin rights to update Sunshine'
  if (-not $PSCommandPath) { throw 'Save this script to a file and run it from there' }
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-NoInstall',
    '-Source', "`"$Source`"", '-Cover', "`"$Cover`"", '-Exe', "`"$exe`"")
  Start-Process powershell -Verb RunAs -Wait -ArgumentList $argList
  exit
}

# 3. Cover art goes next to Sunshine's own covers.
$coversDir = Join-Path $confDir 'covers'
New-Item -ItemType Directory -Force -Path $coversDir | Out-Null
# Each cover gets a file name from its hash, so Sunshine never serves a
# stale copy. Moonlight caches covers by app id (which comes from the app
# name), so clients that already have the old cover need their Moonlight
# box art cache cleared to see a new one.
$coverSrc = Get-File $Cover
$tag = (Get-FileHash -Algorithm SHA256 -LiteralPath $coverSrc).Hash.Substring(0, 8).ToLower()
Get-ChildItem -LiteralPath $coversDir -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'nostalgiaconsole*.png' -or $_.Name -like 'greenblade*.png' } | Remove-Item -Force
$coverPath = Join-Path $coversDir "nostalgiaconsole-$tag.png"
Copy-Item -LiteralPath $coverSrc -Destination $coverPath -Force

# 4. Add (or replace) the NostalgiaConsole app.
$json = if (Test-Path -LiteralPath $appsFile) { Get-Content -Raw -LiteralPath $appsFile | ConvertFrom-Json } else { [pscustomobject]@{ env = @{}; apps = @() } }
$backup = "$appsFile.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
if (Test-Path -LiteralPath $appsFile) { Copy-Item -LiteralPath $appsFile -Destination $backup }
$apps = @($json.apps | Where-Object { $_.name -ne 'NostalgiaConsole' -and $_.name -ne 'Greenblade' })
$apps += [pscustomobject]@{
  'name'           = 'NostalgiaConsole'
  'cmd'            = "`"$exe`""
  'image-path'     = $coverPath
  'auto-detach'    = $true
  'wait-all'       = $true
  'exit-timeout'   = 5
  'exclude-global-prep-cmd' = $false
  'elevated'       = $false
}
$json.apps = $apps
# Sunshine's parser does not want a BOM.
[IO.File]::WriteAllText($appsFile, ($json | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
Write-Host "Added NostalgiaConsole to Sunshine (backup: $backup)"

# 5. Sunshine reads apps.json at start.
if ($svc) {
  Restart-Service -Name SunshineService
  Write-Host 'Restarted Sunshine'
} else {
  Write-Host 'Restart Sunshine to pick up the new app'
}
Write-Host 'Done. In Moonlight, open the host to see NostalgiaConsole.'
