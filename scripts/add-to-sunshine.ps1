<#
  Installs Greenblade on a Windows Sunshine host and adds it as a Sunshine
  app, so it shows up with its own cover in Moonlight.

  Run in PowerShell on the host:
    .\add-to-sunshine.ps1 -Source <folder or http URL with the installer and cover>

  Without -Installer it only adds the Sunshine app (Greenblade already installed).
#>
param(
  [string]$Source = $PSScriptRoot,
  [string]$Installer = 'Greenblade Setup 0.1.0.exe',
  [string]$InstallerSha256 = '',
  [string]$Cover = 'greenblade-boxart.png',
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

function Find-Greenblade {
  foreach ($dir in @("$env:LOCALAPPDATA\Programs\greenblade", "$env:LOCALAPPDATA\Programs\Greenblade", "$env:ProgramFiles\Greenblade")) {
    $exe = Join-Path $dir 'Greenblade.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

# 1. Install Greenblade for this user (silent, per-user NSIS installer).
if (-not $NoInstall) {
  $setup = Get-File $Installer
  if ($InstallerSha256) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $setup).Hash
    if ($hash -ne $InstallerSha256.ToUpper()) { throw "Installer checksum mismatch ($hash)" }
  }
  Write-Host 'Installing Greenblade'
  Start-Process -FilePath $setup -ArgumentList '/S' -Wait
}
$exe = if ($Exe) { $Exe } else { Find-Greenblade }
if (-not $exe) { throw 'Greenblade.exe not found after install' }
Write-Host "Greenblade: $exe"

# 2. Find Sunshine and its apps.json.
$svc = Get-CimInstance Win32_Service -Filter "Name='SunshineService'" -ErrorAction SilentlyContinue
$sunDir = if ($svc -and $svc.PathName) { Split-Path ($svc.PathName.Trim('"') -replace '"\s.*$', '') } else { "$env:ProgramFiles\Sunshine" }
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
$coverPath = Join-Path $coversDir 'greenblade.png'
Copy-Item -LiteralPath (Get-File $Cover) -Destination $coverPath -Force

# 4. Add (or replace) the Greenblade app.
$json = if (Test-Path -LiteralPath $appsFile) { Get-Content -Raw -LiteralPath $appsFile | ConvertFrom-Json } else { [pscustomobject]@{ env = @{}; apps = @() } }
$backup = "$appsFile.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
if (Test-Path -LiteralPath $appsFile) { Copy-Item -LiteralPath $appsFile -Destination $backup }
$apps = @($json.apps | Where-Object { $_.name -ne 'Greenblade' })
$apps += [pscustomobject]@{
  'name'           = 'Greenblade'
  'cmd'            = "`"$exe`""
  'image-path'     = $coverPath
  'auto-detach'    = 'true'
  'wait-all'       = 'true'
  'exit-timeout'   = '5'
  'exclude-global-prep-cmd' = 'false'
  'elevated'       = 'false'
}
$json.apps = $apps
# Sunshine's parser does not want a BOM.
[IO.File]::WriteAllText($appsFile, ($json | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
Write-Host "Added Greenblade to Sunshine (backup: $backup)"

# 5. Sunshine reads apps.json at start.
if ($svc) {
  Restart-Service -Name SunshineService
  Write-Host 'Restarted Sunshine'
} else {
  Write-Host 'Restart Sunshine to pick up the new app'
}
Write-Host 'Done. In Moonlight, open the host to see Greenblade.'
