#!/usr/bin/env bash
# Generate Europe MBTiles with Planetiler (OpenMapTiles schema).
# Uses a local OSM PBF from osm_files/. With --download=true and --osm_path set, Planetiler
# downloads only aux sources (lake_centerline, water_polygons, natural_earth), not OSM.
# Output: routing_server/data/europe.mbtiles (~30–40 GB for z0–15).
# Before re-runs: rm -rf routing_server/data/tmp && rm -f routing_server/data/europe.mbtiles
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$REPO_ROOT/routing_server/data"
OSM_FILES_DIR="$REPO_ROOT/osm_files"
OUTPUT="$DATA_DIR/europe.mbtiles"
OSM_PBF="${OSM_PBF:-europe-latest.osm.pbf}"
OSM_PATH="$OSM_FILES_DIR/$OSM_PBF"

mkdir -p "$DATA_DIR"
if [[ ! -f "$OSM_PATH" ]]; then
  echo "Missing OSM PBF: $OSM_PATH"
  echo "Put Europe PBF in osm_files/ or set OSM_PBF=yourfile.osm.pbf"
  exit 1
fi

echo "Generating Europe MBTiles (z0–15) into $OUTPUT"
echo "Input PBF: $OSM_PATH"
echo "This can take hours; needs ~30–40 GB disk and ~44 GB RAM. Cancel with Ctrl+C."
read -r -p "Continue? [y/N] " reply
case "${reply:-n}" in
  [yY][eE][sS]|[yY]) ;;
  *) echo "Aborted."; exit 0 ;;
esac

# PBF from osm_files (read-only mount); output/tmp and sources/ in routing_server/data.
docker run \
  --user="${UID:-1000}" \
  -e JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx44g}" \
  -v "$DATA_DIR:/data" \
  -v "$OSM_FILES_DIR:/data/osm_input:ro" \
  --rm \
  ghcr.io/onthegomap/planetiler:latest \
  --download=true \
  --osm_path="/data/osm_input/$OSM_PBF" \
  --osm_lazy_reads=false \
  --minzoom=0 \
  --maxzoom=15 \
  --output=/data/europe.mbtiles

echo "Done: $OUTPUT"
