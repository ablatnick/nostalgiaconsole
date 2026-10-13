#!/bin/sh
# Usage: test/shot.sh out.png [keys] [WxH] [theme]
# Renders the dashboard offscreen against the fixture library.
cd "$(dirname "$0")/.."
ud=test/.userdata
mkdir -p "$ud"
printf '{"theme":"%s","intro":false,"moonlight":false,"gamerpic":"%s"}\n' "${4:-classic}" "${GAMERPIC:-}" > "$ud/settings.json"
exec timeout 90 npx electron . --no-sandbox --steam-root=test/fixture/Steam --user-data="$ud" \
  --capture="$1" --keys="${2:-}" --size="${3:-1280x800}" --delay=3500 ${WEB:+--web-fixture=test/web-fixture.json} 2>&1 | grep -iv 'gtk\|dbus\|gles\|viz'
