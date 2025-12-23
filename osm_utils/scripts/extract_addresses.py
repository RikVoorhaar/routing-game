#!/usr/bin/env python3
"""
Extract addresses from an OSM file and save to PostgreSQL database with PostGIS.

This replaces the CSV-based extraction with direct database insertion.
"""

import click
import osmium
from pathlib import Path
from typing import List, Dict, Any
import sys
from tqdm import tqdm

# Import our database module
sys.path.append(str(Path(__file__).parent.parent / 'src'))
from osm_utils.database import (
    Address, create_db_session, init_database, 
    truncate_addresses_table, create_spatial_index
)


class ElementCounter(osmium.SimpleHandler):
    """Handler to count total elements for progress tracking."""
    
    def __init__(self):
        osmium.SimpleHandler.__init__(self)
        self.total_nodes = 0
        self.total_ways = 0
        self.total_relations = 0
    
    def node(self, n):
        self.total_nodes += 1
    
    def way(self, w):
        self.total_ways += 1
    
    def relation(self, r):
        self.total_relations += 1
    
    @property
    def total_elements(self):
        return self.total_nodes + self.total_ways + self.total_relations


class AddressExtractor(osmium.SimpleHandler):
    """Handler to extract address data from OSM."""
    
    def __init__(self, progress_bar=None):
        osmium.SimpleHandler.__init__(self)
        self.addresses: List[Dict[str, Any]] = []
        self.count = 0
        self.processed_elements = 0
        self.batch_size = 1000  # Process in batches for better performance
        self.progress_bar = progress_bar
    
    def has_address_tags(self, tags):
        """Check if the element has any address tags."""
        return any(tag.k.startswith('addr:') for tag in tags)
    
    def extract_address_data(self, element):
        """Extract address data from an OSM element."""
        data = {
            'id': str(element.id),
            'lat': None,
            'lon': None,
            'street': '',
            'house_number': '',
            'postcode': '',
            'city': ''
        }
        
        # Extract location if available
        if hasattr(element, 'location') and element.location.valid():
            data['lat'] = float(element.location.lat)
            data['lon'] = float(element.location.lon)
        
        # Extract address tags
        for tag in element.tags:
            if tag.k == 'addr:street':
                data['street'] = tag.v
            elif tag.k == 'addr:housenumber':
                data['house_number'] = tag.v
            elif tag.k == 'addr:postcode':
                data['postcode'] = tag.v
            elif tag.k == 'addr:city':
                data['city'] = tag.v
        
        return data
    
    def process_element(self, element):
        """Process an OSM element with address data."""
        self.processed_elements += 1
        if self.progress_bar:
            self.progress_bar.update(1)
            # Update description with current stats
            self.progress_bar.set_description(f"Processing (found {self.count:,} addresses)")
        
        if self.has_address_tags(element.tags):
            data = self.extract_address_data(element)
            
            # Only include addresses with valid coordinates
            if data['lat'] is not None and data['lon'] is not None:
                self.addresses.append(data)
                self.count += 1
                
                # Process in batches
                if len(self.addresses) >= self.batch_size:
                    self.save_batch()
    
    def save_batch(self):
        """Save current batch of addresses to database."""
        if not self.addresses:
            return
            
        session = create_db_session()
        try:
            for addr_data in self.addresses:
                # Create PostGIS POINT geometry
                point_wkt = f"POINT({addr_data['lon']} {addr_data['lat']})"
                
                address = Address(
                    id=addr_data['id'],
                    street=addr_data['street'] if addr_data['street'] else None,
                    house_number=addr_data['house_number'] if addr_data['house_number'] else None,
                    postcode=addr_data['postcode'] if addr_data['postcode'] else None,
                    city=addr_data['city'] if addr_data['city'] else None,
                    location=point_wkt,
                    lat=addr_data['lat'],
                    lon=addr_data['lon']
                )
                session.add(address)
            
            session.commit()
            self.addresses.clear()  # Clear batch
            
        except Exception as e:
            session.rollback()
            print(f"Error saving batch: {e}")
            raise
        finally:
            session.close()
    
    def node(self, n):
        """Process nodes with address data."""
        self.process_element(n)
    
    def way(self, w):
        """Process ways with address data."""
        self.processed_elements += 1
        if self.progress_bar:
            self.progress_bar.update(1)
            self.progress_bar.set_description(f"Processing (found {self.count:,} addresses)")
        
        if self.has_address_tags(w.tags):
            # For ways, we'll use the centroid of the first and last node
            # This is a simplification - osmconvert does more sophisticated centroid calculation
            data = {
                'id': str(w.id),
                'lat': None,
                'lon': None,
                'street': '',
                'house_number': '',
                'postcode': '',
                'city': ''
            }
            
            # Extract address tags
            for tag in w.tags:
                if tag.k == 'addr:street':
                    data['street'] = tag.v
                elif tag.k == 'addr:housenumber':
                    data['house_number'] = tag.v
                elif tag.k == 'addr:postcode':
                    data['postcode'] = tag.v
                elif tag.k == 'addr:city':
                    data['city'] = tag.v
            
            # Try to get a representative location from the way
            if w.nodes:
                try:
                    # Use the first node's location as an approximation
                    first_node = w.nodes[0]
                    if hasattr(first_node, 'location') and first_node.location.valid():
                        data['lat'] = float(first_node.location.lat)
                        data['lon'] = float(first_node.location.lon)
                        
                        self.addresses.append(data)
                        self.count += 1
                        
                        # Process in batches
                        if len(self.addresses) >= self.batch_size:
                            self.save_batch()
                except:
                    pass
    
    def relation(self, r):
        """Process relations (update progress only)."""
        self.processed_elements += 1
        if self.progress_bar:
            self.progress_bar.update(1)
            self.progress_bar.set_description(f"Processing (found {self.count:,} addresses)")
    
    def finalize(self):
        """Save any remaining addresses in the final batch."""
        if self.addresses:
            self.save_batch()


