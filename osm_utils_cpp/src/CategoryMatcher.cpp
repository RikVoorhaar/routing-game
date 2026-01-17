#include "CategoryMatcher.h"
#include <yaml-cpp/yaml.h>
#include <fstream>
#include <stdexcept>
#include <algorithm>
#include <cstring>

namespace CategoryMatcher {

std::unique_ptr<CategoryMatcher> CategoryMatcher::from_yaml_file(const std::string& yaml_path) {
    auto matcher = std::make_unique<CategoryMatcher>();
    
    YAML::Node config = YAML::LoadFile(yaml_path);
    
    if (!config["categories"] || !config["categories"].IsSequence()) {
        throw std::runtime_error("YAML config must contain 'categories' array");
    }
    
    for (const auto& cat_node : config["categories"]) {
        Category cat;
        
        if (!cat_node["name"] || !cat_node["name"].IsScalar()) {
            throw std::runtime_error("Category must have 'name' field");
        }
        cat.name = cat_node["name"].as<std::string>();
        
        if (cat_node["max_per_region"] && cat_node["max_per_region"].IsScalar()) {
            cat.max_per_region = cat_node["max_per_region"].as<int>();
        } else {
            cat.max_per_region = 100;  // Default
        }
        
        if (!cat_node["tags"] || !cat_node["tags"].IsSequence()) {
            throw std::runtime_error("Category must have 'tags' array");
        }
        
        for (const auto& tag_node : cat_node["tags"]) {
            if (!tag_node.IsScalar()) {
                throw std::runtime_error("Tag must be a string in format 'key=value'");
            }
            
            std::string tag_str = tag_node.as<std::string>();
            size_t eq_pos = tag_str.find('=');
            if (eq_pos == std::string::npos) {
                throw std::runtime_error("Tag must be in format 'key=value': " + tag_str);
            }
            
            std::string key = tag_str.substr(0, eq_pos);
            std::string value = tag_str.substr(eq_pos + 1);
            
            cat.tag_rules.push_back({key, value});
        }
        
        matcher->categories_.push_back(std::move(cat));
    }
    
    return matcher;
}

bool CategoryMatcher::tag_matches_rule(const osmium::TagList& tags, const std::string& key, const std::string& value) const {
    const char* tag_value = tags.get_value_by_key(key.c_str());
    if (!tag_value) {
        return false;
    }
    
    // Wildcard match
    if (value == "*") {
        return true;
    }
    
    // Exact match
    return std::strcmp(tag_value, value.c_str()) == 0;
}

int CategoryMatcher::match_category(const osmium::TagList& tags) const {
    for (size_t i = 0; i < categories_.size(); ++i) {
        const auto& cat = categories_[i];
        
        // Check if any tag rule matches
        for (const auto& rule : cat.tag_rules) {
            if (tag_matches_rule(tags, rule.first, rule.second)) {
                return static_cast<int>(i);
            }
        }
    }
    
    return -1;  // No match
}

std::vector<std::string> CategoryMatcher::get_category_names() const {
    std::vector<std::string> names;
    names.reserve(categories_.size());
    for (const auto& cat : categories_) {
        names.push_back(cat.name);
    }
    return names;
}

} // namespace CategoryMatcher
