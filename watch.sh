#!/bin/sh
set -e

WATCH_DIR="/data/films"
SCRIPT="/app/scene-maker.js"
EXT="mkv|mp4|avi|mov|flv|wmv|m4v"

trap "exit 0" TERM INT

echo "👀 Surveillance active : $WATCH_DIR"
node "$SCRIPT"

RUNNING=0

inotifywait -m -r \
  --event close_write,move,create \
  --format '%w%f' \
  "$WATCH_DIR" | while read FILE
do
  echo "$FILE" | grep -Ei "\.($EXT)$" >/dev/null || continue
  [ "$RUNNING" -eq 1 ] && continue
  RUNNING=1

  (
    sleep 5
    node "$SCRIPT"
    RUNNING=0
  ) &
done
