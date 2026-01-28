-- Cap tile size at ~1 MB (0023):
-- - europe_polygons: zoom-based tag filter (no building until z12), stronger simplification, per-tile LIMIT
-- - europe_lines: coarser simplification at z5-8

-- europe_polygons: zoom-based tags + stronger simplification + LIMIT
CREATE OR REPLACE FUNCTION europe_polygons(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
  tolerance float;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);

  IF z < 5 THEN
    tolerance := 200000;
  ELSIF z < 8 THEN
    tolerance := 80000;
  ELSIF z < 11 THEN
    tolerance := 20000;
  ELSIF z < 13 THEN
    tolerance := 4000;
  ELSE
    tolerance := 0;
  END IF;

  IF z < 9 THEN
    WITH filtered AS (
      SELECT
        CASE WHEN tolerance > 0 THEN ST_SimplifyPreserveTopology(geom, tolerance) ELSE geom END AS geom,
        tags,
        ST_Area(geom) AS area
      FROM europe_planet_osm_polygon
      WHERE geom && envelope
        AND (tags ? 'natural' OR tags ? 'water' OR tags ? 'landuse')
    )
    SELECT INTO mvt ST_AsMVT(tile, 'europe_polygons', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(f.geom, envelope, 4096, 64, true) AS geom,
        f.tags
      FROM (SELECT geom, tags FROM filtered ORDER BY area DESC LIMIT 20000) f
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 12 THEN
    WITH filtered AS (
      SELECT
        CASE WHEN tolerance > 0 THEN ST_SimplifyPreserveTopology(geom, tolerance) ELSE geom END AS geom,
        tags,
        ST_Area(geom) AS area
      FROM europe_planet_osm_polygon
      WHERE geom && envelope
        AND (
          tags ? 'natural' OR tags ? 'water' OR tags ? 'landuse'
          OR tags ? 'leisure' OR tags ? 'industrial' OR tags ? 'man_made'
          OR tags ? 'aeroway' OR tags ? 'railway' OR tags ? 'amenity'
        )
    )
    SELECT INTO mvt ST_AsMVT(tile, 'europe_polygons', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(f.geom, envelope, 4096, 64, true) AS geom,
        f.tags
      FROM (SELECT geom, tags FROM filtered ORDER BY area DESC LIMIT 20000) f
    ) AS tile WHERE geom IS NOT NULL;
  ELSE
    WITH filtered AS (
      SELECT
        CASE WHEN tolerance > 0 THEN ST_SimplifyPreserveTopology(geom, tolerance) ELSE geom END AS geom,
        tags,
        ST_Area(geom) AS area
      FROM europe_planet_osm_polygon
      WHERE geom && envelope
        AND (
          tags ? 'natural' OR tags ? 'water' OR tags ? 'landuse'
          OR tags ? 'leisure' OR tags ? 'industrial' OR tags ? 'man_made'
          OR tags ? 'aeroway' OR tags ? 'railway' OR tags ? 'amenity'
          OR tags ? 'building'
        )
    )
    SELECT INTO mvt ST_AsMVT(tile, 'europe_polygons', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(f.geom, envelope, 4096, 64, true) AS geom,
        f.tags
      FROM (SELECT geom, tags FROM filtered ORDER BY area DESC LIMIT 20000) f
    ) AS tile WHERE geom IS NOT NULL;
  END IF;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

-- europe_lines: coarser simplification at z5-8 (50k->80k, 5k->8k)
CREATE OR REPLACE FUNCTION europe_lines(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
  tolerance float;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);

  IF z < 6 THEN
    tolerance := 80000;
  ELSIF z < 9 THEN
    tolerance := 8000;
  ELSIF z < 12 THEN
    tolerance := 500;
  ELSE
    tolerance := 0;
  END IF;

  IF z < 6 THEN
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(ST_Simplify(geom, tolerance), envelope, 4096, 64, true) AS geom,
        tags
      FROM europe_planet_osm_roads
      WHERE geom && envelope
        AND tags->>'highway' IN ('motorway', 'motorway_link', 'trunk', 'trunk_link')
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 9 THEN
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(ST_Simplify(geom, tolerance), envelope, 4096, 64, true) AS geom,
        tags
      FROM europe_planet_osm_roads
      WHERE geom && envelope
        AND tags->>'highway' IN ('motorway', 'motorway_link', 'trunk', 'trunk_link',
                                  'primary', 'primary_link', 'secondary', 'secondary_link')
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 12 THEN
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(ST_Simplify(geom, tolerance), envelope, 4096, 64, true) AS geom,
        tags
      FROM europe_planet_osm_line
      WHERE geom && envelope
        AND tags->>'highway' IS NOT NULL
    ) AS tile WHERE geom IS NOT NULL;
  ELSE
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(geom, envelope, 4096, 64, true) AS geom,
        tags
      FROM europe_planet_osm_line
      WHERE geom && envelope
        AND tags->>'highway' IS NOT NULL
    ) AS tile WHERE geom IS NOT NULL;
  END IF;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;
