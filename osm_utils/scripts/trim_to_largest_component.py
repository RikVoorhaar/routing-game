#!/usr/bin/env python3
"""
Trim an OSM file to keep only the largest connected component.
"""

import click
import osmium
from pathlib import Path
import sys
import os

# Add the parent directory to the path so we can import osm_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from osm_utils.osm_analyzer import OSMHandler, build_graph, get_largest_component_nodes, print_component_analysis, analyze_components


class OSMTrimmer(osmium.SimpleHandler):
    """Handler to trim OSM data to only include nodes and ways from the largest component."""
    
    def __init__(self, largest_component_nodes, output_writer):
        osmium.SimpleHandler.__init__(self)
        self.largest_component_nodes = largest_component_nodes
        self.output_writer = output_writer
        self.kept_ways = 0
        self.total_ways = 0
        self.kept_nodes = 0
        self.total_nodes = 0
        
    def node(self, n):
        """Keep nodes that are in the largest component."""
        self.total_nodes += 1
        if n.id in self.largest_component_nodes:
            self.kept_nodes += 1
            self.output_writer.add_node(n)
    
    def way(self, w):
        """Keep ways that have nodes in the largest component."""
        self.total_ways += 1
        
        # Check if any node in this way is in the largest component
        way_nodes = [node.ref for node in w.nodes]
        if any(node_id in self.largest_component_nodes for node_id in way_nodes):
            self.kept_ways += 1
            self.output_writer.add_way(w)
    
    def relation(self, r):
        """Keep all relations for now (could be made more sophisticated)."""
        self.output_writer.add_relation(r)


@click.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--output', '-o', help='Output file (default: <input>.trimmed.osm.pbf)')
@click.option('--verbose', '-v', is_flag=True, help='Verbose output')
def main(input_file: str, output: str, verbose: bool):
    """Trim an OSM file to keep only the largest connected component."""
    
    input_path = Path(input_file)
    
    if output is None:
        # Default output filename
        if input_path.suffix == '.pbf':
            output_stem = input_path.stem.replace('.osm', '')
            output = input_path.parent / f"{output_stem}.trimmed.osm.pbf"
        else:
            output = input_path.parent / f"{input_path.stem}.trimmed{input_path.suffix}"
    
    print(f"Trimming OSM file: {input_file}")
    print(f"Output file: {output}")
    
    # Step 1: Analyze the file to find the largest component
    print("\nStep 1: Analyzing connected components...")
    handler = OSMHandler()
    handler.apply_file(input_file)
    
    if verbose:
        print(f"Found {len(handler.nodes):,} total nodes")
        print(f"Found {len(handler.used_nodes):,} nodes used in routable ways")
        print(f"Found {len(handler.ways):,} routable ways")
    
    # Build graph
    G = build_graph(handler, show_progress=verbose)
    if verbose:
        print(f"Graph has {G.number_of_nodes():,} nodes and {G.number_of_edges():,} edges")
    
    # Analyze components
    component_sizes, components = analyze_components(G)
    
    if verbose:
        print_component_analysis(component_sizes, components, handler)
    else:
        total_nodes = sum(size for size, _ in component_sizes)
        print(f"Found {len(component_sizes)} connected components")
        if component_sizes:
            largest_size = component_sizes[0][0]
            largest_percent = largest_size / total_nodes * 100 if total_nodes > 0 else 0
            print(f"Largest component: {largest_size:,} nodes ({largest_percent:.1f}%)")
    
    # Get nodes in the largest component
    largest_component_nodes = get_largest_component_nodes(G)
    
    if not largest_component_nodes:
        print("Error: No connected components found!")
        return
    
    print(f"\nStep 2: Trimming to largest component with {len(largest_component_nodes):,} nodes...")
    
    # Step 2: Create the trimmed file
    with osmium.SimpleWriter(str(output)) as writer:
        trimmer = OSMTrimmer(largest_component_nodes, writer)
        trimmer.apply_file(input_file)
        
        print(f"\nTrimming complete!")
        print(f"Nodes: {trimmer.kept_nodes:,} kept out of {trimmer.total_nodes:,} ({trimmer.kept_nodes/trimmer.total_nodes*100:.1f}%)")
        print(f"Ways: {trimmer.kept_ways:,} kept out of {trimmer.total_ways:,} ({trimmer.kept_ways/trimmer.total_ways*100:.1f}%)")
        
        # Calculate file sizes
        input_size = input_path.stat().st_size / (1024 * 1024)  # MB
        output_size = Path(output).stat().st_size / (1024 * 1024)  # MB
        
        print(f"\nFile size reduction:")
        print(f"Input:  {input_size:.1f} MB")
        print(f"Output: {output_size:.1f} MB")
        print(f"Reduction: {(1 - output_size/input_size)*100:.1f}%")


if __name__ == '__main__':
    main() 