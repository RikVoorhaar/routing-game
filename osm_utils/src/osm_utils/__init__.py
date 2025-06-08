"""
OSM Utils - A library for analyzing and preprocessing OSM files for routing.
"""

from .osm_analyzer import OSMHandler, build_graph, analyze_components
from .routable_ways import is_routable_way

__version__ = "0.1.0"
__all__ = ["OSMHandler", "build_graph", "analyze_components", "is_routable_way"]

def hello() -> str:
    return "Hello from osm-utils!"
