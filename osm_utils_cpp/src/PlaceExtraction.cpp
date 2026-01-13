#include "PlaceExtraction.h"
#include <osmium/osm/tag.hpp>
#include <osmium/osm/location.hpp>
#include <nlohmann/json.hpp>
#include <cmath>
#include <vector>
#include <string>

namespace PlaceExtraction {

std::string tags_to_json(const osmium::TagList& tags) {
    nlohmann::json j;
    for (const auto& tag : tags) {
        j[tag.key()] = tag.value();
    }
    return j.dump();
}

std::string csv_escape(const std::string& str) {
    std::string result;
    result.reserve(str.size() + 10); // Reserve some extra space
    for (char c : str) {
        if (c == '"') {
            result += "\"\""; // Double the quote
        } else {
            result += c;
        }
    }
    return result;
}

std::pair<double, double> wgs84_to_web_mercator(double lat, double lon) {
    // Web Mercator constants
    constexpr double WEB_MERCATOR_MAX_LAT_DEG = 85.05112878;
    constexpr double WEB_MERCATOR_EARTH_RADIUS_M = 6378137.0;
    
    // Clamp to valid latitude range
    if (lat > WEB_MERCATOR_MAX_LAT_DEG) {
        lat = WEB_MERCATOR_MAX_LAT_DEG;
    } else if (lat < -WEB_MERCATOR_MAX_LAT_DEG) {
        lat = -WEB_MERCATOR_MAX_LAT_DEG;
    }
    
    const double lat_rad = lat * M_PI / 180.0;
    const double lon_rad = lon * M_PI / 180.0;
    
    const double x = WEB_MERCATOR_EARTH_RADIUS_M * lon_rad;
    const double y = WEB_MERCATOR_EARTH_RADIUS_M * std::log(std::tan((M_PI / 4.0) + (lat_rad / 2.0)));
    
    return std::make_pair(x, y);
}

osmium::Location compute_centroid(const std::vector<osmium::Location>& locations) {
    if (locations.empty()) {
        return osmium::Location();
    }
    
    double sum_lat = 0.0;
    double sum_lon = 0.0;
    size_t valid_count = 0;
    
    for (const auto& loc : locations) {
        if (loc.valid()) {
            sum_lat += loc.lat();
            sum_lon += loc.lon();
            valid_count++;
        }
    }
    
    if (valid_count == 0) {
        return osmium::Location();
    }
    
    // osmium::Location constructor takes (lon, lat), not (lat, lon)
    return osmium::Location(sum_lon / valid_count, sum_lat / valid_count);
}

} // namespace PlaceExtraction
