-- Enhanced view for Martin tile server: active_places with category name and region code.
-- Martin auto-discovers PostGIS tables/views with a geometry column.
CREATE OR REPLACE VIEW enhanced_active_places_with_geom AS
SELECT 
    ap.place_id,
    c.name AS category_name,
    r.code AS region_code,
    ap.created_at,
    p.geom
FROM active_places ap
JOIN places p ON ap.place_id = p.id
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN region r ON p.region_id = r.id;
