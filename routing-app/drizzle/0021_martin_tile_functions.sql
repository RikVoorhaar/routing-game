-- PostgreSQL functions for Martin tile server with zoom-aware simplification
-- These return MVT bytea for each tile request (z, x, y)

-- Helper: Create tile envelope in EPSG:3857
-- (Martin uses ST_TileEnvelope which is available in PostGIS 3.0+)

-- europe_lines: zoom-switched roads/lines with highway filtering
-- z0-5: motorway, trunk only (very sparse)
-- z6-8: add primary, secondary
-- z9-11: add tertiary, other roads
-- z12+: all lines, full detail
CREATE OR REPLACE FUNCTION europe_lines(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
  tolerance float;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);
  
  -- Determine simplification tolerance based on zoom
  IF z < 6 THEN
    tolerance := 50000;  -- 50km at very low zoom
  ELSIF z < 9 THEN
    tolerance := 5000;   -- 5km
  ELSIF z < 12 THEN
    tolerance := 500;    -- 500m
  ELSE
    tolerance := 0;      -- full detail
  END IF;

  IF z < 6 THEN
    -- Very low zoom: motorway and trunk only
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(
          ST_Simplify(geom, tolerance),
          envelope,
          4096, 64, true
        ) AS geom,
        tags
      FROM europe_planet_osm_roads
      WHERE geom && envelope
        AND tags->>'highway' IN ('motorway', 'motorway_link', 'trunk', 'trunk_link')
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 9 THEN
    -- Low zoom: add primary and secondary
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(
          ST_Simplify(geom, tolerance),
          envelope,
          4096, 64, true
        ) AS geom,
        tags
      FROM europe_planet_osm_roads
      WHERE geom && envelope
        AND tags->>'highway' IN ('motorway', 'motorway_link', 'trunk', 'trunk_link', 
                                  'primary', 'primary_link', 'secondary', 'secondary_link')
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 12 THEN
    -- Mid zoom: add tertiary and other roads
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(
          ST_Simplify(geom, tolerance),
          envelope,
          4096, 64, true
        ) AS geom,
        tags
      FROM europe_planet_osm_line
      WHERE geom && envelope
        AND tags->>'highway' IS NOT NULL
    ) AS tile WHERE geom IS NOT NULL;
  ELSE
    -- High zoom: all lines, full detail
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(geom, envelope, 4096, 64, true) AS geom,
        tags
      FROM europe_planet_osm_line
      WHERE geom && envelope
    ) AS tile WHERE geom IS NOT NULL;
  END IF;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

-- europe_polygons: polygons with zoom-aware simplification (preserve topology)
CREATE OR REPLACE FUNCTION europe_polygons(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
  tolerance float;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);
  
  IF z < 6 THEN
    tolerance := 100000;
  ELSIF z < 9 THEN
    tolerance := 10000;
  ELSIF z < 12 THEN
    tolerance := 1000;
  ELSE
    tolerance := 0;
  END IF;

  SELECT INTO mvt ST_AsMVT(tile, 'europe_polygons', 4096, 'geom') FROM (
    SELECT
      ST_AsMVTGeom(
        CASE WHEN tolerance > 0 THEN ST_SimplifyPreserveTopology(geom, tolerance) ELSE geom END,
        envelope,
        4096, 64, true
      ) AS geom,
      tags
    FROM europe_planet_osm_polygon
    WHERE geom && envelope
  ) AS tile WHERE geom IS NOT NULL;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

-- europe_points: points with bbox filtering only (no simplification)
CREATE OR REPLACE FUNCTION europe_points(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);

  SELECT INTO mvt ST_AsMVT(tile, 'europe_points', 4096, 'geom') FROM (
    SELECT
      ST_AsMVTGeom(geom, envelope, 4096, 64, true) AS geom,
      tags
    FROM europe_planet_osm_point
    WHERE geom && envelope
  ) AS tile WHERE geom IS NOT NULL;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

-- europe_rels: relations with zoom-aware simplification
CREATE OR REPLACE FUNCTION europe_rels(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
  tolerance float;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);
  
  IF z < 6 THEN
    tolerance := 100000;
  ELSIF z < 9 THEN
    tolerance := 10000;
  ELSIF z < 12 THEN
    tolerance := 1000;
  ELSE
    tolerance := 0;
  END IF;

  SELECT INTO mvt ST_AsMVT(tile, 'europe_rels', 4096, 'geom') FROM (
    SELECT
      ST_AsMVTGeom(
        CASE WHEN tolerance > 0 THEN ST_SimplifyPreserveTopology(geom, tolerance) ELSE geom END,
        envelope,
        4096, 64, true
      ) AS geom,
      tags
    FROM europe_planet_osm_rels
    WHERE geom && envelope
  ) AS tile WHERE geom IS NOT NULL;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;
