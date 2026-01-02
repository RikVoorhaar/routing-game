#!/usr/bin/env python3
"""
Stream process ways from an OSM file, outputting ways + their nodes and addresses.

This script processes ways in a single pass, writing output immediately.
Uses a sparse index to store only nodes referenced by ways, avoiding
the need to load all nodes into memory. Also extracts addresses to a CSV file.
"""

import click
import osmium
from pathlib import Path
import sys
import os
import csv
import gzip
import tempfile
import shutil
from tqdm import tqdm
from typing import Optional, TextIO

# Add the parent directory to the path so we can import osm_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from osm_utils.routable_ways import is_routable_way


class WayProcessor(osmium.SimpleHandler):
    """
    Process ways and write them with their nodes, also extracting addresses.
    
    Uses a sparse index to store only nodes referenced by ways,
    making it memory-efficient for large OSM files.
    """
    
    def __init__(self, output_writer, address_csv_writer: csv.DictWriter, 
                 progress_bar: tqdm):
        osmium.SimpleHandler.__init__(self)
        self.output_writer = output_writer
        self.address_csv_writer = address_csv_writer
        self.progress_bar = progress_bar
        self.processed_ways = 0
        self.processed_nodes = 0
        self.written_ways = 0
        self.written_nodes = 0
        self.addresses_found = 0
        self.nodes_written = set()  # Track which nodes we've already written
        
        # Create sparse index for node locations (only stores nodes we need)
        self.location_handler = osmium.index.create_map("sparse_mem_array")
        
    def has_address_tags(self, tags):
        """Check if the element has any address tags."""
        return any(tag.k.startswith('addr:') for tag in tags)
    
    def extract_address_data(self, node):
        """Extract address data from a node."""
        data = {
            'id': str(node.id),
            'lat': None,
            'lon': None,
            'street': '',
            'house_number': '',
            'postcode': '',
            'city': ''
        }
        
        # Extract location if available
        if hasattr(node, 'location') and node.location.valid():
            data['lat'] = float(node.location.lat)
            data['lon'] = float(node.location.lon)
        
        # Extract address tags
        for tag in node.tags:
            if tag.k == 'addr:street':
                data['street'] = tag.v
            elif tag.k == 'addr:housenumber':
                data['house_number'] = tag.v
            elif tag.k == 'addr:postcode':
                data['postcode'] = tag.v
            elif tag.k == 'addr:city':
                data['city'] = tag.v
        
        return data
        
    def node(self, n):
        """Store node locations in sparse index and extract addresses."""
        self.processed_nodes += 1
        self.location_handler.set(n.id, n.location)
        
        # Extract addresses if present and location is valid
        if self.has_address_tags(n.tags) and hasattr(n, 'location') and n.location.valid():
            data = self.extract_address_data(n)
            # Double-check coordinates are valid before writing
            if data['lat'] is not None and data['lon'] is not None:
                self.address_csv_writer.writerow(data)
                self.addresses_found += 1
        
        # Update progress bar periodically
        if self.progress_bar is not None and self.processed_nodes % 10000 == 0:
            self.progress_bar.update(10000)  # Update by batch size
            self.progress_bar.set_description(
                f"Processing (nodes: {self.processed_nodes:,}, "
                f"ways: {self.processed_ways:,}, addresses: {self.addresses_found:,})"
            )
        
    def way(self, w):
        """Process a way and write it with its nodes."""
        self.processed_ways += 1
        
        if self.progress_bar is not None:
            if self.processed_ways % 1000 == 0:
                self.progress_bar.update(1000)  # Update by batch size
                self.progress_bar.set_description(
                    f"Processing (nodes: {self.processed_nodes:,}, "
                    f"ways: {self.processed_ways:,}, written: {self.written_ways:,}, "
                    f"addresses: {self.addresses_found:,})"
                )
        
        # Extract tags
        tags = {tag.k: tag.v for tag in w.tags}
        
        # Only process routable ways
        if not is_routable_way(tags):
            return
        
        # Get node references
        node_refs = [node.ref for node in w.nodes]
        
        if len(node_refs) < 2:
            return  # Need at least 2 nodes for a valid way
        
        # Write nodes that haven't been written yet
        # Note: OSM files are structured with nodes first, then ways, so all node
        # locations have already been stored in the index by the time we process ways.
        for node_ref in node_refs:
            if node_ref not in self.nodes_written:
                try:
                    location = self.location_handler.get(node_ref)
                    if location.valid():
                        # Create node object
                        node = osmium.osm.mutable.Node()
                        node.id = node_ref
                        node.location = location
                        self.output_writer.add_node(node)
                        self.nodes_written.add(node_ref)
                        self.written_nodes += 1
                except (KeyError, RuntimeError):
                    # Node location not found in index
                    pass
        
        # Write the way
        self.output_writer.add_way(w)
        self.written_ways += 1


