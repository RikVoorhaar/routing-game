#!/usr/bin/env python3
"""
Analyze connected components in an OSM file.
"""

import click
import pandas as pd
from pathlib import Path
import sys
import os

# Add the parent directory to the path so we can import osm_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from osm_utils.osm_analyzer import OSMHandler, build_graph, analyze_components, print_component_analysis


def save_component_data(component_sizes, components, handler, output_file):
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
def main(osm_file: str, output: str, reference_node: int):
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
    
    # Save to file if requested
    if output:
        save_component_data(component_sizes, components, handler, output)


if __name__ == '__main__':
    main() 