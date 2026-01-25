-- osm2pgsql flex style file
-- Creates standard planet_osm_* tables with prefix support
-- Uses JSONB for tags

local srid = 3857
local prefix = os.getenv('OSM2PGSQL_PREFIX') or 'planet_osm_'
-- Ensure prefix ends with underscore if not empty
if prefix ~= '' and prefix:sub(-1) ~= '_' then
    prefix = prefix .. '_'
end
local tables = {}

tables.point = osm2pgsql.define_node_table(prefix .. 'planet_osm_point', {
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'point', projection = srid, not_null = true },
})

tables.line = osm2pgsql.define_way_table(prefix .. 'planet_osm_line', {
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'linestring', projection = srid, not_null = true },
})

tables.polygon = osm2pgsql.define_area_table(prefix .. 'planet_osm_polygon', {
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'geometry', projection = srid, not_null = true },
})

tables.roads = osm2pgsql.define_way_table(prefix .. 'planet_osm_roads', {
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'linestring', projection = srid, not_null = true },
})

tables.rels = osm2pgsql.define_relation_table(prefix .. 'planet_osm_rels', {
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'geometry', projection = srid, not_null = true },
})

-- Tag keys to exclude (common internal/import tags)
local delete_keys = {
    -- "mapper" keys
    'attribution',
    'comment',
    'created_by',
    'fixme',
    'note',
    'note:*',
    'odbl',
    'odbl:note',
    'source',
    'source:*',
    'source_ref',
}

-- The osm2pgsql.make_clean_tags_func() function takes the list of keys
-- and key prefixes defined above and returns a function that can be used
-- to clean those tags out of a Lua table. The clean_tags function will
-- return true if it removed all tags from the table.
local clean_tags = osm2pgsql.make_clean_tags_func(delete_keys)

-- Helper function that looks at the tags and decides if this is possibly
-- an area (polygon).
local function has_area_tags(tags)
    if tags.area == 'yes' then
        return true
    end
    if tags.area == 'no' then
        return false
    end

    return tags.aeroway
        or tags.amenity
        or tags.building
        or tags.harbour
        or tags.historic
        or tags.landuse
        or tags.leisure
        or tags.man_made
        or tags.military
        or tags.natural
        or tags.office
        or tags.place
        or tags.power
        or tags.public_transport
        or tags.shop
        or tags.sport
        or tags.tourism
        or tags.water
        or tags.waterway
        or tags.wetland
        or tags['abandoned:aeroway']
        or tags['abandoned:amenity']
        or tags['abandoned:building']
        or tags['abandoned:landuse']
        or tags['abandoned:power']
        or tags['area:highway']
        or tags['building:part']
end

-- Process nodes (points)
function osm2pgsql.process_node(object)
    if clean_tags(object.tags) then
        return
    end

    tables.point:insert({
        tags = object.tags,
        geom = object:as_point()
    })
end

-- Process ways (lines and polygons)
function osm2pgsql.process_way(object)
    if clean_tags(object.tags) then
        return
    end

    -- Check if it's a highway (road) for the roads table
    local is_highway = object.tags.highway and object.tags.highway ~= ''

    -- Check if it's an area (polygon)
    if object.is_closed and has_area_tags(object.tags) then
        tables.polygon:insert({
            tags = object.tags,
            geom = object:as_polygon()
        })
    else
        tables.line:insert({
            tags = object.tags,
            geom = object:as_linestring()
        })
    end

    -- Add to roads table if it's a highway (for rendering optimization)
    if is_highway then
        tables.roads:insert({
            tags = object.tags,
            geom = object:as_linestring()
        })
    end
end

function osm2pgsql.process_relation(object)
    if clean_tags(object.tags) then
        return
    end

    local relation_type = object:grab_tag('type')
    
    if relation_type == 'multipolygon' then
        tables.rels:insert({
            tags = object.tags,
            geom = object:as_multipolygon()
        })
    elseif relation_type == 'route' then
        local geom = object:as_multilinestring()
        if geom then
            tables.rels:insert({
                tags = object.tags,
                geom = geom
            })
        end
    elseif relation_type == 'boundary' or (relation_type == 'multipolygon' and object.tags.boundary) then
        local geom = object:as_multilinestring()
        if geom then
            tables.rels:insert({
                tags = object.tags,
                geom = geom:line_merge()
            })
        end
    else
        -- Try to store other relations with geometry
        local geom = object:as_multipolygon()
        if not geom then
            geom = object:as_multilinestring()
        end
        if geom then
            tables.rels:insert({
                tags = object.tags,
                geom = geom
            })
        end
    end
end
