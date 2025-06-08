#!/usr/bin/env python3
"""
Extract addresses from an OSM file and save to compressed CSV.

This is a Python equivalent of the extract_addresses.sh script.
"""

import click
import osmium
import csv
import gzip
from pathlib import Path
from typing import TextIO
import sys


class AddressExtractor(osmium.SimpleHandler):
    """Handler to extract address data from OSM."""
    
    def __init__(self, output_file: TextIO):
        osmium.SimpleHandler.__init__(self)
        self.writer = csv.writer(output_file)
        self.count = 0
        
        # Write header
        self.writer.writerow(['@id', '@lon', '@lat', 'addr:street', 'addr:housenumber', 'addr:postcode', 'addr:city'])
    
    def has_address_tags(self, tags):
        """Check if the element has any address tags."""
        return any(tag.k.startswith('addr:') for tag in tags)
    
    def extract_address_data(self, element):
        """Extract address data from an OSM element."""
        data = {
            '@id': str(element.id),
            '@lon': '',
            '@lat': '',
            'addr:street': '',
            'addr:housenumber': '',
            'addr:postcode': '',
            'addr:city': ''
        }
        
        # Extract location if available
        if hasattr(element, 'location') and element.location.valid():
            data['@lon'] = f"{element.location.lon:.7f}"
            data['@lat'] = f"{element.location.lat:.7f}"
        
        # Extract address tags
        for tag in element.tags:
            if tag.k in data:
                data[tag.k] = tag.v
        
        return data
    
    def node(self, n):
        """Process nodes with address data."""
        if self.has_address_tags(n.tags):
            data = self.extract_address_data(n)
            self.writer.writerow([
                data['@id'], data['@lon'], data['@lat'],
                data['addr:street'], data['addr:housenumber'],
                data['addr:postcode'], data['addr:city']
            ])
            self.count += 1
    
    def way(self, w):
        """Process ways with address data."""
        if self.has_address_tags(w.tags):
            # For ways, we'll use the centroid of the first and last node
            # This is a simplification - osmconvert does more sophisticated centroid calculation
            data = self.extract_address_data(w)
            
            # Try to get a representative location from the way
            if w.nodes:
                try:
                    # Use the first node's location as an approximation
                    # In a full implementation, you'd calculate the actual centroid
                    first_node = w.nodes[0]
                    if hasattr(first_node, 'location') and first_node.location.valid():
                        data['@lon'] = f"{first_node.location.lon:.7f}"
                        data['@lat'] = f"{first_node.location.lat:.7f}"
                except:
                    pass
            
            self.writer.writerow([
                data['@id'], data['@lon'], data['@lat'],
                data['addr:street'], data['addr:housenumber'],
                data['addr:postcode'], data['addr:city']
            ])
            self.count += 1
    
    def area(self, a):
        """Process areas with address data."""
        if self.has_address_tags(a.tags):
            data = self.extract_address_data(a)
            
            # For areas, try to get a representative point
            try:
                if hasattr(a, 'orig_id'):
                    data['@id'] = str(a.orig_id())
            except:
                pass
            
            self.writer.writerow([
                data['@id'], data['@lon'], data['@lat'],
                data['addr:street'], data['addr:housenumber'],
                data['addr:postcode'], data['addr:city']
            ])
            self.count += 1


@click.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--output', '-o', help='Output CSV file (default: <input>.addresses.csv.gz)')
@click.option('--verbose', '-v', is_flag=True, help='Verbose output')
def main(input_file: str, output: str, verbose: bool):
    """Extract addresses from an OSM file and save to compressed CSV."""
    
    input_path = Path(input_file)
    
    if output is None:
        # Default output filename
        if input_path.suffix == '.pbf':
            output_stem = input_path.stem.replace('.osm', '')
        else:
            output_stem = input_path.stem
        output = input_path.parent / f"{output_stem}.addresses.csv.gz"
    
    print(f"Extracting addresses from: {input_file}")
    print(f"Output file: {output}")
    
    # Extract addresses
    with gzip.open(output, 'wt', encoding='utf-8', newline='') as f:
        extractor = AddressExtractor(f)
        
        if verbose:
            print("Processing OSM file...")
        
        extractor.apply_file(input_file)
        
        print(f"Extraction complete!")
        print(f"Extracted {extractor.count:,} addresses")
        
        # Calculate file size
        output_size = Path(output).stat().st_size / (1024 * 1024)  # MB
        print(f"Output file size: {output_size:.1f} MB")


if __name__ == '__main__':
    main() 