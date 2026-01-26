import { pgTable, jsonb, text, bigint } from 'drizzle-orm/pg-core';

/**
 * OSM tables created by osm2pgsql-flex.
 * These tables are marked as existing in drizzle.config.ts to prevent migrations.
 * 
 * All tables have:
 * - osm_id: bigint (OSM object ID)
 * - tags: jsonb (OSM tags as JSONB)
 * - geom: geometry (PostGIS geometry with SRID 3857)
 */

// OSM point table (nodes)
export const planetOsmPoint = pgTable('planet_osm_point', {
	osmId: bigint('osm_id', { mode: 'number' }).notNull(),
	tags: jsonb('tags').notNull(),
	geom: text('geom').notNull() // geometry(Point, 3857)
});

// OSM line table (ways as linestrings)
export const planetOsmLine = pgTable('planet_osm_line', {
	osmId: bigint('osm_id', { mode: 'number' }).notNull(),
	tags: jsonb('tags').notNull(),
	geom: text('geom').notNull() // geometry(LineString, 3857)
});

// OSM polygon table (ways as polygons/areas)
export const planetOsmPolygon = pgTable('planet_osm_polygon', {
	osmId: bigint('osm_id', { mode: 'number' }).notNull(),
	tags: jsonb('tags').notNull(),
	geom: text('geom').notNull() // geometry(Geometry, 3857) - can be Polygon or MultiPolygon
});

// OSM roads table (highway ways)
export const planetOsmRoads = pgTable('planet_osm_roads', {
	osmId: bigint('osm_id', { mode: 'number' }).notNull(),
	tags: jsonb('tags').notNull(),
	geom: text('geom').notNull() // geometry(LineString, 3857)
});

// OSM relations table
export const planetOsmRels = pgTable('planet_osm_rels', {
	osmId: bigint('osm_id', { mode: 'number' }).notNull(),
	tags: jsonb('tags').notNull(),
	geom: text('geom').notNull() // geometry(Geometry, 3857) - can be MultiPolygon, MultiLineString, etc.
});
