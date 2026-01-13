#ifndef PLACE_EXTRACTION_H
#define PLACE_EXTRACTION_H

#include <osmium/osm/tag.hpp>
#include <osmium/osm/location.hpp>
#include <nlohmann/json.hpp>
#include <string>

namespace PlaceExtraction {

// Serialize tags to JSON object using nlohmann/json
std::string tags_to_json(const osmium::TagList& tags);

// Escape CSV field - double quotes inside quoted fields
std::string csv_escape(const std::string& str);

// Convert WGS84 lat/lon to Web Mercator (EPSG:3857)
// Returns (x, y) in meters
std::pair<double, double> wgs84_to_web_mercator(double lat, double lon);

// Compute centroid from a list of locations
osmium::Location compute_centroid(const std::vector<osmium::Location>& locations);

} // namespace PlaceExtraction

#endif // PLACE_EXTRACTION_H
