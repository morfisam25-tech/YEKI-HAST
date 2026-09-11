#!/usr/bin/env bash
set -euo pipefail

mkdir -p store-screenshots

on_error() {
  adb exec-out screencap -p > store-screenshots/failure.png 2>/dev/null || true
  cp /tmp/w13-metro.log store-screenshots/metro.log 2>/dev/null || true
  adb shell uiautomator dump /sdcard/w13-window.xml >/dev/null 2>&1 || true
  adb exec-out cat /sdcard/w13-window.xml > store-screenshots/window.xml 2>/dev/null || true
}
trap on_error ERR

adb shell wm size 1080x1920
adb shell wm density 420
adb install -r screenshot-apk/app-debug.apk

(
  cd apps/mobile
  npx expo start --localhost --clear > /tmp/w13-metro.log 2>&1
) &
METRO_PID=$!
trap 'kill "$METRO_PID" >/dev/null 2>&1 || true' EXIT

adb reverse tcp:8081 tcp:8081
sleep 8
adb shell monkey -p app.yekihast.mobile -c android.intent.category.LAUNCHER 1

wait_text() {
  local needle="$1"
  local attempts="${2:-30}"
  local i
  for ((i=1; i<=attempts; i++)); do
    adb shell uiautomator dump /sdcard/w13-window.xml >/dev/null 2>&1 || true
    adb exec-out cat /sdcard/w13-window.xml > /tmp/w13-window.xml 2>/dev/null || true
    if grep -Fq "$needle" /tmp/w13-window.xml 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "UI text did not appear: $needle" >&2
  cat /tmp/w13-window.xml >&2 || true
  tail -200 /tmp/w13-metro.log >&2 || true
  return 1
}

tap_text() {
  local needle="$1"
  adb shell uiautomator dump /sdcard/w13-window.xml >/dev/null
  adb exec-out cat /sdcard/w13-window.xml > /tmp/w13-window.xml
  python3 - "$needle" <<'PY'
import re, subprocess, sys, xml.etree.ElementTree as ET
needle = sys.argv[1]
root = ET.parse('/tmp/w13-window.xml').getroot()
for node in root.iter('node'):
    text = node.attrib.get('text', '')
    desc = node.attrib.get('content-desc', '')
    if needle in text or needle in desc:
        match = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.attrib.get('bounds', ''))
        if not match:
            continue
        x1, y1, x2, y2 = map(int, match.groups())
        subprocess.check_call(['adb', 'shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2)])
        sys.exit(0)
print(f'Could not find UI text: {needle}', file=sys.stderr)
print(open('/tmp/w13-window.xml', encoding='utf-8').read(), file=sys.stderr)
sys.exit(1)
PY
  sleep 3
}

wait_text 'یکی هست' 40
wait_text 'وضعیت گفت‌وگو' 10
adb exec-out screencap -p > store-screenshots/01-home.png

tap_text 'وضعیت گفت‌وگو'
wait_text 'گفت‌وگوی عمومی هنوز باز نشده است' 10
adb exec-out screencap -p > store-screenshots/02-caller-closed.png

adb shell am force-stop app.yekihast.mobile
adb shell monkey -p app.yekihast.mobile -c android.intent.category.LAUNCHER 1
wait_text 'می‌خوام شنونده بشم' 20

tap_text 'می‌خوام شنونده بشم'
wait_text 'ادامه با ایمیل' 10
adb exec-out screencap -p > store-screenshots/03-listener-intro.png

tap_text 'ادامه با ایمیل'
wait_text 'ایمیل' 10
adb exec-out screencap -p > store-screenshots/04-email-auth.png

file store-screenshots/0*.png
python3 - <<'PY'
from pathlib import Path
import struct
files = sorted(Path('store-screenshots').glob('0*.png'))
assert len(files) == 4, files
for p in files:
    data = p.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', p
    width, height = struct.unpack('>II', data[16:24])
    assert (width, height) == (1080, 1920), (p, width, height)
    print(p, width, height)
PY