@click.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--output', '-o', help='Output OSM file (default: <input>.ways.osm.pbf)')
@click.option('--output-dir', '-d', type=click.Path(), help='Output directory for addresses CSV (default: same as input file)')
def main(input_file: str, output: Optional[str], output_dir: Optional[str]):
    """
    Stream process ways from an OSM file, outputting routable ways + their nodes and addresses.
    
    Creates a trimmed OSM file containing only routable ways and the nodes they reference,
    plus a compressed CSV file with all addresses found. Processes in a single pass with progress tracking.
    """
    
    input_path = Path(input_file)
    
    # Determine output paths
    if output is None:
        suffix = '.ways.osm.pbf'
        if input_path.suffix == '.pbf':
            output_stem = input_path.stem.replace('.osm', '')
            output = input_path.parent / f"{output_stem}{suffix}"
        else:
            output = input_path.parent / f"{input_path.stem}{suffix}"
    else:
        output = Path(output)
    
    # Determine output directory for addresses CSV
    if output_dir is None:
        output_dir = input_path.parent
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
    
    # Address CSV output path
    if input_path.suffix == '.pbf':
        csv_stem = input_path.stem.replace('.osm', '')
    else:
        csv_stem = input_path.stem
    address_csv_path = output_dir / f"{csv_stem}.addresses.csv.gz"
    
    print(f"Processing routable ways from: {input_file}")
    print(f"Output OSM file: {output}")
    print(f"Output addresses CSV: {address_csv_path}")
    
    # Remove output files if they already exist (osmium doesn't overwrite)
    if output.exists():
        print(f"Output file already exists, removing: {output}")
        output.unlink()
    if address_csv_path.exists():
        print(f"Addresses CSV file already exists, removing: {address_csv_path}")
        address_csv_path.unlink()
    
    # Process ways with progress bar
    print("\nProcessing ways and extracting addresses...")
    
    # Create temporary CSV file for streaming addresses
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv', newline='') as temp_csv:
        temp_csv_path = temp_csv.name
        
        # Write CSV header
        csv_writer = csv.DictWriter(temp_csv, fieldnames=[
            'id', 'lat', 'lon', 'street', 'house_number', 'postcode', 'city'
        ])
        csv_writer.writeheader()
        
        with osmium.SimpleWriter(str(output)) as writer:
            # Create progress bar without total (indeterminate)
            progress_bar = tqdm(
                desc="Processing",
                unit="elements"
            )
            
            processor = WayProcessor(
                writer,
                address_csv_writer=csv_writer,
                progress_bar=progress_bar
            )
            
            processor.apply_file(input_file)
            progress_bar.close()
    
    # Compress the CSV file
    print("\nCompressing addresses CSV...")
    with open(temp_csv_path, 'rb') as f_in:
        with gzip.open(str(address_csv_path), 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
    
    # Remove temporary CSV
    os.unlink(temp_csv_path)
    
    print(f"\nProcessing complete!")
    print(f"Processed: {processor.processed_nodes:,} nodes, {processor.processed_ways:,} ways")
    print(f"Written: {processor.written_ways:,} ways, {processor.written_nodes:,} nodes")
    print(f"Found: {processor.addresses_found:,} addresses")
    
    # Calculate file sizes
    input_size = input_path.stat().st_size / (1024 * 1024)  # MB
    output_size = output.stat().st_size / (1024 * 1024)  # MB
    csv_size = address_csv_path.stat().st_size / (1024 * 1024)  # MB
    
    print(f"\nFile sizes:")
    print(f"Input:  {input_size:.1f} MB")
    print(f"Output OSM: {output_size:.1f} MB")
    print(f"Output CSV: {csv_size:.1f} MB")
    if input_size > 0:
        print(f"OSM ratio: {output_size/input_size*100:.1f}%")


if __name__ == '__main__':
    main()
