#ifndef ROUTABLE_WAYS_H
#define ROUTABLE_WAYS_H

#include <string>
#include <unordered_set>
#include <osmium/osm/tag.hpp>

namespace RoutableWays {

// Highway types that are frequently occurring and routable
// Based on Utrecht analysis - including types with > 0.1% frequency
const std::unordered_set<std::string> ROUTABLE_HIGHWAY_TYPES = {
    // Main road types (high priority)
    "motorway", "trunk", "primary", "secondary", "tertiary", 
    "unclassified", "residential",
    
    // Link roads
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
    
    // Special road types (medium priority)
    "living_street", "service", "busway",
    
    // Paths and tracks (lower priority, but numerous)
    "track", "path", "footway", "cycleway", "bridleway",
    
    // Pedestrian infrastructure
    "pedestrian", "steps",
    
    // Other routable types that appear in data
    "construction",  // Roads under construction but might be passable
};

// Highway types to exclude even if they appear in the data
const std::unordered_set<std::string> EXCLUDED_HIGHWAY_TYPES = {
    "platform",     // Railway/bus platforms
    "proposed",     // Proposed roads that don't exist yet
    "services",     // Service areas
    "elevator",     // Elevators
    "bus_stop",     // Bus stops
    "rest_area",    // Rest areas
    "raceway",      // Race tracks (private)
};

/**
 * Determine if a way is routable based on frequently occurring highway types.
 * 
 * This is a more focused version that only includes highway types that actually
 * appear frequently in real OSM data and are useful for routing.
 */
inline bool is_routable_way(const osmium::TagList& tags) {
    std::string highway;
    
    // Extract highway tag
    const char* highway_value = tags.get_value_by_key("highway");
    if (highway_value) {
        highway = std::string(highway_value);
    }
    
    // Check if it's a routable highway type
    if (ROUTABLE_HIGHWAY_TYPES.find(highway) != ROUTABLE_HIGHWAY_TYPES.end()) {
        // Check access restrictions
        const char* access_value = tags.get_value_by_key("access");
        const char* motor_vehicle_value = tags.get_value_by_key("motor_vehicle");
        const char* vehicle_value = tags.get_value_by_key("vehicle");
        
        std::string access = access_value ? std::string(access_value) : "";
        std::string motor_vehicle = motor_vehicle_value ? std::string(motor_vehicle_value) : "";
        std::string vehicle = vehicle_value ? std::string(vehicle_value) : "";
        
        // If explicitly forbidden for all access, skip
        if (access == "no" || access == "private") {
            return false;
        }
        if (motor_vehicle == "no" || motor_vehicle == "private") {
            return false;
        }
        if (vehicle == "no" || vehicle == "private") {
            return false;
        }
        
        return true;
    }
    
    return false;
}

} // namespace RoutableWays

#endif // ROUTABLE_WAYS_H

