#!/usr/bin/env python3
"""
Extract addresses from a CSV file and save to PostgreSQL database with PostGIS.

This script reads CSV files (optionally gzipped) and inserts a fraction of addresses
based on a given probability.
"""

import click
import csv
import gzip
import random
import os
from pathlib import Path
from typing import Optional, Any
import sys
from tqdm import tqdm

# Import our database module
sys.path.append(str(Path(__file__).parent.parent / 'src'))
from osm_utils.database import (
    Address, create_db_session, init_database, 
    truncate_addresses_table, create_spatial_index
)


def is_gzipped(file_path: Path) -> bool:
    """
    Check if a file is gzipped.
    
    Parameters
    ----------
    file_path: Path
        Path to the file
    
    Returns
    -------
    bool
        True if file is gzipped
    """
    return file_path.suffix == '.gz' or (len(file_path.suffixes) > 0 and file_path.suffixes[-1] == '.gz')


def open_csv_file(file_path: Path):
    """
    Open a CSV file, handling both regular and gzipped files.
    
    Parameters
    ----------
    file_path: Path
        Path to the CSV file (may be .gz)
    
    Returns
    -------
    file handle
        Opened file handle (text mode)
    """
    if is_gzipped(file_path):
        return gzip.open(file_path, 'rt', encoding='utf-8')
    else:
        return open(file_path, 'r', encoding='utf-8')


def parse_csv_row(row: list[str]) -> Optional[dict[str, Any]]:
    """
    Parse a CSV row into address data.
    
    Parameters
    ----------
    row: list[str]
        CSV row as a list of strings
    
    Returns
    -------
    Optional[dict[str, Any]]
        Address data dictionary or None if invalid
    """
    try:
        # Expected columns: id,lat,lon,street,house_number,postcode,city
        if len(row) < 7:
            return None
        
        address_id = row[0].strip()
        lat_str = row[1].strip()
        lon_str = row[2].strip()
        street = row[3].strip() if row[3].strip() else None
        house_number = row[4].strip() if row[4].strip() else None
        postcode = row[5].strip() if row[5].strip() else None
        city = row[6].strip() if row[6].strip() else None
        
        # Validate coordinates
        try:
            lat = float(lat_str)
            lon = float(lon_str)
        except (ValueError, IndexError):
            return None
        
        # Validate ID
        if not address_id:
            return None
        
        return {
            'id': address_id,
            'lat': lat,
            'lon': lon,
            'street': street,
            'house_number': house_number,
            'postcode': postcode,
            'city': city
        }
    except (ValueError, IndexError):
        return None


def save_batch(addresses: list[dict[str, Any]], session) -> None:
    """
    Save a batch of addresses to the database using bulk insert.
    
    Parameters
    ----------
    addresses: list[dict[str, Any]]
        List of address dictionaries to insert
    session
        SQLAlchemy session
    """
    if not addresses:
        return
    
    from sqlalchemy.dialects.postgresql import insert
    
    # Prepare bulk insert data
    values_list = []
    for addr_data in addresses:
        # Create PostGIS POINT geometry
        point_wkt = f"POINT({addr_data['lon']} {addr_data['lat']})"
        values_list.append({
            'id': addr_data['id'],
            'street': addr_data['street'],
            'house_number': addr_data['house_number'],
            'postcode': addr_data['postcode'],
            'city': addr_data['city'],
            'location': point_wkt,
            'lat': addr_data['lat'],
            'lon': addr_data['lon']
        })
    
    # Use bulk insert with ON CONFLICT DO NOTHING
    stmt = insert(Address).values(values_list)
    stmt = stmt.on_conflict_do_nothing(index_elements=['id'])
    session.execute(stmt)
    session.commit()


@click.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--probability', '-p', default=1.0, type=float, 
              help='Probability of inserting each address (0.0 to 1.0). Default: 1.0')
@click.option('--batch-size', default=1000, help='Batch size for database inserts')
@click.option('--seed', type=int, help='Random seed for reproducible sampling')
def main(input_file: str, probability: float, batch_size: int, seed: Optional[int]):
    """
    Extract addresses from a CSV file and save a fraction to PostgreSQL database.
    
    The CSV file should have columns: id,lat,lon,street,house_number,postcode,city
    """
    if probability < 0.0 or probability > 1.0:
        raise click.BadParameter("Probability must be between 0.0 and 1.0")
    
    input_path = Path(input_file)
    
    # Set random seed if provided
    if seed is not None:
        random.seed(seed)
    
    print(f"Extracting addresses from: {input_file}")
    print(f"Insertion probability: {probability:.2%}")
    print(f"Database batch size: {batch_size}")
    if seed is not None:
        print(f"Random seed: {seed}")
    
    # Initialize database
    print("Initializing database...")
    init_database()
    
    # Clear existing addresses
    print("Clearing existing addresses...")
    truncate_addresses_table()
    
    # Get file size for progress tracking
    file_size = os.path.getsize(input_path)
    
    # Extract addresses
    print("Processing addresses...")
    
    addresses_batch: list[dict[str, Any]] = []
    processed_count = 0
    inserted_count = 0
    
    # For gzipped files, we need to track the underlying file position
    if is_gzipped(input_path):
        # Open the underlying file to track compressed position
        underlying_file = open(input_path, 'rb')
        f = gzip.open(underlying_file, 'rt', encoding='utf-8')
    else:
        underlying_file = None
        f = open(input_path, 'r', encoding='utf-8')
    
    # Create progress bar based on file size
    pbar = tqdm(total=file_size, unit='B', unit_scale=True, desc="Processing")
    
    try:
        reader = csv.reader(f)
        
        # Skip header
        header = next(reader, None)
        if header is None:
            print("Error: CSV file is empty or has no header")
            return
        
        for row in reader:
            processed_count += 1
            
            # Update progress based on file position (every 1000 rows to reduce overhead)
            if processed_count % 1000 == 0:
                if is_gzipped(input_path) and underlying_file:
                    # For gzipped files, track the underlying compressed file position
                    current_pos = underlying_file.tell()
                    pbar.n = current_pos
                    pbar.refresh()
                else:
                    # For regular files, use actual file position
                    current_pos = f.tell()
                    pbar.n = current_pos
                    pbar.refresh()
                
                # Update progress description
                pbar.set_description(f"Processing (inserted {inserted_count:,}, processed {processed_count:,})")
            
            # Parse row
            addr_data = parse_csv_row(row)
            if addr_data is None:
                continue
            
            # Decide whether to insert based on probability
            if random.random() < probability:
                addresses_batch.append(addr_data)
                inserted_count += 1
                
                # Save batch when it reaches batch_size
                if len(addresses_batch) >= batch_size:
                    session = create_db_session()
                    try:
                        save_batch(addresses_batch, session)
                        addresses_batch.clear()
                    except Exception as e:
                        session.rollback()
                        print(f"\nError saving batch: {e}")
                        raise
                    finally:
                        session.close()
    
    finally:
        # Set to 100% at the end
        pbar.n = file_size
        pbar.refresh()
        pbar.close()
        try:
            f.close()
        except:
            pass
        if underlying_file:
            try:
                underlying_file.close()
            except:
                pass
    
    # Save final batch
    if addresses_batch:
        session = create_db_session()
        try:
            save_batch(addresses_batch, session)
        except Exception as e:
            session.rollback()
            print(f"Error saving final batch: {e}")
            raise
        finally:
            session.close()
    
    print(f"\nExtraction complete!")
    print(f"Processed {processed_count:,} addresses from CSV")
    print(f"Inserted {inserted_count:,} addresses ({inserted_count/processed_count*100:.2f}%)")
    
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

