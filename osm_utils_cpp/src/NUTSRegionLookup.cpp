#include "NUTSRegionLookup.h"
#include "PlaceExtraction.h"
#include <fstream>
#include <nlohmann/json.hpp>
#include <geos/geom/GeometryFactory.h>
#include <geos/geom/Point.h>
#include <geos/geom/Polygon.h>
#include <geos/geom/MultiPolygon.h>
#include <geos/geom/LinearRing.h>
#include <geos/geom/CoordinateSequenceFactory.h>
#include <geos/geom/CoordinateSequence.h>
#include <geos/index/strtree/STRtree.h>
#include <memory>
#include <stdexcept>
#include <sstream>
#include <chrono>

namespace NUTSRegionLookup {

namespace {
    // Helper to create a LinearRing from coordinates
    std::unique_ptr<geos::geom::LinearRing> create_linear_ring(
        geos::geom::GeometryFactory* factory,
        const nlohmann::json& coords) {
        
        auto seq_factory = factory->getCoordinateSequenceFactory();
        std::vector<geos::geom::Coordinate> coords_vec;
        coords_vec.reserve(coords.size() + 1);
        
        for (const auto& point : coords) {
            double x = point[0].get<double>();
            double y = point[1].get<double>();
            coords_vec.emplace_back(x, y);
        }
        
        // Close the ring if not already closed
        if (!coords_vec.empty()) {
            const auto& first = coords_vec[0];
            const auto& last = coords_vec.back();
            if (first.x != last.x || first.y != last.y) {
                coords_vec.push_back(first);
            }
        }
        
        auto seq = seq_factory->create(coords_vec.size(), 2);
        for (size_t i = 0; i < coords_vec.size(); ++i) {
            seq->setAt(coords_vec[i], i);
        }
        
        return factory->createLinearRing(std::move(seq));
    }
    
    // Helper to convert GeoJSON Polygon to GEOS Polygon
    std::unique_ptr<geos::geom::Polygon> geojson_polygon_to_geos(
        geos::geom::GeometryFactory* factory,
        const nlohmann::json& coords) {
        
        if (coords.empty() || !coords[0].is_array()) {
            return nullptr;
        }
        
        // First ring is exterior, rest are holes
        auto exterior = create_linear_ring(factory, coords[0]);
        if (!exterior) {
            return nullptr;
        }
        
        std::vector<std::unique_ptr<geos::geom::LinearRing>> holes;
        for (size_t i = 1; i < coords.size(); ++i) {
            auto hole = create_linear_ring(factory, coords[i]);
            if (hole) {
                holes.push_back(std::move(hole));
            }
        }
        
        return factory->createPolygon(std::move(exterior), std::move(holes));
    }
    
    // Helper to convert GeoJSON MultiPolygon to GEOS MultiPolygon
    std::unique_ptr<geos::geom::MultiPolygon> geojson_multipolygon_to_geos(
        geos::geom::GeometryFactory* factory,
        const nlohmann::json& coords) {
        
        std::vector<std::unique_ptr<geos::geom::Polygon>> polygons;
        
        for (const auto& poly_coords : coords) {
            auto poly = geojson_polygon_to_geos(factory, poly_coords);
            if (poly) {
                polygons.push_back(std::move(poly));
            }
        }
        
        return factory->createMultiPolygon(std::move(polygons));
    }
    
    // Helper to convert GeoJSON geometry to GEOS geometry
    std::unique_ptr<geos::geom::Geometry> geojson_to_geos(
        geos::geom::GeometryFactory* factory,
        const nlohmann::json& geom_json) {
        
        std::string type = geom_json.value("type", "");
        auto coords = geom_json.value("coordinates", nlohmann::json::array());
        
        if (type == "Polygon") {
            auto poly = geojson_polygon_to_geos(factory, coords);
            return std::unique_ptr<geos::geom::Geometry>(poly.release());
        } else if (type == "MultiPolygon") {
            auto mpoly = geojson_multipolygon_to_geos(factory, coords);
            return std::unique_ptr<geos::geom::Geometry>(mpoly.release());
        }
        
        throw std::runtime_error("Unsupported geometry type: " + type);
    }
}

std::unique_ptr<NUTSIndex> NUTSIndex::from_geojson_file(const std::string& geojson_path) {
    std::ifstream file(geojson_path);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open GeoJSON file: " + geojson_path);
    }
    
    nlohmann::json data;
    file >> data;
    
    auto index = std::make_unique<NUTSIndex>();
    static geos::geom::GeometryFactory::Ptr factory = geos::geom::GeometryFactory::create();
    
