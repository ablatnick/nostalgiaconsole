# NostalgiaConsole

A full screen launcher for your Steam library in the style of the 2011
Xbox 360 dashboard: tiles, pivots, a guide button, 3D avatars and
gamerscore. It runs on Linux, Windows and the Steam Deck, and also lists
games you can stream from your other PCs with Moonlight, so a TV or a
Steam Deck feels like a console instead of Steam Big Picture.

![Home pivot](docs/screenshots/home.png)

| | |
| --- | --- |
| ![Sign-in with everyone's avatar](docs/screenshots/signin.png) | ![Social pivot: friends list](docs/screenshots/social.png) |

More in [Screenshots](#screenshots).

## Quick start

1. Download the latest file for your system from
   [Releases](../../releases): the `.AppImage` for Linux and the Steam
   Deck, or the `Setup .exe` / portable `.exe` for Windows.
2. Make sure Steam is installed and you're logged in, then start
   NostalgiaConsole. It finds your Steam library on its own.
3. Use a controller (or the keyboard: arrows, Enter, Esc, Q/E to switch
   pivots, G for the guide).
4. Optional: pair your hosts in Moonlight to get a streaming pivot, and
   connect Jellyfin in **settings** for a video pivot.

Steam Deck, Moonlight and Jellyfin setup are under [Install](#install) and
[Connect Steam and Jellyfin](#connect-steam-and-jellyfin).

## Features

- **Pivots** like the 2011 dashboard: search, home, games, apps, video,
  streaming, social, steam and settings, with LB/RB to switch. Hide any of
  them in settings > customize.
- **Your Steam library**: installed games, non-Steam shortcuts, play time
  and your own custom grid art, straight from the Steam folder. A game
  library sorted by recent, A to Z, most played or size, with pins.
- **3D avatars** you build in the avatar editor, with 25 costumes. Profiles
  each get their own avatar, and the "who's playing?" sign-in shows
  everyone's avatar standing side by side and idling.
- **Gamerscore and achievements** (10G each), "achievement unlocked"
  pop-ups over your game, and a **social** pivot with your Steam friends,
  all without an API key (see [what a key adds](#connect-steam-and-jellyfin)).
- **Moonlight**: every app on every paired Sunshine or GeForce Experience
  host, one press to stream.
- **Jellyfin video**: continue watching, next up, movies and shows, with a
  built-in player that syncs your progress.
- **Customize**: tile and background colors, tile size (so more fits on
  screen), text size, which tabs show, and more.
- The **guide**, console-style notifications, synthesized sounds (or your
  own sound pack), a boot animation and four themes.
- Controller first; keyboard and mouse work too. Gamepad input is ignored
  while a game or stream window has focus.

Games start through Steam (`steam://rungameid/...`), so Steam has to be
installed and logged in. NostalgiaConsole never opens any other URL.

<details>
<summary>Everything in the avatar editor</summary>

Body type, height, skin, 15 hair styles and colors, eyes, eyebrows, mouth,
facial hair, face markings, 8 kinds of glasses, 12 hats, tops (suits,
flannels, jerseys and more), bottoms, shoes and extras like a scarf,
backpack or watch. Y gives you a random avatar. The 25 costumes are power
armor, bounty hunter, caped hero, ninja, samurai, viking, knight, pirate,
cowboy, chef, firefighter, scientist, astronaut, pilot, trooper, robot,
fox/cat/bear and dino hoodies, zombie, mummy, robe, wizard and alien, each
with a costume color. Gamerpics can be your Steam picture, your avatar's
head, or any picture in the `gamerpics` folder in the user data folder.

</details>

## Controls

| Pad | Keyboard | Action |
| --- | --- | --- |
| D-pad / left stick | Arrows / WASD | Move |
| A | Enter / Space | Select, game details, or stream |
| B | Esc / Backspace / right-click | Back (on the dashboard: go home) |
| X | X | Play now |
| Y | Y | Pin / unpin (otherwise opens the game library) |
| LB / RB | Q / E | Switch pivots, or change sort in the library |
| Menu / Start | M | Game details |
| View / Back, Guide | Tab, G / Home | Guide (LB/RB switch tabs) |
| | F11 | Full screen |

## Screenshots

| | |
| --- | --- |
| ![Games pivot](docs/screenshots/games.png) | ![Steam pivot with your avatar](docs/screenshots/steam.png) |
| ![Video pivot (Jellyfin)](docs/screenshots/video.png) | ![Customize: colors, layout and tabs](docs/screenshots/customize.png) |
| ![Guide](docs/screenshots/guide.png) | ![Game details](docs/screenshots/details.png) |
| ![Game library](docs/screenshots/library.png) | ![Avatar editor](docs/screenshots/avatar-editor.png) |
| ![Settings pivot](docs/screenshots/settings.png) | ![Midnight theme](docs/screenshots/midnight.png) |
| ![Boot screen](docs/screenshots/boot.png) | |

Screenshots use the test library from `test/make-fixture.js` and
`test/web-fixture.json`; `test/readme-shots.sh` regenerates them all.

## Install

Download the file for your system from [Releases](../../releases)
(Linux, Steam Deck and Windows; there is no macOS build):

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
Windows. Set `MOONLIGHT_BIN` to override. (There is no macOS build yet.)

## Connect Steam and Jellyfin

Both are optional and set up in **settings** with the on-screen keyboard (a
physical keyboard and paste work too). Keys are stored in `secrets.json` in
the user data folder, readable only by you, and never shown in the UI.

- **steam web api** (optional). Without a key, everything comes from
  Steam's files on this PC and from public Steam profiles:
  - achievements and gamerscore for games whose stats Steam has saved on
    this PC (games you've played here);
  - friends that the Steam client has cached on this PC;
  - online status and current game for friends with public profiles
    (friends with private profiles show as offline).

  A key from <https://steamcommunity.com/dev/apikey> adds games you own but
  haven't installed, the full friends list with status from the Web API,
  and achievements from games played on other PCs. The Web API only
  returns what your Steam privacy settings make public, so set your game
  details and friends list to public if those stay empty.
- **jellyfin**: enter the server address (for example
  `http://192.168.1.10:8096`) and an API key from Jellyfin's
  **Dashboard > API Keys**. Video, images and progress go through
  NostalgiaConsole, which adds the key itself.

On streaming hosts, NostalgiaConsole asks Sunshine for its app list and
covers directly, using this device's Moonlight pairing certificate (and
checking the host's pinned certificate), so it doesn't depend on Moonlight's
cache.

## Sound pack

The interface sounds are synthesized. To use your own, put audio files in
the `sounds` folder in NostalgiaConsole's user data folder
(`~/.config/NostalgiaConsole/sounds` on Linux,
`%APPDATA%\NostalgiaConsole\sounds` on Windows), named after the sound
they replace: `move`, `channel` (switching pivots), `select`, `back`,
`open`, `close`, `notify`, `launch`, `error` and `intro`. Any of `.wav`,
`.ogg`, `.mp3`, `.m4a` or `.flac` works. **Settings > sound pack** opens the
folder and reloads it. Sounds you don't provide keep the built-in version.

## Start at login and updates

**Settings > start at login** opens NostalgiaConsole when you log in (on a
streaming PC that makes it the first thing you see). On a Steam Deck, add it
as a non-Steam game and launch it from Game Mode.

Releases are built by GitHub Actions when a version tag is pushed
(`git tag v1.2.3 && git push --tags`); **settings > check for updates**
looks at the latest release.

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
test/shot.sh out.png "Down,Return" 1280x800 midnight  # offscreen screenshot
test/readme-shots.sh      # every screen, into docs/screenshots (CI runs it too)
npm run dist:linux        # AppImage + tar.gz
npm run dist:win          # needs Wine, or use the electronuserland/builder:wine image
```

`test/make-fixture.js` builds a fake Steam folder (two libraries, play
stats, shortcuts) that the tests and `test/shot.sh` use.

On Linux the AppImage starts Electron with `--no-sandbox`. Ubuntu 24.04+
blocks the Chromium sandbox for AppImages. The UI only loads its own bundled
files through a locked-down custom protocol, with a strict CSP.

## Support

If NostalgiaConsole is useful to you, you can support it and other projects on [Venmo (@ablatnick)](https://venmo.com/u/ablatnick).

## License

[MIT](LICENSE). Bundled three.js and hls.js keep their own licenses
(`src/renderer/vendor/*-LICENSE.txt`).

NostalgiaConsole is a fan project. It isn't affiliated with Microsoft, Xbox,
Valve or the Moonlight project, and it ships no assets from them.