@click.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--verbose', '-v', is_flag=True, help='Verbose output')
@click.option('--batch-size', default=1000, help='Batch size for database inserts')
@click.option('--skip-count', is_flag=True, help='Skip counting elements (faster start, no ETA)')
def main(input_file: str, verbose: bool, batch_size: int, skip_count: bool):
    """Extract addresses from an OSM file and save to PostgreSQL database."""
    
    input_path = Path(input_file)
    
    print(f"Extracting addresses from: {input_file}")
    print(f"Database batch size: {batch_size}")
    
    # Initialize database
    print("Initializing database...")
    init_database()
    
    # Clear existing addresses
    print("Clearing existing addresses...")
    truncate_addresses_table()
    
    total_elements = None
    if verbose and not skip_count:
        print("Counting total elements for progress tracking...")
        counter = ElementCounter()
        counter.apply_file(input_file)
        total_elements = counter.total_elements
        print(f"Total elements to process: {total_elements:,}")
        print(f"  - Nodes: {counter.total_nodes:,}")
        print(f"  - Ways: {counter.total_ways:,}")
        print(f"  - Relations: {counter.total_relations:,}")
    
    # Extract addresses
    print("Extracting addresses...")
    
    if verbose:
        if total_elements:
            # Use accurate progress bar with ETA
            with tqdm(total=total_elements, unit='elements', desc="Processing") as pbar:
                extractor = AddressExtractor(progress_bar=pbar)
                extractor.batch_size = batch_size
                extractor.apply_file(input_file)
        else:
            # Use indeterminate progress bar
            extractor = AddressExtractor()
            extractor.batch_size = batch_size
            with tqdm(desc="Processing (no ETA - use --skip-count to enable)", unit='elements') as pbar:
                extractor.progress_bar = pbar
                extractor.apply_file(input_file)
    else:
        extractor = AddressExtractor()
        extractor.batch_size = batch_size
        extractor.apply_file(input_file)
    
    # Save final batch
    extractor.finalize()
    
    print(f"Extraction complete!")
    print(f"Extracted {extractor.count:,} addresses")
    print(f"Processed {extractor.processed_elements:,} total elements")
    
    # Create spatial index
    print("Creating spatial index...")
    create_spatial_index()
    
    # Get final count from database
    session = create_db_session()
    try:
        db_count = session.query(Address).count()
        print(f"Final database count: {db_count:,} addresses")
    finally:
        session.close()


if __name__ == '__main__':
    main() 