#!/usr/bin/env bash
# Generate Europe MBTiles with Planetiler (OpenMapTiles schema).
# Output: routing_server/data/europe.mbtiles (~30–40 GB for z0–15).
# Run can take hours; ensure enough disk space.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$REPO_ROOT/routing_server/data"
OUTPUT="$DATA_DIR/europe.mbtiles"

mkdir -p "$DATA_DIR"

echo "Generating Europe MBTiles (z0–15) into $OUTPUT"
echo "This can take hours and requires ~30–40 GB disk. Cancel with Ctrl+C."
read -r -p "Continue? [y/N] " reply
case "${reply:-n}" in
  [yY][eE][sS]|[yY]) ;;
  *) echo "Aborted."; exit 0 ;;
esac

docker run \
  --user="${UID:-1000}" \
  -e JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx32g}" \
  -v "$DATA_DIR:/data" \
  --rm \
  ghcr.io/onthegomap/planetiler:latest \
  --download \
  --area=europe \
  --minzoom=0 \
  --maxzoom=15 \
  --output=/data/europe.mbtiles

echo "Done: $OUTPUT"
