Martin + PostGIS + MBTiles Basemap Plan (Europe, z≤15)
Overview
Goal:

Use PostGIS (osm2pgsql flex tables) as source.

Add zoom‑aware simplification in Martin’s PostGIS sources.

First test via live Martin server (no export).

Then use martin-cp to export Europe to MBTiles.

Serve MBTiles via Martin and style with MapLibre to look OSM‑like.

Assumptions:

PostGIS DB has tables (SRID 3857):

europe_planet_osm_point

europe_planet_osm_line

europe_planet_osm_polygon

europe_planet_osm_rels
each with geom and tags JSONB.

Martin is already installed and can read PostGIS.
​

0. Files and components
The agent will work with:

martin-config.yaml
Main Martin config (sources, PostGIS DSN, file sources, etc.).
​

PostGIS tables listed above.

Later: europe.mbtiles produced by martin-cp.
​

MapLibre style JSON (e.g. style-europe.json) for frontend.

1. Step 1 – Test zoom-aware simplification with live Martin
1.1. Modify martin-config.yaml – add PostGIS sources
Add one PostGIS source per geometry type. Use zoom‑aware simplification in SQL via Martin placeholders (!zoom!, !bbox_*!). Exact syntax can vary by Martin version; this is a generic pattern.

text
sources:
  europe_lines:
    type: postgis
    connection: postgres://user:pass@localhost:5432/osm
    table: >
      (
        SELECT
          CASE
            WHEN !zoom! < 6  THEN ST_Simplify(geom, 100000)
            WHEN !zoom! < 11 THEN ST_Simplify(geom, 10000)
            ELSE geom
          END AS geom,
          tags
        FROM europe_planet_osm_line
        WHERE ST_Intersects(
          geom,
          ST_MakeEnvelope(!bbox_minx!, !bbox_miny!, !bbox_maxx!, !bbox_maxy!, 3857)
        )
      ) AS t
    geometry_field: geom
    srid: 3857

  europe_polygons:
    type: postgis
    connection: postgres://user:pass@localhost:5432/osm
    table: >
      (
        SELECT
          CASE
            WHEN !zoom! < 6  THEN ST_SimplifyPreserveTopology(geom, 100000)
            WHEN !zoom! < 11 THEN ST_SimplifyPreserveTopology(geom, 10000)
            ELSE geom
          END AS geom,
          tags
        FROM europe_planet_osm_polygon
        WHERE ST_Intersects(
          geom,
          ST_MakeEnvelope(!bbox_minx!, !bbox_miny!, !bbox_maxx!, !bbox_maxy!, 3857)
        )
      ) AS t
    geometry_field: geom
    srid: 3857

  europe_points:
    type: postgis
    connection: postgres://user:pass@localhost:5432/osm
    table: >
      (
        SELECT
          geom,
          tags
        FROM europe_planet_osm_point
        WHERE ST_Intersects(
          geom,
          ST_MakeEnvelope(!bbox_minx!, !bbox_miny!, !bbox_maxx!, !bbox_maxy!, 3857)
        )
      ) AS t
    geometry_field: geom
    srid: 3857

  europe_rels:
    type: postgis
    connection: postgres://user:pass@localhost:5432/osm
    table: >
      (
        SELECT
          CASE
            WHEN !zoom! < 6  THEN ST_SimplifyPreserveTopology(geom, 100000)
            WHEN !zoom! < 11 THEN ST_SimplifyPreserveTopology(geom, 10000)
            ELSE geom
          END AS geom,
          tags
        FROM europe_planet_osm_rels
        WHERE ST_Intersects(
          geom,
          ST_MakeEnvelope(!bbox_minx!, !bbox_miny!, !bbox_maxx!, !bbox_maxy!, 3857)
        )
      ) AS t
    geometry_field: geom
    srid: 3857
Notes:

Use larger tolerances for low zooms to strongly reduce vertices. Adjust numbers as needed.

ST_SimplifyPreserveTopology for polygons/relations to avoid broken polygons.

For production, you’ll likely introduce thematic views (e.g. only highways, only water) rather than raw tables, but this config lets you test the concept.

1.2. Start Martin in live mode
bash
martin --config martin-config.yaml
Martin now serves sources: europe_lines, europe_polygons, europe_points, europe_rels.
​

1.3. Test tiles at different zoom levels
Use curl or a browser:

bash
# low zoom
curl -o z5-lines.pbf "http://localhost:3000/europe_lines/5/16/10.pbf"
curl -o z5-polys.pbf "http://localhost:3000/europe_polygons/5/16/10.pbf"

