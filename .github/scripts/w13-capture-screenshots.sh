#!/usr/bin/env bash
set -euo pipefail

mkdir -p store-screenshots /tmp/w13-api/v1

on_error() {
  adb exec-out screencap -p > store-screenshots/failure.png 2>/dev/null || true
  cp /tmp/w13-api-server.log store-screenshots/api-server.log 2>/dev/null || true
  cp /tmp/w13-bootstrap.json store-screenshots/bootstrap.json 2>/dev/null || true
  adb shell uiautomator dump /sdcard/w13-window.xml >/dev/null 2>&1 || true
  adb exec-out cat /sdcard/w13-window.xml > store-screenshots/window.xml 2>/dev/null || true
}
trap on_error ERR

# Snapshot the real current production bootstrap once, then serve that exact response
# locally to the emulator. This avoids relying on emulator outbound networking while
# preserving the real production feature gates used by the app.
curl -fsS --retry 3 --retry-all-errors \
  https://yeki-hast-unique-6ff0.vercel.app/v1/bootstrap \
  -o /tmp/w13-bootstrap.json
python3 - <<'PY'
import json
p = '/tmp/w13-bootstrap.json'
data = json.load(open(p, encoding='utf-8'))
assert data.get('brandName')
features = data.get('features') or {}
assert features.get('callerClosedBetaEnabled') is False, features
print('production bootstrap verified: callerClosedBetaEnabled=false')
PY
cp /tmp/w13-bootstrap.json /tmp/w13-api/v1/bootstrap
python3 -m http.server 8787 --bind 127.0.0.1 --directory /tmp/w13-api > /tmp/w13-api-server.log 2>&1 &
API_PID=$!
trap 'kill "$API_PID" >/dev/null 2>&1 || true' EXIT

adb shell wm size 1080x1920
adb shell wm density 420
adb install -r screenshot-apk/app-release.apk
adb reverse tcp:8787 tcp:8787
sleep 2
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
  cat /tmp/w13-api-server.log >&2 || true
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
  sleep 2
}

wait_text 'یکی هست' 30
wait_text 'وضعیت گفت‌وگو' 20
adb exec-out screencap -p > store-screenshots/01-home.png

tap_text 'وضعیت گفت‌وگو'
wait_text 'گفت‌وگوی عمومی هنوز باز نشده است' 15
adb exec-out screencap -p > store-screenshots/02-caller-closed.png

adb shell am force-stop app.yekihast.mobile
adb shell monkey -p app.yekihast.mobile -c android.intent.category.LAUNCHER 1
wait_text 'می‌خوام شنونده بشم' 20

tap_text 'می‌خوام شنونده بشم'
wait_text 'ادامه با ایمیل' 15
adb exec-out screencap -p > store-screenshots/03-listener-intro.png

tap_text 'ادامه با ایمیل'
wait_text 'ایمیل' 15
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
