#!/usr/bin/env python3
"""
Extract addresses from original OSM file and map them to closest routable nodes from trimmed OSM file.
"""

import click
import osmium
import csv
import gzip
import numpy as np
from scipy.spatial import KDTree
from pathlib import Path
from typing import Dict, List, Tuple, TextIO
import sys
import os
from tqdm import tqdm

# Add the parent directory to the path so we can import osm_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from osm_utils.osm_analyzer import OSMHandler


class AddressExtractor(osmium.SimpleHandler):
    """Handler to extract address data from OSM."""
    
    def __init__(self):
        osmium.SimpleHandler.__init__(self)
        self.addresses = []
        
    def has_address_tags(self, tags):
        """Check if the element has any address tags."""
        return any(tag.k.startswith('addr:') for tag in tags)
    
    def extract_address_data(self, element):
        """Extract address data from an OSM element."""
        data = {
            'id': str(element.id),
            'lon': None,
            'lat': None,
            'addr:street': '',
            'addr:housenumber': '',
            'addr:postcode': '',
            'addr:city': ''
        }
        
        # Extract location if available
        if hasattr(element, 'location') and element.location.valid():
            data['lon'] = element.location.lon
            data['lat'] = element.location.lat
        
        # Extract address tags
        for tag in element.tags:
            if tag.k in data:
                data[tag.k] = tag.v
        
        return data
    
    def node(self, n):
        """Process nodes with address data."""
        if self.has_address_tags(n.tags):
            data = self.extract_address_data(n)
            if data['lat'] is not None and data['lon'] is not None:
                self.addresses.append(data)
    
    def way(self, w):
        """Process ways with address data."""
        if self.has_address_tags(w.tags):
            data = self.extract_address_data(w)
            
            # For ways, try to get a representative location
            # This is simplified - we could calculate actual centroid
            if w.nodes and len(w.nodes) > 0:
                try:
                    # Use the middle node as approximation
                    middle_idx = len(w.nodes) // 2
                    middle_node = w.nodes[middle_idx]
                    if hasattr(middle_node, 'location') and middle_node.location.valid():
                        data['lon'] = middle_node.location.lon
                        data['lat'] = middle_node.location.lat
                except:
                    pass
            
            if data['lat'] is not None and data['lon'] is not None:
                self.addresses.append(data)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters."""
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    
    # Earth radius in meters
    r = 6371000
    return c * r


@click.command()
@click.argument('original_osm_file', type=click.Path(exists=True))
@click.argument('trimmed_osm_file', type=click.Path(exists=True))
@click.option('--output', '-o', help='Output CSV file (default: addresses_with_network.csv.gz)')
@click.option('--verbose', '-v', is_flag=True, help='Verbose output')
def main(original_osm_file: str, trimmed_osm_file: str, output: str, verbose: bool):
    """Extract addresses from original OSM file and map to closest routable nodes from trimmed file."""
    
    if output is None:
        original_path = Path(original_osm_file)
        if original_path.suffix == '.pbf':
            output_stem = original_path.stem.replace('.osm', '')
        else:
            output_stem = original_path.stem
        output = f"{output_stem}_addresses_with_network.csv.gz"
    
    print(f"Original OSM file: {original_osm_file}")
    print(f"Trimmed OSM file: {trimmed_osm_file}")
    print(f"Output file: {output}")
    
    # Step 1: Extract addresses from original OSM file
    print("\nStep 1: Extracting addresses from original OSM file...")
    address_extractor = AddressExtractor()
    address_extractor.apply_file(original_osm_file)
    
    addresses = address_extractor.addresses
    print(f"Extracted {len(addresses):,} addresses with coordinates")
    
    if not addresses:
        print("No addresses found with valid coordinates!")
        return
    
    # Step 2: Load routable nodes from trimmed OSM file
    print("\nStep 2: Loading routable nodes from trimmed OSM file...")
    handler = OSMHandler()
    handler.apply_file(trimmed_osm_file)
    
    # Get routable nodes with coordinates
    routable_nodes = []
    routable_node_coords = []
    
    for node_id in handler.used_nodes:
        if node_id in handler.nodes:
            lat, lon = handler.nodes[node_id]
            routable_nodes.append(node_id)
            routable_node_coords.append([lat, lon])
    
    print(f"Loaded {len(routable_nodes):,} routable nodes")
    
    if not routable_nodes:
        print("No routable nodes found!")
        return
    
    # Step 3: Build spatial index for efficient nearest neighbor search
    print("\nStep 3: Building spatial index...")
    routable_coords_array = np.array(routable_node_coords)
    tree = KDTree(routable_coords_array)
    
    # Step 4: Find closest routable node for each address
    print("\nStep 4: Mapping addresses to closest routable nodes...")
    
    mapped_addresses = []
    
    iterator = tqdm(addresses, desc="Processing addresses") if verbose else addresses
    
    for addr in iterator:
        addr_coord = [addr['lat'], addr['lon']]
        
        # Find closest routable node
        distance, idx = tree.query(addr_coord)
        
        closest_node_id = routable_nodes[idx]
        closest_lat, closest_lon = routable_coords_array[idx]
        
        # Convert distance from degrees to meters using haversine
        distance_meters = haversine_distance(
            addr['lat'], addr['lon'], 
            closest_lat, closest_lon
        )
        
        # Create combined record
        mapped_addr = {
            # Original address data
            'address_id': addr['id'],
            'address_lon': addr['lon'],
            'address_lat': addr['lat'],
            'addr:street': addr['addr:street'],
            'addr:housenumber': addr['addr:housenumber'],
            'addr:postcode': addr['addr:postcode'],
            'addr:city': addr['addr:city'],
            # Closest routable node data
            'closest_node_id': closest_node_id,
            'closest_node_lon': closest_lon,
            'closest_node_lat': closest_lat,
            'distance_meters': distance_meters
        }
        
        mapped_addresses.append(mapped_addr)
    
    # Step 5: Save results
    print(f"\nStep 5: Saving {len(mapped_addresses):,} mapped addresses...")
    
    with gzip.open(output, 'wt', encoding='utf-8', newline='') as f:
        fieldnames = [
            'address_id', 'address_lon', 'address_lat',
            'addr:street', 'addr:housenumber', 'addr:postcode', 'addr:city',
            'closest_node_id', 'closest_node_lon', 'closest_node_lat', 'distance_meters'
        ]
        
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for addr in mapped_addresses:
            writer.writerow(addr)
    
    # Statistics
    distances = [addr['distance_meters'] for addr in mapped_addresses]
    avg_distance = np.mean(distances)
    median_distance = np.median(distances)
    max_distance = np.max(distances)
    
    print(f"\nMapping complete!")
    print(f"Average distance to routable node: {avg_distance:.1f}m")
    print(f"Median distance to routable node: {median_distance:.1f}m")  
    print(f"Maximum distance to routable node: {max_distance:.1f}m")
    
    # File size info
    output_size = Path(output).stat().st_size / (1024 * 1024)  # MB
    print(f"Output file size: {output_size:.1f} MB")


if __name__ == '__main__':
    main() 