#!/bin/sh
# Connect the local adb server to Redroid, then start ws-scrcpy on :8000.
set -e
GW=${REDROID_HOST:-172.18.0.1}
PORT=${REDROID_PORT:-5555}
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  adb connect ${GW}:${PORT} >/dev/null 2>&1 || true
  if adb devices 2>/dev/null | grep -q "${GW}:${PORT}.*device"; then break; fi
  sleep 2
done
adb devices || true
cd /app/dist && exec node index.js
