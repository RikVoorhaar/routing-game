-- Refinements to Martin tile functions (0021):
-- - europe_lines: add highway IS NOT NULL at z12+ (exclude power lines, barriers, etc.)
-- - europe_polygons: thematic tag filter (place_categories-inspired) + tuned tolerances

-- europe_lines: highway-only at z12+
CREATE OR REPLACE FUNCTION europe_lines(z integer, x integer, y integer)
RETURNS bytea AS $$
DECLARE
  mvt bytea;
  envelope geometry;
  tolerance float;
BEGIN
  envelope := ST_TileEnvelope(z, x, y);
  
  IF z < 6 THEN
    tolerance := 50000;
  ELSIF z < 9 THEN
    tolerance := 5000;
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

-- europe_polygons: tag filter + tuned tolerances
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
    tolerance := 50000;
  ELSIF z < 11 THEN
    tolerance := 10000;
  ELSIF z < 13 THEN
    tolerance := 2000;
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
      AND (
        tags ? 'landuse'
        OR tags ? 'natural'
        OR tags ? 'water'
        OR tags ? 'building'
        OR tags ? 'leisure'
        OR tags ? 'amenity'
        OR tags ? 'industrial'
        OR tags ? 'man_made'
        OR tags ? 'aeroway'
        OR tags ? 'railway'
      )
  ) AS tile WHERE geom IS NOT NULL;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;
