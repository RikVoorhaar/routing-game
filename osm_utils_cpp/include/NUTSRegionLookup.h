#ifndef NUTS_REGION_LOOKUP_H
#define NUTS_REGION_LOOKUP_H

#include <string>
#include <memory>
#include <chrono>
#include <map>
#include <geos/geom/Geometry.h>
#include <geos/index/strtree/STRtree.h>

namespace NUTSRegionLookup {

class NUTSIndex {
public:
    // Create NUTSIndex from GeoJSON file
    static std::unique_ptr<NUTSIndex> from_geojson_file(const std::string& geojson_path);
    
    // Find the NUTS region containing a WGS84 latitude/longitude point
    // Returns NUTS2 region code (4 characters like "NL31") or empty string if not found
    std::string lookup_wgs84(double lat, double lon);
    
    // Find the NUTS region containing a Web Mercator point
    // Returns NUTS2 region code (4 characters like "NL31") or empty string if not found
    std::string lookup_web_mercator(double x, double y);
    
    // Get statistics
    uint64_t get_lookup_count() const { return lookup_count_; }
    uint64_t get_candidate_count() const { return candidate_count_; }
    uint64_t get_query_time_ns() const { return query_time_ns_; }
    uint64_t get_contains_time_ns() const { return contains_time_ns_; }
    uint64_t get_total_time_ns() const { return total_time_ns_; }
    std::map<std::string, uint64_t> get_region_times_ns() const { return region_times_ns_; }
    std::map<std::string, uint64_t> get_region_counts() const { return region_counts_; }
    
    // Constructor (public for make_unique)
    NUTSIndex() = default;
    
private:
    
    struct RegionData {
        std::string nuts_id;
        std::string name;
        std::unique_ptr<geos::geom::Geometry> geometry;
    };
    
    std::vector<RegionData> regions_;
    std::unique_ptr<geos::index::strtree::STRtree> spatial_index_;
    
    // Statistics
    uint64_t lookup_count_ = 0;
    uint64_t candidate_count_ = 0;
    uint64_t query_time_ns_ = 0;
    uint64_t contains_time_ns_ = 0;
    uint64_t total_time_ns_ = 0;
    std::map<std::string, uint64_t> region_times_ns_;
    std::map<std::string, uint64_t> region_counts_;
    
    void build_index();
};

} // namespace NUTSRegionLookup

#endif // NUTS_REGION_LOOKUP_H
