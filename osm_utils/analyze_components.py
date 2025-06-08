#!/usr/bin/env python3
"""
OSM Connected Components Analyzer

This script analyzes an OSM file to find all connected components in the road network
and reports their sizes in decreasing order.
"""

import osmium
import networkx as nx
import click
import sys
from collections import defaultdict
from typing import Set, Dict, List, Tuple
from tqdm import tqdm
import pandas as pd


class OSMHandler(osmium.SimpleHandler):
    """Handler to extract road network from OSM data."""
    
    def __init__(self):
        osmium.SimpleHandler.__init__(self)
        self.nodes: Dict[int, Tuple[float, float]] = {}  # node_id -> (lat, lon)
        self.ways: List[Tuple[int, List[int], Dict[str, str]]] = []  # (way_id, node_list, tags)
        self.used_nodes: Set[int] = set()
        
    def node(self, n):
        """Store node coordinates."""
        self.nodes[n.id] = (n.location.lat, n.location.lon)
    
    def way(self, w):
        """Store ways that are routable roads."""
        tags = {tag.k: tag.v for tag in w.tags}
        
        # Check if this is a routable way
        if self.is_routable_way(tags):
            node_list = [node.ref for node in w.nodes]
            if len(node_list) >= 2:  # Need at least 2 nodes to form an edge
                self.ways.append((w.id, node_list, tags))
                self.used_nodes.update(node_list)
    
    def is_routable_way(self, tags: Dict[str, str]) -> bool:
        """Determine if a way is routable (matches our routing profile logic)."""
        highway = tags.get('highway', '')
        
        # Main road types
        if highway in ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 
                      'unclassified', 'residential']:
            return True
        
        # Link roads
        if highway in ['motorway_link', 'trunk_link', 'primary_link', 
                      'secondary_link', 'tertiary_link']:
            return True
        
        # Special road types
        if highway in ['living_street', 'service', 'pedestrian', 'track', 
                      'bus_guideway', 'busway', 'raceway', 'road', 'construction',
                      'escape']:
            return True
        
        # Paths (for pedestrians/bicycles)
        if highway in ['path', 'footway', 'cycleway', 'bridleway', 'steps', 'corridor']:
            return True
        
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
        
        return False


def build_graph(handler: OSMHandler) -> nx.Graph:
    """Build a NetworkX graph from the extracted OSM data."""
    G = nx.Graph()
    
    print(f"Building graph from {len(handler.ways)} routable ways...")
    
    for way_id, node_list, tags in tqdm(handler.ways, desc="Processing ways"):
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


def analyze_components(G: nx.Graph) -> List[Tuple[int, int]]:
    """Analyze connected components and return them sorted by size."""
    print("Finding connected components...")
    
    components = list(nx.connected_components(G))
    component_sizes = [(len(comp), i) for i, comp in enumerate(components)]
    component_sizes.sort(reverse=True)  # Sort by size, largest first
    
    return component_sizes, components


def print_component_analysis(component_sizes: List[Tuple[int, int]], 
                           components: List[Set[int]], 
                           handler: OSMHandler) -> None:
    """Print detailed analysis of connected components."""
    total_nodes = sum(size for size, _ in component_sizes)
    
    print(f"\n=== Connected Components Analysis ===")
    print(f"Total routable nodes: {total_nodes:,}")
    print(f"Number of connected components: {len(component_sizes)}")
    print(f"Largest component: {component_sizes[0][0]:,} nodes ({component_sizes[0][0]/total_nodes*100:.1f}%)")
    
    if len(component_sizes) > 1:
        print(f"Second largest: {component_sizes[1][0]:,} nodes ({component_sizes[1][0]/total_nodes*100:.1f}%)")
    
    print(f"\n=== Top 20 Components by Size ===")
    print("Rank | Size      | Percentage | Sample Coordinates")
    print("-" * 60)
    
    for rank, (size, comp_idx) in enumerate(component_sizes[:20], 1):
        component = components[comp_idx]
        percentage = size / total_nodes * 100
        
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


