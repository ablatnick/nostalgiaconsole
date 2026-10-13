# NostalgiaConsole

A full-screen dashboard in the style of the 2008 "New Xbox Experience" for
your Steam library. It runs on Linux, Windows and the Steam Deck, and it
also lists games you can stream from other PCs with Moonlight.

- **Channels** you scroll up and down: spotlight, my games, apps & emulators,
  streaming, my steam and settings. Each channel has a row of 3D tiles you
  scroll left and right.
- Reads installed Steam games, non-Steam shortcuts, play time and your own
  custom grid art straight from the Steam folder. Missing art comes from
  Steam's CDN.
- **Game library** grid sorted by recently played, A to Z, most played, or
  size on disk. You can **pin** games to spotlight.
- An **avatar** that stands on the spotlight channel. Build it in the
  **my avatar** editor: body type, skin, hair, eyes, eyebrows, mouth, facial
  hair, glasses, hats and clothes, with a live preview. Y gives you a random
  avatar. When you have no Steam profile picture, your avatar's head is your
  gamerpic.
- A **guide** with a gamercard and tabs (home, games, streaming, settings),
  console-style pop-up notifications, synthesized interface sounds, a boot
  animation, and four themes: classic, midnight, ember and arctic.
- **Moonlight**: every app on every paired host (Sunshine or GeForce
  Experience) shows up in the streaming channel and starts with one press.
- Controller first, but keyboard and mouse work too. Gamepad input is ignored
  while a game or stream window has focus.

Games start through Steam (`steam://rungameid/...`), so Steam has to be
installed and logged in. NostalgiaConsole never opens any other URL.

## Controls

| Pad | Keyboard | Action |
| --- | --- | --- |
| D-pad / left stick | Arrows / WASD | Move |
| A | Enter / Space | Select, game details, or stream |
| B | Esc / Backspace / right-click | Back (on the dashboard: go home) |
| X | X | Play now |
| Y | Y | Pin / unpin (otherwise opens the game library) |
| LB / RB | Q / E | Skip 5 tiles, or change sort in the library |
| View / Back | Tab / G | Guide (LB/RB switch tabs) |
| | F11 | Full screen |

## Install

Download the file for your system from `dist/` (or a release):

- **Linux / Steam Deck**: `NostalgiaConsole-<version>.AppImage`. Make it executable
  and run it.
- **Windows**: `NostalgiaConsole Setup <version>.exe` (installer) or
  `NostalgiaConsole-<version>-portable.exe`.

### Steam Deck / Big Picture

1. In Desktop Mode, put the AppImage somewhere permanent, for example
   `~/Applications/`.
2. In Steam, choose **Games > Add a Non-Steam Game** and pick the AppImage.
3. Back in Game Mode, start NostalgiaConsole from your library. Games you launch
   from it open on top of it, and you return to it when they exit.

Set **after launch** to `close` in settings if you'd rather NostalgiaConsole quit
when a game starts.

### Moonlight

Install Moonlight (moonlight-qt) and pair your hosts in it once. NostalgiaConsole
reads the paired hosts from Moonlight's settings and asks each host for its
apps (`moonlight list`). Selecting a tile runs
`moonlight stream <host> <app>`. To stream single games instead of the
whole desktop, add them as apps in Sunshine. A neat trick: add NostalgiaConsole
itself as a Sunshine app on your gaming PC, so streaming it from a TV gives
you the whole dashboard.

On a Windows Sunshine host, `scripts/add-to-sunshine.ps1` installs
NostalgiaConsole and adds it as a Sunshine app with its own game-case style cover
(`build/boxart/nostalgiaconsole-boxart.png`, made by `node build/boxart/make-boxart.mjs`),
so it shows up in Moonlight next to Desktop and Steam Big Picture:

```powershell
.\add-to-sunshine.ps1 -Source <folder or http URL holding the installer and cover>
```

Moonlight is found as `moonlight-qt`/`moonlight` on `PATH`, the snap, the
Flatpak (`com.moonlight_stream.Moonlight`), or the default install folder on
Windows and macOS. Set `MOONLIGHT_BIN` to override.

## Options

- `--steam-root=<folder>` or `STEAM_ROOT`: use this Steam folder. By default
  NostalgiaConsole looks in the usual native, Flatpak, snap and Windows locations.
- `--windowed`: start in a window.
- Settings are saved in `settings.json` in the app's user data folder
  (`~/.config/NostalgiaConsole` on Linux, `%APPDATA%\NostalgiaConsole` on Windows).

## Develop

```sh
npm install
npm start                 # windowed, using your real Steam library
npm test                  # parsers, library scan, Moonlight, settings
test/shot.sh out.png "Down,Enter" 1280x800 midnight   # offscreen screenshot
npm run dist:linux        # AppImage + tar.gz
npm run dist:win          # needs Wine, or use the electronuserland/builder:wine image
```

`test/make-fixture.js` builds a fake Steam folder (two libraries, play
stats, shortcuts) that the tests and `test/shot.sh` use.

On Linux the AppImage starts Electron with `--no-sandbox`. Ubuntu 24.04+
blocks the Chromium sandbox for AppImages. The UI only loads its own bundled
files through a locked-down custom protocol, with a strict CSP.

NostalgiaConsole is a fan project. It isn't affiliated with Microsoft, Xbox,
Valve or the Moonlight project, and it ships no assets from them.
