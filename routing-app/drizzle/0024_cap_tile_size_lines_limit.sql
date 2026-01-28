-- Cap line tile size: add LIMIT with ORDER BY ST_Length(geom) DESC for z<6, z<9, z<12
-- (z5 ~2.5MB, z10 ~1.16MB exceed 1MB target)

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
    WITH filtered AS (
      SELECT geom, tags, ST_Length(geom) AS len
      FROM europe_planet_osm_roads
      WHERE geom && envelope
        AND tags->>'highway' IN ('motorway', 'motorway_link', 'trunk', 'trunk_link')
    )
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(ST_Simplify(f.geom, tolerance), envelope, 4096, 64, true) AS geom,
        f.tags
      FROM (SELECT geom, tags FROM filtered ORDER BY len DESC LIMIT 6000) f
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 9 THEN
    WITH filtered AS (
      SELECT geom, tags, ST_Length(geom) AS len
      FROM europe_planet_osm_roads
      WHERE geom && envelope
        AND tags->>'highway' IN ('motorway', 'motorway_link', 'trunk', 'trunk_link',
                                  'primary', 'primary_link', 'secondary', 'secondary_link')
    )
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(ST_Simplify(f.geom, tolerance), envelope, 4096, 64, true) AS geom,
        f.tags
      FROM (SELECT geom, tags FROM filtered ORDER BY len DESC LIMIT 10000) f
    ) AS tile WHERE geom IS NOT NULL;
  ELSIF z < 12 THEN
    WITH filtered AS (
      SELECT geom, tags, ST_Length(geom) AS len
      FROM europe_planet_osm_line
      WHERE geom && envelope
        AND tags->>'highway' IS NOT NULL
    )
    SELECT INTO mvt ST_AsMVT(tile, 'europe_lines', 4096, 'geom') FROM (
      SELECT
        ST_AsMVTGeom(ST_Simplify(f.geom, tolerance), envelope, 4096, 64, true) AS geom,
        f.tags
      FROM (SELECT geom, tags FROM filtered ORDER BY len DESC LIMIT 12000) f
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
