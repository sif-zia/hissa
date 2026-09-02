#!/usr/bin/env bash
# Rebuild public/fonts from Google Fonts. Run when a glyph is missing —
# a new currency symbol, say. Needs python3 and curl.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/fonts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 -m venv "$TMP/fe"
"$TMP/fe/bin/pip" install -q "fonttools[woff]" brotli
PY="$TMP/fe/bin"

# Latin-1 basic plus the punctuation and currency this app renders.
TEXT='U+0020-007E,U+00A0,U+00A3,U+00A5,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+20A8,U+20AC,U+20B9,U+2192,U+2713'
# Ledger renders amounts only.
AMT='U+0020,U+0023,U+0024,U+0025,U+0028,U+0029,U+002B,U+002C,U+002D,U+002E,U+002F,U+0030-0039,U+003A,U+0041-005A,U+0061-007A,U+00A3,U+00A5,U+00D7,U+20A8,U+20AC,U+20B9'
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

fetch() { # family-query -> latin woff2 url
  curl -sS -H "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=$1&display=swap" \
    | awk '/@font-face/{b=""} {b=b"\n"$0} /unicode-range: U\+0000/{print b}' \
    | grep -oE 'https://[^)]*woff2' | head -1
}

curl -sS "$(fetch 'Shantell+Sans:wght@300..800')" -o "$TMP/hand.woff2"
curl -sS "$(fetch 'Caveat:wght@400..700')"        -o "$TMP/scrawl.woff2"
curl -sS "$(fetch 'Courier+Prime:wght@400')"      -o "$TMP/led.woff2"
curl -sS "$(fetch 'Courier+Prime:wght@700')"      -o "$TMP/ledb.woff2"

# Pin the variable axes to the range actually used before subsetting.
"$PY/fonttools" varLib.instancer "$TMP/hand.woff2"   wght=400:700 -o "$TMP/hand.ttf"
"$PY/fonttools" varLib.instancer "$TMP/scrawl.woff2" wght=500     -o "$TMP/scrawl.ttf"

sub() { "$PY/pyftsubset" "$1" --unicodes="$2" --flavor=woff2 --layout-features="$3" --output-file="$OUT/$4"; }
sub "$TMP/hand.ttf"   "$TEXT" kern,liga,calt hissa-hand.woff2
sub "$TMP/scrawl.ttf" "$TEXT" kern,liga      hissa-scrawl.woff2   # calt costs 21 KB here
sub "$TMP/led.woff2"  "$AMT"  kern,tnum,lnum hissa-ledger.woff2
sub "$TMP/ledb.woff2" "$AMT"  kern,tnum,lnum hissa-ledger-bold.woff2

ls -l "$OUT"/*.woff2 | awk '{printf "%-26s %6.1f KB\n", $9, $5/1024}'
