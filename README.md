# NostalgiaConsole

A full-screen dashboard in the style of the 2011 Xbox 360 dashboard for
your Steam library. It runs on Linux, Windows and the Steam Deck, and it
also lists games you can stream from other PCs with Moonlight.


## Screenshots

![Home pivot](docs/screenshots/home.png)

| | |
| --- | --- |
| ![Games pivot](docs/screenshots/games.png) | ![Steam pivot with your avatar](docs/screenshots/steam.png) |
| ![Guide](docs/screenshots/guide.png) | ![Game details](docs/screenshots/details.png) |
| ![Game library](docs/screenshots/library.png) | ![Avatar editor](docs/screenshots/avatar-editor.png) |
| ![Midnight theme](docs/screenshots/midnight.png) | ![Boot screen](docs/screenshots/boot.png) |

Screenshots use the test library from `test/make-fixture.js` (rendered with
`test/shot.sh`).

## Features

- **Pivots** across the top: search, home, games, apps, streaming, steam
  and settings, each a grid of tiles three tall. LB/RB switch pivots, and
  moving off a grid's edge slides into the next one. Home has your last
  game, pins, recent games, a big "continue" tile and two tiles that cycle
  through your library.
- Reads installed Steam games, non-Steam shortcuts, play time and your own
  custom grid art straight from the Steam folder. Missing art comes from
  Steam's CDN.
- **Game library** grid sorted by recently played, A to Z, most played, or
  size on disk. You can **pin** games to My Pins on home.
- A 3D **avatar** that stands beside the steam pivot. Build it in the
  **my avatar** editor: body type, skin, hair, eyes, eyebrows, mouth, facial
  hair, glasses, hats and clothes, with a live preview. Y gives you a random
  avatar. There are costumes too (power armor, bounty hunter, caped hero,
  animal hoodies, robot, astronaut, knight, wizard and more).
- **Gamerpics**: your Steam picture, your avatar's head, or any picture you
  put in the `gamerpics` folder in the user data folder.
- A **guide** with a gamercard and tabs (home, games, streaming, settings),
  console-style pop-up notifications, synthesized interface sounds, a boot
  animation, and four themes: classic, midnight, ember and arctic.
- **Moonlight**: every app on every paired host (Sunshine or GeForce
  Experience) shows up on the streaming pivot and starts with one press.
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

## Sound pack

The interface sounds are synthesized. To use your own, put audio files in
the `sounds` folder in NostalgiaConsole's user data folder
(`~/.config/NostalgiaConsole/sounds` on Linux,
`%APPDATA%\NostalgiaConsole\sounds` on Windows), named after the sound
they replace: `move`, `channel` (switching pivots), `select`, `back`,
`open`, `close`, `notify`, `launch`, `error` and `intro`. Any of `.wav`,
`.ogg`, `.mp3`, `.m4a` or `.flac` works. **Settings > sound pack** opens the
folder and reloads it. Sounds you don't provide keep the built-in version.

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
