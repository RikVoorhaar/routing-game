#!/usr/bin/env bash
# Planetiler: download Europe OSM + aux, build MBTiles. Output: routing_server/data/europe.mbtiles
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$REPO_ROOT/routing_server/data"
mkdir -p "$DATA_DIR"

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

echo "Done: $DATA_DIR/europe.mbtiles"
