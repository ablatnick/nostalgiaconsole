#!/bin/sh
# Regenerates the README screenshots in docs/screenshots (1280x720)
# from the test library and test/web-fixture.json.
# Usage: test/readme-shots.sh [name ...]   (no names = all)
#   OUT=dir       write somewhere else (the CI smoke test does)
#   SETTINGS=json extra settings, e.g. SETTINGS='"tileSize":"tiny",'
#   ELECTRON_FLAGS extra Chromium flags (CI: software WebGL)
# Exits non-zero if any page logged an error or a shot is missing.
cd "$(dirname "$0")/.."
out=${OUT:-docs/screenshots}
ud=test/.userdata-readme
log=$(mktemp)
start=$(mktemp)   # untouched marker: every shot must be newer than this
tries=$(mktemp)   # output of the current attempt
trap 'rm -f "$log" "$start" "$tries"' EXIT
sleep 1
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
  echo "$name"
  # One retry: CI's software GPU process occasionally crashes, which is the
  # runner, not the app. A real problem fails both times.
  for try in 1 2; do
    rm -rf "$ud"; mkdir -p "$ud"
    printf '{"theme":"%s","intro":true,"moonlight":false,%s%s}\n' "$theme" "${SETTINGS:-}" "$PROFILES" > "$ud/settings.json"
    : > "$tries"
    # Extra args go first: the app reads the first copy of each flag.
    timeout 90 npx electron . "$@" ${ELECTRON_FLAGS:-} --no-sandbox --steam-root=/tmp/nostalgiaconsole-demo/Steam --user-data="$ud" \
      --web-fixture=test/web-fixture.json --capture="$out/$name.png" --keys="$keys" --size=1280x720 --delay=3500 2>&1 | grep -iv 'gtk\|dbus\|gles\|viz' > "$tries"
    [ "$out/$name.png" -nt "$start" ] || echo "[missing] $name.png" >> "$tries"
    cat "$tries"
    grep -q '^\[page\|^\[missing' "$tries" || break
    [ $try = 1 ] && echo "  retrying $name"
  done
  cat "$tries" >> "$log"
}

only="$*"
# Game details show the install path, so build the test library at a
# neutral path rather than inside the checkout.
FIXTURE_DIR=/tmp/nostalgiaconsole-demo node test/make-fixture.js
# lookshot <name> <dashboard style> <keys>
lookshot() {
  keep=${SETTINGS:-}
  SETTINGS="$keep\"look\":\"$2\","
  shot "$1" "$3"
  SETTINGS=$keep
}

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
lookshot look-nxe nxe ''
lookshot look-blades blades ''
lookshot look-xmb xmb ''
lookshot look-wii wii ''
lookshot look-wii-preview wii 'Return'
lookshot look-ps5 ps5 ''
lookshot look-switch switch ''
rm -rf "$ud"
if grep -q '^\[page\|^\[missing' "$log"; then echo 'FAILED: see the messages above'; exit 1; fi
