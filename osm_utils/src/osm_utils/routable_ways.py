"""
Routable ways configuration - defines which ways are considered routable.
Based on frequency analysis of Utrecht OSM data.
"""

from typing import Dict


# Highway types that are frequently occurring and routable
# Based on Utrecht analysis - including types with > 0.1% frequency
ROUTABLE_HIGHWAY_TYPES = {
    # Main road types (high priority)
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 
    'unclassified', 'residential',
    
    # Link roads
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
    
    # Special road types (medium priority)
    'living_street', 'service', 'busway',
    
    # Paths and tracks (lower priority, but numerous)
    'track', 'path', 'footway', 'cycleway', 'bridleway',
    
    # Pedestrian infrastructure
    'pedestrian', 'steps',
    
    # Other routable types that appear in data
    'construction',  # Roads under construction but might be passable
}

# Highway types to exclude even if they appear in the data
EXCLUDED_HIGHWAY_TYPES = {
    'platform',     # Railway/bus platforms
    'proposed',     # Proposed roads that don't exist yet
    'services',     # Service areas
    'elevator',     # Elevators
    'bus_stop',     # Bus stops
    'rest_area',    # Rest areas
    'raceway',      # Race tracks (private)
}


def is_routable_way(tags: Dict[str, str]) -> bool:
    """
    Determine if a way is routable based on frequently occurring highway types.
    
    This is a more focused version that only includes highway types that actually
    appear frequently in real OSM data and are useful for routing.
    """
    highway = tags.get('highway', '')
    
    # Check if it's a routable highway type
    if highway in ROUTABLE_HIGHWAY_TYPES:
        # Check access restrictions
        access = tags.get('access', '')
        motor_vehicle = tags.get('motor_vehicle', '')
        vehicle = tags.get('vehicle', '')
        
        # If explicitly forbidden for all access, skip
        if access in ['no', 'private']:
            return False
        if motor_vehicle in ['no', 'private']:
            return False
        if vehicle in ['no', 'private']:
            return False
        
        return True
    
    return False


def get_routable_highway_types():
    """Get the set of routable highway types."""
    return ROUTABLE_HIGHWAY_TYPES.copy()


def get_excluded_highway_types():
    """Get the set of excluded highway types."""
    return EXCLUDED_HIGHWAY_TYPES.copy() 