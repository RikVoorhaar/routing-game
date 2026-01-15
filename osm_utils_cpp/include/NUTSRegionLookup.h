#ifndef NUTS_REGION_LOOKUP_H
#define NUTS_REGION_LOOKUP_H

#include <string>
#include <memory>
#include <geos/geom/Geometry.h>
#include <geos/geom/prep/PreparedGeometry.h>
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
    
    // Constructor (public for make_unique)
    NUTSIndex() = default;
    
private:
    
    struct RegionData {
        std::string nuts_id;
        std::string name;
        std::unique_ptr<geos::geom::Geometry> geometry;
        std::unique_ptr<geos::geom::prep::PreparedGeometry> prepared_geom;
    };
    
    std::vector<RegionData> regions_;
    std::unique_ptr<geos::index::strtree::STRtree> spatial_index_;
    
    void build_index();
};

} // namespace NUTSRegionLookup

#endif // NUTS_REGION_LOOKUP_H
