#!/bin/sh
# Regenerates the README screenshots in docs/screenshots (1280x720)
# from the test library and test/web-fixture.json.
# Usage: test/readme-shots.sh [name ...]   (no names = all)
#   OUT=dir       write somewhere else (the CI smoke test does)
#   SETTINGS=json extra settings, e.g. SETTINGS='"tileSize":"tiny",'
# Exits non-zero if any page logged an error or a shot is missing.
cd "$(dirname "$0")/.."
out=${OUT:-docs/screenshots}
ud=test/.userdata-readme
log=$(mktemp)
trap 'rm -f "$log"' EXIT
mkdir -p "$out"

# The same four profiles every run, so the sign-in shot has a lineup.
PROFILES='"profile":"p1","profiles":[
{"id":"p1","name":"Player One","avatarLook":null},
{"id":"p2","name":"Sam","avatarLook":{"hairStyle":"long","hairColor":"#d8a24a","top":"jacket","topColor":"#c4282d","bottoms":"skirt"}},
{"id":"p3","name":"Robo Rick","avatarLook":{"costume":"armor","height":"tall"}},
{"id":"p4","name":"Gran","avatarLook":{"hairStyle":"curly","glasses":"round","top":"sweater","build":"broad","height":"short"}}]'

# shot <name> <keys> [theme] [extra electron args]
shot() {
  name=$1; keys=$2; theme=${3:-classic}
  shift 2; [ $# -gt 0 ] && shift
  if [ -n "$only" ] && ! echo " $only " | grep -q " $name "; then return; fi
  rm -rf "$ud"; mkdir -p "$ud"
  printf '{"theme":"%s","intro":true,"moonlight":false,%s%s}\n' "$theme" "${SETTINGS:-}" "$PROFILES" > "$ud/settings.json"
  echo "$name"
  # Extra args go first: the app reads the first copy of each flag.
  timeout 90 npx electron . "$@" --no-sandbox --steam-root=test/fixture/Steam --user-data="$ud" \
    --web-fixture=test/web-fixture.json --capture="$out/$name.png" --keys="$keys" --size=1280x720 --delay=3500 2>&1 | grep -iv 'gtk\|dbus\|gles\|viz' | tee -a "$log"
  [ "$out/$name.png" -nt "$log" ] || echo "[missing] $name.png" | tee -a "$log"
}

only="$*"
[ -d test/fixture/Steam ] || node test/make-fixture.js
shot home ''
shot games 'E'
shot video 'E,E,E'
shot social 'E,E,E,E'
shot steam 'E,E,E,E,E'
shot settings 'E,E,E,E,E,E'
shot customize 'E,E,E,E,E,E,Down,Return,E,wait300'
shot guide 'G'
shot details 'M'
shot library 'G,Down,Return'
shot avatar-editor 'G,Down,Down,Return,wait1500'
shot signin 'G,Down,Down,Down,Down,Return,Right,wait2500'
shot midnight '' midnight
shot boot '' classic --intro --delay=900
rm -rf "$ud"
if grep -q '^\[page\|^\[missing' "$log"; then echo 'FAILED: see the messages above'; exit 1; fi
