#ifndef CATEGORY_MATCHER_H
#define CATEGORY_MATCHER_H

#include <osmium/osm/tag.hpp>
#include <string>
#include <vector>
#include <memory>

namespace CategoryMatcher {

struct Category {
    std::string name;
    int max_per_region;
    std::vector<std::pair<std::string, std::string>> tag_rules;  // (key, value) pairs, value can be "*" for wildcard
};

class CategoryMatcher {
public:
    // Load categories from YAML config file
    static std::unique_ptr<CategoryMatcher> from_yaml_file(const std::string& yaml_path);
    
    // Match OSM tags against categories, return category index if matched, or -1 if no match
    // Categories are checked in order, first match wins
    int match_category(const osmium::TagList& tags) const;
    
    // Get category by index
    const Category& get_category(size_t index) const { return categories_[index]; }
    
    // Get number of categories
    size_t category_count() const { return categories_.size(); }
    
    // Get category names (for mapping index to name)
    std::vector<std::string> get_category_names() const;

    // Constructor (public for make_unique)
    CategoryMatcher() = default;
    std::vector<Category> categories_;
    
    // Check if a tag matches a rule
    bool tag_matches_rule(const osmium::TagList& tags, const std::string& key, const std::string& value) const;
};

} // namespace CategoryMatcher

#endif // CATEGORY_MATCHER_H
