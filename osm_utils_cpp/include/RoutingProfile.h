#ifndef ROUTING_PROFILE_H
#define ROUTING_PROFILE_H

#include <osmium/osm/tag.hpp>
#include <cstring>
#include <string>

namespace RoutingProfile {

// Helper function for string equality (matches RoutingKit's str_eq)
inline bool str_eq(const char* l, const char* r) {
    return !std::strcmp(l, r);
}

// Check if way is used by cars (replicates RoutingKit::is_osm_way_used_by_cars)
// Reference: RoutingKit/src/osm_profile.cpp lines 174-263
inline bool is_osm_way_used_by_cars(const osmium::TagList& tags) {
    const char* junction = tags.get_value_by_key("junction");
    if (junction != nullptr) {
        return true;
    }

    const char* route = tags.get_value_by_key("route");
    if (route && str_eq(route, "ferry")) {
        return true;
    }

    const char* ferry = tags.get_value_by_key("ferry");
    if (ferry && str_eq(ferry, "yes")) {
        return true;
    }

    const char* highway = tags.get_value_by_key("highway");
    if (highway == nullptr) {
        return false;
    }

    const char* motorcar = tags.get_value_by_key("motorcar");
    if (motorcar && str_eq(motorcar, "no")) {
        return false;
    }

    const char* motor_vehicle = tags.get_value_by_key("motor_vehicle");
    if (motor_vehicle && str_eq(motor_vehicle, "no")) {
        return false;
    }

    const char* access = tags.get_value_by_key("access");
    if (access) {
        if (!(str_eq(access, "yes") || str_eq(access, "permissive") || 
              str_eq(access, "delivery") || str_eq(access, "designated") || 
              str_eq(access, "destination"))) {
            return false;
        }
    }

    if (str_eq(highway, "motorway") || str_eq(highway, "trunk") ||
        str_eq(highway, "primary") || str_eq(highway, "secondary") ||
        str_eq(highway, "tertiary") || str_eq(highway, "unclassified") ||
        str_eq(highway, "residential") || str_eq(highway, "service") ||
        str_eq(highway, "motorway_link") || str_eq(highway, "trunk_link") ||
        str_eq(highway, "primary_link") || str_eq(highway, "secondary_link") ||
        str_eq(highway, "tertiary_link") || str_eq(highway, "motorway_junction") ||
        str_eq(highway, "living_street") || str_eq(highway, "track") ||
        str_eq(highway, "ferry")) {
        return true;
    }

    if (str_eq(highway, "bicycle_road")) {
        auto motorcar_val = tags.get_value_by_key("motorcar");
        if (motorcar_val != nullptr) {
            if (str_eq(motorcar_val, "yes")) {
                return true;
            }
        }
        return false;
    }

    if (str_eq(highway, "construction") || str_eq(highway, "path") ||
        str_eq(highway, "footway") || str_eq(highway, "cycleway") ||
        str_eq(highway, "bridleway") || str_eq(highway, "pedestrian") ||
        str_eq(highway, "bus_guideway") || str_eq(highway, "raceway") ||
        str_eq(highway, "escape") || str_eq(highway, "steps") ||
        str_eq(highway, "proposed") || str_eq(highway, "conveying")) {
        return false;
    }

    const char* oneway = tags.get_value_by_key("oneway");
    if (oneway != nullptr) {
        if (str_eq(oneway, "reversible") || str_eq(oneway, "alternating")) {
            return false;
        }
    }

    const char* maxspeed = tags.get_value_by_key("maxspeed");
    if (maxspeed != nullptr) {
        return true;
    }

    return false;
}

// Check if way is used by bicycles (replicates RoutingKit::is_osm_way_used_by_bicycles)
// Reference: RoutingKit/src/osm_profile.cpp lines 470-550
inline bool is_osm_way_used_by_bicycles(const osmium::TagList& tags) {
    const char* junction = tags.get_value_by_key("junction");
    if (junction != nullptr) {
        return true;
    }

    const char* route = tags.get_value_by_key("route");
    if (route != nullptr && str_eq(route, "ferry")) {
        return true;
    }

    const char* ferry = tags.get_value_by_key("ferry");
    if (ferry != nullptr && str_eq(ferry, "ferry")) {
        return true;
    }

    const char* highway = tags.get_value_by_key("highway");
    if (highway == nullptr) {
        return false;
    }

    if (str_eq(highway, "proposed")) {
        return false;
    }

    const char* access = tags.get_value_by_key("access");
    if (access) {
        if (!(str_eq(access, "yes") || str_eq(access, "permissive") ||
              str_eq(access, "delivery") || str_eq(access, "designated") ||
              str_eq(access, "destination") || str_eq(access, "agricultural") ||
              str_eq(access, "forestry") || str_eq(access, "public"))) {
            return false;
        }
    }

    const char* bicycle = tags.get_value_by_key("bicycle");
    if (bicycle && (str_eq(bicycle, "no") || str_eq(bicycle, "use_sidepath"))) {
        return false;
    }

    // If a cycleway is specified we can be sure that the highway will be used
    const char* cycleway = tags.get_value_by_key("cycleway");
    if (cycleway != nullptr) {
        return true;
    }
    const char* cycleway_left = tags.get_value_by_key("cycleway:left");
    if (cycleway_left != nullptr) {
        return true;
    }
    const char* cycleway_right = tags.get_value_by_key("cycleway:right");
    if (cycleway_right != nullptr) {
        return true;
    }
    const char* cycleway_both = tags.get_value_by_key("cycleway:both");
    if (cycleway_both != nullptr) {
        return true;
    }

    if (str_eq(highway, "secondary") || str_eq(highway, "tertiary") ||
        str_eq(highway, "unclassified") || str_eq(highway, "residential") ||
        str_eq(highway, "service") || str_eq(highway, "secondary_link") ||
        str_eq(highway, "tertiary_link") || str_eq(highway, "living_street") ||
        str_eq(highway, "track") || str_eq(highway, "bicycle_road") ||
        str_eq(highway, "primary") || str_eq(highway, "primary_link") ||
        str_eq(highway, "path") || str_eq(highway, "footway") ||
        str_eq(highway, "cycleway") || str_eq(highway, "bridleway") ||
        str_eq(highway, "pedestrian") || str_eq(highway, "crossing") ||
        str_eq(highway, "escape") || str_eq(highway, "steps") ||
        str_eq(highway, "ferry")) {
        return true;
    }

    return false;
}

// Check if way is used by pedestrians (replicates RoutingKit::is_osm_way_used_by_pedestrians)
// Reference: RoutingKit/src/osm_profile.cpp lines 67-172
inline bool is_osm_way_used_by_pedestrians(const osmium::TagList& tags) {
    const char* junction = tags.get_value_by_key("junction");
    if (junction != nullptr) {
        return true;
    }

    const char* route = tags.get_value_by_key("route");
    if (route && str_eq(route, "ferry")) {
        return true;
    }

    const char* ferry = tags.get_value_by_key("ferry");
    if (ferry && str_eq(ferry, "ferry")) {
        return true;
    }

    const char* public_transport = tags.get_value_by_key("public_transport");
    if (public_transport != nullptr &&
        (str_eq(public_transport, "stop_position") ||
         str_eq(public_transport, "platform") ||
         str_eq(public_transport, "stop_area") ||
         str_eq(public_transport, "station"))) {
        return true;
    }

    const char* railway = tags.get_value_by_key("railway");
    if (railway != nullptr &&
        (str_eq(railway, "halt") || str_eq(railway, "platform") ||
         str_eq(railway, "subway_entrance") || str_eq(railway, "station") ||
         str_eq(railway, "tram_stop"))) {
        return true;
    }

    const char* highway = tags.get_value_by_key("highway");
    if (highway == nullptr) {
        return false;
    }

    const char* access = tags.get_value_by_key("access");
    if (access) {
        if (!(str_eq(access, "yes") || str_eq(access, "permissive") ||
              str_eq(access, "delivery") || str_eq(access, "designated") ||
              str_eq(access, "destination") || str_eq(access, "agricultural") ||
              str_eq(access, "forestry") || str_eq(access, "public"))) {
            return false;
        }
    }

    const char* crossing = tags.get_value_by_key("crossing");
    if (crossing != nullptr && str_eq(crossing, "no")) {
        return false;
    }

    if (str_eq(highway, "secondary") || str_eq(highway, "tertiary") ||
        str_eq(highway, "unclassified") || str_eq(highway, "residential") ||
        str_eq(highway, "service") || str_eq(highway, "secondary_link") ||
        str_eq(highway, "tertiary_link") || str_eq(highway, "living_street") ||
        str_eq(highway, "track") || str_eq(highway, "bicycle_road") ||
        str_eq(highway, "path") || str_eq(highway, "footway") ||
        str_eq(highway, "cycleway") || str_eq(highway, "bridleway") ||
        str_eq(highway, "pedestrian") || str_eq(highway, "escape") ||
        str_eq(highway, "steps") || str_eq(highway, "crossing") ||
        str_eq(highway, "escalator") || str_eq(highway, "elevator") ||
        str_eq(highway, "platform") || str_eq(highway, "ferry")) {
        return true;
    }

    if (str_eq(highway, "motorway") || str_eq(highway, "motorway_link") ||
        str_eq(highway, "motorway_junction") || str_eq(highway, "trunk") ||
        str_eq(highway, "trunk_link") || str_eq(highway, "primary") ||
        str_eq(highway, "primary_link") || str_eq(highway, "construction") ||
        str_eq(highway, "bus_guideway") || str_eq(highway, "raceway") ||
        str_eq(highway, "proposed") || str_eq(highway, "conveying")) {
        return false;
    }

    return false;
}

// Main function: Check if way is routable for RoutingKit (matches routing server's custom profile)
// Reference: routing_server/src/RoutingEngine.cpp lines 82-198
inline bool is_routable_for_routingkit(const osmium::TagList& tags) {
    // First check RoutingKit's built-in profiles (cars, bicycles, pedestrians)
    if (is_osm_way_used_by_cars(tags)) {
        return true;
    }
    
    if (is_osm_way_used_by_bicycles(tags)) {
        return true;
    }
    
    if (is_osm_way_used_by_pedestrians(tags)) {
        return true;
    }
    
    // Fallback: Check additional highway types from custom profile
    const char* highway_value = tags.get_value_by_key("highway");
    if (highway_value != nullptr) {
        std::string highway_str(highway_value);
        
        // Main road types
        if (highway_str == "motorway" || highway_str == "trunk" || highway_str == "primary" ||
            highway_str == "secondary" || highway_str == "tertiary" || highway_str == "unclassified" ||
            highway_str == "residential") {
            return true;
        }
        
        // Link roads
        if (highway_str == "motorway_link" || highway_str == "trunk_link" || highway_str == "primary_link" ||
            highway_str == "secondary_link" || highway_str == "tertiary_link") {
            return true;
        }
        
        // Special road types
        if (highway_str == "living_street" || highway_str == "service" || highway_str == "pedestrian" ||
            highway_str == "track" || highway_str == "bus_guideway" || highway_str == "busway" ||
            highway_str == "raceway" || highway_str == "road" || highway_str == "construction" ||
            highway_str == "escape") {
            return true;
        }
        
        // Paths
        if (highway_str == "path" || highway_str == "footway" || highway_str == "cycleway" ||
            highway_str == "bridleway" || highway_str == "steps" || highway_str == "corridor") {
            return true;
        }
        
        // Other highway features
        if (highway_str == "bus_stop" || highway_str == "crossing" || highway_str == "emergency_access_point" ||
            highway_str == "give_way" || highway_str == "mini_roundabout" || highway_str == "motorway_junction" ||
            highway_str == "passing_place" || highway_str == "platform" || highway_str == "rest_area" ||
            highway_str == "services" || highway_str == "speed_camera" || highway_str == "stop" ||
            highway_str == "street_lamp" || highway_str == "traffic_signals" || highway_str == "turning_circle" ||
            highway_str == "turning_loop") {
            return true;
        }
        
        // Lifecycle states
        if (highway_str == "proposed" || highway_str == "planned" || highway_str == "abandoned" ||
            highway_str == "disused" || highway_str == "razed") {
            return true;
        }
        
        // Additional types
        if (highway_str == "via_ferrata" || highway_str == "elevator" || highway_str == "escalator") {
            return true;
        }
    }
    
    // Also include railway platforms and other transport infrastructure
    const char* railway_value = tags.get_value_by_key("railway");
    if (railway_value != nullptr && str_eq(railway_value, "platform")) {
        return true;
    }
    
    // Include public transport platforms
    const char* public_transport_value = tags.get_value_by_key("public_transport");
    if (public_transport_value != nullptr && str_eq(public_transport_value, "platform")) {
        return true;
    }
    
    return false;
}

} // namespace RoutingProfile

#endif // ROUTING_PROFILE_H