def save_component_data(component_sizes: List[Tuple[int, int]], 
                       components: List[Set[int]], 
                       handler: OSMHandler,
                       output_file: str) -> None:
    """Save component analysis to a CSV file."""
    data = []
    
    for rank, (size, comp_idx) in enumerate(component_sizes, 1):
        component = components[comp_idx]
        
        # Get sample coordinates and bounding box
        lats = [handler.nodes[node_id][0] for node_id in component if node_id in handler.nodes]
        lons = [handler.nodes[node_id][1] for node_id in component if node_id in handler.nodes]
        
        if lats and lons:
            sample_lat, sample_lon = lats[0], lons[0]
            min_lat, max_lat = min(lats), max(lats)
            min_lon, max_lon = min(lons), max(lons)
        else:
            sample_lat = sample_lon = min_lat = max_lat = min_lon = max_lon = None
        
        data.append({
            'rank': rank,
            'component_id': comp_idx,
            'size': size,
            'percentage': size / sum(s for s, _ in component_sizes) * 100,
            'sample_lat': sample_lat,
            'sample_lon': sample_lon,
            'min_lat': min_lat,
            'max_lat': max_lat,
            'min_lon': min_lon,
            'max_lon': max_lon
        })
    
    df = pd.DataFrame(data)
    df.to_csv(output_file, index=False)
    print(f"\nComponent analysis saved to {output_file}")


@click.command()
@click.argument('osm_file', type=click.Path(exists=True))
@click.option('--output', '-o', help='Output CSV file for component analysis')
@click.option('--reference-node', type=int, help='Show which component contains this node ID')
@click.option('--reference-coords', help='Show which component contains this coordinate (lat,lon)')
def main(osm_file: str, output: str, reference_node: int, reference_coords: str):
    """Analyze connected components in an OSM file."""
    
    print(f"Analyzing OSM file: {osm_file}")
    
    # Parse OSM file
    handler = OSMHandler()
    print("Parsing OSM file...")
    handler.apply_file(osm_file)
    
    print(f"Found {len(handler.nodes):,} total nodes")
    print(f"Found {len(handler.used_nodes):,} nodes used in routable ways")
    print(f"Found {len(handler.ways):,} routable ways")
    
    # Build graph
    G = build_graph(handler)
    print(f"Graph has {G.number_of_nodes():,} nodes and {G.number_of_edges():,} edges")
    
    # Analyze components
    component_sizes, components = analyze_components(G)
    
    # Print analysis
    print_component_analysis(component_sizes, components, handler)
    
    # Handle reference node query
    if reference_node is not None:
        for comp_idx, component in enumerate(components):
            if reference_node in component:
                rank = next(i for i, (_, idx) in enumerate(component_sizes, 1) if idx == comp_idx)
                size = len(component)
                print(f"\nReference node {reference_node} is in component {comp_idx} (rank {rank}, size {size:,})")
                break
        else:
            print(f"\nReference node {reference_node} not found in any routable component")
    
    # Handle reference coordinates query
    if reference_coords is not None:
        try:
            lat_str, lon_str = reference_coords.split(',')
            ref_lat, ref_lon = float(lat_str.strip()), float(lon_str.strip())
            
            # Find nearest node to these coordinates
            min_dist = float('inf')
            nearest_node = None
            
            for node_id in G.nodes():
                if node_id in handler.nodes:
                    node_lat, node_lon = handler.nodes[node_id]
                    # Simple distance calculation
                    dist = ((node_lat - ref_lat) ** 2 + (node_lon - ref_lon) ** 2) ** 0.5
                    if dist < min_dist:
                        min_dist = dist
                        nearest_node = node_id
            
            if nearest_node is not None:
                for comp_idx, component in enumerate(components):
                    if nearest_node in component:
                        rank = next(i for i, (_, idx) in enumerate(component_sizes, 1) if idx == comp_idx)
                        size = len(component)
                        print(f"\nReference coordinates ({ref_lat}, {ref_lon}) are nearest to node {nearest_node}")
                        print(f"This node is in component {comp_idx} (rank {rank}, size {size:,})")
                        break
        except (ValueError, AttributeError):
            print(f"\nInvalid coordinate format: {reference_coords}. Use 'lat,lon' format.")
    
    # Save to file if requested
    if output:
        save_component_data(component_sizes, components, handler, output)


if __name__ == '__main__':
    main() 