# higher zoom
curl -o z12-lines.pbf "http://localhost:3000/europe_lines/12/2200/1400.pbf"
curl -o z15-lines.pbf "http://localhost:3000/europe_lines/15/17600/11200.pbf"
Check:

File size: low zoom tiles should be much smaller than high zoom ones if simplification works.

Optionally, connect MapLibre directly to europe_lines/europe_polygons and visually inspect low vs high zoom.

Only proceed once simplification looks correct.

2. Step 2 – Bulk export Europe tiles to MBTiles with martin-cp
After simplification behavior is confirmed in live mode, use martin-cp to copy tiles into MBTiles.
​

2.1. Decide what to export
You have 4 logical layers:

Lines → basemap roads, rail, rivers (line geometry).

Polygons → water, landuse, buildings, etc.

Points → POIs, place labels, etc.

Rels → multipolygons, boundaries, etc.

For an initial basemap, you can:

Export each source into its own MBTiles, or

Define a composite source in Martin that merges all four and export that (more advanced).

Simplest for an agent: export one MBTiles per source first; later, you can optimize/merge.

2.2. Run martin-cp for each source
Example for lines (Europe bbox, z0–15):

bash
martin-cp \
  --config martin-config.yaml \
  --source europe_lines \
  --output-file europe_lines.mbtiles \
  --mbtiles-type normalized \
  --bbox=-31,27,40,82 \
  --min-zoom 0 \
  --max-zoom 15 \
  --concurrency 8 \
  --pool-size 20
Repeat for polygons, points, rels:

bash
martin-cp \
  --config martin-config.yaml \
  --source europe_polygons \
  --output-file europe_polygons.mbtiles \
  --mbtiles-type normalized \
  --bbox=-31,27,40,82 \
  --min-zoom 0 \
  --max-zoom 15

martin-cp \
  --config martin-config.yaml \
  --source europe_points \
  --output-file europe_points.mbtiles \
  --mbtiles-type normalized \
  --bbox=-31,27,40,82 \
  --min-zoom 0 \
  --max-zoom 15

martin-cp \
  --config martin-config.yaml \
  --source europe_rels \
  --output-file europe_rels.mbtiles \
  --mbtiles-type normalized \
  --bbox=-31,27,40,82 \
  --min-zoom 0 \
  --max-zoom 15
Notes:

--bbox uses a Europe bbox in lon/lat as supported by martin-cp.
​

--mbtiles-type normalized is the default sensible choice.
​

You can tune --concurrency and --pool-size based on DB performance.

(If later you want one MBTiles, you can define a composite source in Martin that combines multiple sources, then run martin-cp on that composite.)
​

3. Step 3 – Serve the exported MBTiles with Martin
Once MBTiles files exist (e.g. /data/europe_lines.mbtiles etc.), adjust martin-config.yaml to add file sources:

text
sources:
  europe_lines_mb:
    type: mbtiles
    path: /data/europe_lines.mbtiles

  europe_polygons_mb:
    type: mbtiles
    path: /data/europe_polygons.mbtiles

  europe_points_mb:
    type: mbtiles
    path: /data/europe_points.mbtiles

  europe_rels_mb:
    type: mbtiles
    path: /data/europe_rels.mbtiles
Restart Martin:

bash
martin --config martin-config.yaml
Verify:

Check Martin’s root or /catalog to see the MBTiles sources.

Request a tile:

bash
curl -o z10-lines-mb.pbf "http://localhost:3000/europe_lines_mb/10/550/350.pbf"
Tile content should match what live PostGIS used to serve (including simplification), but now it is static from MBTiles.

4. Step 4 – Frontend styling (MapLibre, OSM-like)
4.1. Create a MapLibre style JSON: style-europe.json
Use four sources (one per MBTiles) or, if you later merge, a single source.