    auto features = data.value("features", nlohmann::json::array());
    for (const auto& feat : features) {
        auto props = feat.value("properties", nlohmann::json::object());
        
        // Support both formats: "id"/"na" (Nuts2json) and "NUTS_ID"/"NUTS_NAME" (Eurostat)
        std::string nuts_id;
        if (props.contains("id") && props["id"].is_string()) {
            nuts_id = props["id"].get<std::string>();
        } else if (props.contains("NUTS_ID") && props["NUTS_ID"].is_string()) {
            nuts_id = props["NUTS_ID"].get<std::string>();
        }
        
        if (nuts_id.empty()) {
            continue;
        }
        
        std::string name;
        if (props.contains("na") && props["na"].is_string()) {
            name = props["na"].get<std::string>();
        } else if (props.contains("NUTS_NAME") && props["NUTS_NAME"].is_string()) {
            name = props["NUTS_NAME"].get<std::string>();
        } else if (props.contains("NAME_LATN") && props["NAME_LATN"].is_string()) {
            name = props["NAME_LATN"].get<std::string>();
        }
        
        auto geom_json = feat.value("geometry", nlohmann::json::object());
        if (geom_json.empty()) {
            continue;
        }
        
        try {
            auto geometry = geojson_to_geos(factory.get(), geom_json);
            if (geometry && !geometry->isEmpty()) {
                RegionData region;
                region.nuts_id = nuts_id;
                region.name = name;
                region.geometry = std::move(geometry);
                index->regions_.push_back(std::move(region));
            }
        } catch (const std::exception& e) {
            // Skip invalid geometries
            continue;
        }
    }
    
    index->build_index();
    return index;
}

void NUTSIndex::build_index() {
    spatial_index_ = std::make_unique<geos::index::strtree::STRtree>();
    
    for (size_t i = 0; i < regions_.size(); ++i) {
        auto env = regions_[i].geometry->getEnvelopeInternal();
        spatial_index_->insert(env, reinterpret_cast<void*>(i));
    }
}

std::string NUTSIndex::lookup_web_mercator(double x, double y) {
    if (!spatial_index_) {
        return "";
    }
    
    auto total_start = std::chrono::high_resolution_clock::now();
    lookup_count_++;
    
    static geos::geom::GeometryFactory::Ptr factory = geos::geom::GeometryFactory::create();
    auto point = factory->createPoint(geos::geom::Coordinate(x, y));
    
    // Time the spatial index query
    auto query_start = std::chrono::high_resolution_clock::now();
    std::vector<void*> candidates;
    auto env = point->getEnvelopeInternal();
    spatial_index_->query(env, candidates);
    auto query_end = std::chrono::high_resolution_clock::now();
    auto query_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(query_end - query_start);
    query_time_ns_ += query_duration.count();
    
    candidate_count_ += candidates.size();
    
    // Time the contains() calls per region
    auto contains_start = std::chrono::high_resolution_clock::now();
    for (void* candidate : candidates) {
        size_t idx = reinterpret_cast<size_t>(candidate);
        if (idx < regions_.size()) {
            auto region_contains_start = std::chrono::high_resolution_clock::now();
            bool contains_result = regions_[idx].geometry->contains(point);
            auto region_contains_end = std::chrono::high_resolution_clock::now();
            auto region_contains_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(region_contains_end - region_contains_start);
            
            const std::string& region_id = regions_[idx].nuts_id;
            region_times_ns_[region_id] += region_contains_duration.count();
            region_counts_[region_id]++;
            
            if (contains_result) {
                auto contains_end = std::chrono::high_resolution_clock::now();
                auto contains_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(contains_end - contains_start);
                contains_time_ns_ += contains_duration.count();
                
                auto total_end = std::chrono::high_resolution_clock::now();
                auto total_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(total_end - total_start);
                total_time_ns_ += total_duration.count();
                
                return region_id;
            }
        }
    }
    auto contains_end = std::chrono::high_resolution_clock::now();
    auto contains_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(contains_end - contains_start);
    contains_time_ns_ += contains_duration.count();
    
    auto total_end = std::chrono::high_resolution_clock::now();
    auto total_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(total_end - total_start);
    total_time_ns_ += total_duration.count();
    
    return "";
}

std::string NUTSIndex::lookup_wgs84(double lat, double lon) {
    auto coords = PlaceExtraction::wgs84_to_web_mercator(lat, lon);
    return lookup_web_mercator(coords.first, coords.second);
}

} // namespace NUTSRegionLookup
