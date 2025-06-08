"""
Core OSM analysis functions for connected components and graph building.
"""

import osmium
import networkx as nx
from collections import defaultdict
from typing import Set, Dict, List, Tuple
from tqdm import tqdm
from .routable_ways import is_routable_way


class OSMHandler(osmium.SimpleHandler):
    """Handler to extract road network from OSM data."""
    
    def __init__(self, include_all_highway_types=False):
        osmium.SimpleHandler.__init__(self)
        self.nodes: Dict[int, Tuple[float, float]] = {}  # node_id -> (lat, lon)
        self.ways: List[Tuple[int, List[int], Dict[str, str]]] = []  # (way_id, node_list, tags)
        self.used_nodes: Set[int] = set()
        self.highway_counts: Dict[str, int] = defaultdict(int)
        self.include_all_highway_types = include_all_highway_types
        
    def node(self, n):
        """Store node coordinates."""
        self.nodes[n.id] = (n.location.lat, n.location.lon)
    
    def way(self, w):
        """Store ways that are routable roads."""
        tags = {tag.k: tag.v for tag in w.tags}
        highway = tags.get('highway', '')
        
        # Count all highway types for analysis
        if highway:
            self.highway_counts[highway] += 1
        
        # Check if this is a routable way
        if self.include_all_highway_types or is_routable_way(tags):
            node_list = [node.ref for node in w.nodes]
            if len(node_list) >= 2:  # Need at least 2 nodes to form an edge
                self.ways.append((w.id, node_list, tags))
                self.used_nodes.update(node_list)


def build_graph(handler: OSMHandler, show_progress=True) -> nx.Graph:
    """Build a NetworkX graph from the extracted OSM data."""
    G = nx.Graph()
    
    if show_progress:
        print(f"Building graph from {len(handler.ways)} routable ways...")
    
    iterator = tqdm(handler.ways, desc="Processing ways") if show_progress else handler.ways
    
    for way_id, node_list, tags in iterator:
        # Filter out nodes that don't exist in our node collection
        valid_nodes = [node_id for node_id in node_list if node_id in handler.nodes]
        
        if len(valid_nodes) < 2:
            continue
            
        # Add nodes to graph
        for node_id in valid_nodes:
            if not G.has_node(node_id):
                lat, lon = handler.nodes[node_id]
                G.add_node(node_id, lat=lat, lon=lon)
        
        # Add edges between consecutive nodes in the way
        for i in range(len(valid_nodes) - 1):
            node1, node2 = valid_nodes[i], valid_nodes[i + 1]
            
            # Check if this is a oneway
            oneway = tags.get('oneway', 'no')
            junction = tags.get('junction', '')
            
            if oneway == 'yes' or oneway == '1' or oneway == 'true':
                # Add directed edge (but we're using undirected graph, so it's bidirectional anyway)
                G.add_edge(node1, node2, way_id=way_id, highway=tags.get('highway', ''))
            elif oneway == '-1' or oneway == 'reverse':
                # Reverse direction
                G.add_edge(node2, node1, way_id=way_id, highway=tags.get('highway', ''))
            elif junction == 'roundabout':
                # Roundabouts are typically oneway
                G.add_edge(node1, node2, way_id=way_id, highway=tags.get('highway', ''))
            else:
                # Bidirectional
                G.add_edge(node1, node2, way_id=way_id, highway=tags.get('highway', ''))
    
    return G


def analyze_components(G: nx.Graph) -> Tuple[List[Tuple[int, int]], List[Set[int]]]:
    """Analyze connected components and return them sorted by size."""
    components = list(nx.connected_components(G))
    component_sizes = [(len(comp), i) for i, comp in enumerate(components)]
    component_sizes.sort(reverse=True)  # Sort by size, largest first
    
    return component_sizes, components


def get_largest_component_nodes(G: nx.Graph) -> Set[int]:
    """Get the nodes that belong to the largest connected component."""
    component_sizes, components = analyze_components(G)
    if component_sizes:
        largest_component_idx = component_sizes[0][1]
        return components[largest_component_idx]
    return set()


def print_component_analysis(component_sizes: List[Tuple[int, int]], 
                           components: List[Set[int]], 
                           handler: OSMHandler) -> None:
    """Print detailed analysis of connected components."""
    total_nodes = sum(size for size, _ in component_sizes)
    
    print(f"\n=== Connected Components Analysis ===")
    print(f"Total routable nodes: {total_nodes:,}")
    print(f"Number of connected components: {len(component_sizes)}")
    if component_sizes:
        print(f"Largest component: {component_sizes[0][0]:,} nodes ({component_sizes[0][0]/total_nodes*100:.1f}%)")
        
        if len(component_sizes) > 1:
            print(f"Second largest: {component_sizes[1][0]:,} nodes ({component_sizes[1][0]/total_nodes*100:.1f}%)")
    
    print(f"\n=== Top 20 Components by Size ===")
    print("Rank | Size      | Percentage | Sample Coordinates")
    print("-" * 60)
    
    for rank, (size, comp_idx) in enumerate(component_sizes[:20], 1):
        component = components[comp_idx]
        percentage = size / total_nodes * 100 if total_nodes > 0 else 0
        
        # Get sample coordinates from this component
        sample_node = next(iter(component))
        if sample_node in handler.nodes:
            lat, lon = handler.nodes[sample_node]
            coord_str = f"({lat:.4f}, {lon:.4f})"
        else:
            coord_str = "N/A"
        
        print(f"{rank:4d} | {size:8,} | {percentage:9.1f}% | {coord_str}")
    
    if len(component_sizes) > 20:
        remaining_components = len(component_sizes) - 20
        remaining_nodes = sum(size for size, _ in component_sizes[20:])
        print(f"...  | {remaining_nodes:8,} | {remaining_nodes/total_nodes*100:9.1f}% | ({remaining_components} more components)") 