json
{
  "version": 8,
  "sources": {
    "europe_lines": {
      "type": "vector",
      "tiles": [
        "https://your-martin-host/europe_lines_mb/{z}/{x}/{y}.pbf"
      ],
      "maxzoom": 15
    },
    "europe_polygons": {
      "type": "vector",
      "tiles": [
        "https://your-martin-host/europe_polygons_mb/{z}/{x}/{y}.pbf"
      ],
      "maxzoom": 15
    },
    "europe_points": {
      "type": "vector",
      "tiles": [
        "https://your-martin-host/europe_points_mb/{z}/{x}/{y}.pbf"
      ],
      "maxzoom": 15
    }
  },
  "layers": [
    {
      "id": "water",
      "type": "fill",
      "source": "europe_polygons",
      "source-layer": "europe_planet_osm_polygon", 
      "filter": ["==", ["get", "natural"], "water"],
      "paint": {
        "fill-color": "#aad3df"
      }
    },
    {
      "id": "landuse",
      "type": "fill",
      "source": "europe_polygons",
      "source-layer": "europe_planet_osm_polygon",
      "filter": ["in", ["get", "landuse"], "forest", "grass", "park"],
      "paint": {
        "fill-color": [
          "match",
          ["get", "landuse"],
          "forest", "#cdebb0",
          "grass", "#e5f5c0",
          "park", "#c8e6a0",
          "#eaeaea"
        ]
      }
    },
    {
      "id": "roads",
      "type": "line",
      "source": "europe_lines",
      "source-layer": "europe_planet_osm_line",
      "filter": ["has", "highway"],
      "paint": {
        "line-color": [
          "match",
          ["get", "highway"],
          "motorway", "#e892a2",
          "trunk", "#f2b3a3",
          "primary", "#f2d29b",
          "secondary", "#ffffff",
          "#cccccc"
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.5,
          10, 2,
          15, 4
        ]
      }
    }
    // Add more layers: buildings, boundaries, place labels from points, etc.
  ]
}
Adjust source-layer names to whatever is actually in your MVTs (often the PostGIS table name or what Martin config assigns).

4.2. Initialize MapLibre with this style
In frontend JS:

js
const map = new maplibregl.Map({
  container: 'map',
  style: '/path/to/style-europe.json',  // or inline style object
  center: [12, 55],  // e.g. Denmark
  zoom: 6
});
As you refine:

Add more layers and filters for building shapes, admin boundaries, labels, etc.

If you later adopt an OpenMapTiles-like schema, you can switch to an existing OSM-like style JSON and just change the tiles URL.
​

5. Agent checklist (ordered)
Edit martin-config.yaml to add PostGIS sources for all four osm2pgsql tables, with zoom‑aware ST_Simplify/ST_SimplifyPreserveTopology and bbox filtering.

Start Martin and verify live tiles at multiple zooms (file size + visual inspection).

Run martin-cp with --config, --source, --bbox=-31,27,40,82, --min-zoom 0, --max-zoom 15 to generate MBTiles for each source.
​

Update martin-config.yaml to add MBTiles sources pointing to the generated .mbtiles files and restart Martin.
​

Create style-europe.json that:

References MBTiles sources via Martin URLs.

Adds layers for water, landuse, roads, etc. with tag-based filters/expressions.

Wire MapLibre in frontend to use style-europe.json.

Iterate on:

Simplification tolerances per zoom.

Style colors/ordering to approach “vanilla OSM” feel.

This document contains all necessary context and concrete file targets for an agent to implement the pipeline end‑to‑end.

alright, now add a small addendum: a composite source is probably what we want. summarize how we do that.
A composite source lets Martin merge your four PostGIS tables into one logical tileset (one MBTiles), which is usually what you want.

Composite source summary
Define individual PostGIS sources (with simplification) as before:

europe_lines

europe_polygons

europe_points

europe_rels
Each has its own zoom‑aware SQL and bbox filtering in martin-config.yaml.

Add a composite source in martin-config.yaml:

text
sources:
  # existing individual sources ...
  europe_lines:    { ... }
  europe_polygons: { ... }
  europe_points:   { ... }
  europe_rels:     { ... }

  europe_composite:
    type: composite
    sources:
      - europe_polygons
      - europe_lines
      - europe_points
      - europe_rels
europe_composite doesn’t talk to PostGIS directly; it just aggregates tiles from the listed sources into a single logical source.

Test europe_composite in live mode:

bash
martin --config martin-config.yaml

curl -o z10-europe.pbf "http://localhost:3000/europe_composite/10/550/350.pbf"
You should see all layers (polygons, lines, points, rels) in that one tile.

Use martin-cp on the composite, not on each table:

bash
martin-cp \
  --config martin-config.yaml \
  --source europe_composite \
  --output-file europe.mbtiles \
  --mbtiles-type normalized \
  --bbox=-31,27,40,82 \
  --min-zoom 0 \
  --max-zoom 15
This walks all tiles once and copies the merged result into a single europe.mbtiles.
​

Serve that single MBTiles in Martin:

text
sources:
  europe:
    type: mbtiles
    path: /data/europe.mbtiles
Frontend style:

In MapLibre, you now have one vector source:

json
"sources": {
  "europe": {
    "type": "vector",
    "tiles": [
      "https://your-martin-host/europe/{z}/{x}/{y}.pbf"
    ],
    "maxzoom": 15
  }
}
Your layers reference source: "europe" and source-layer values corresponding to each original table/layer (e.g. europe_planet_osm_line, europe_planet_osm_polygon).

This way, you get a single MBTiles file and a single logical source URL, but still keep your current table separation and zoom‑aware simplification logic.