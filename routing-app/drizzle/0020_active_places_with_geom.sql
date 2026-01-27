-- View for Martin tile server: active_places joined with places to expose geometry.
-- Martin auto-discovers PostGIS tables/views with a geometry column.
CREATE VIEW active_places_with_geom AS
SELECT ap.place_id, ap.region_id, ap.category_id, ap.created_at, p.geom
FROM active_places ap
JOIN places p ON ap.place_id = p.id;
