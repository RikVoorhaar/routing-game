#!/bin/bash

set -e

DEFAULT_DB="postgresql://routing_user:routing_password@localhost:5432/routing_game"
DATABASE="${DATABASE_URL:-${DEFAULT_DB}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STYLE_FILE="${SCRIPT_DIR}/osm2pgsql-flex.lua"

OSM_FILE="$1"
PREFIX="$2"

if [ -z "${OSM_FILE}" ] || [ -z "${PREFIX}" ]; then
    echo "Usage: $0 <osm_file> <prefix>"
    echo "Example: $0 ../osm_files/netherlands-latest.osm.pbf netherlands_"
    exit 1
fi

OSM2PGSQL_PREFIX="${PREFIX}" osm2pgsql \
    --database "${DATABASE}" \
    --output flex \
    --style "${STYLE_FILE}" \
    --cache 10000 \
    --number-processes "$(nproc)" \
    "${OSM_FILE}"
