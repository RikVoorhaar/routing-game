#!/usr/bin/env python3
"""
Extract addresses from a CSV file and save to PostgreSQL database with PostGIS.

This script reads CSV files (optionally gzipped) and inserts addresses with
per-region sampling based on max addresses per region.
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


def parse_csv_row(row: list[str], header: list[str]) -> Optional[dict[str, Any]]:
    """
    Parse a CSV row into address data.
    
    Parameters
    ----------
    row: list[str]
        CSV row as a list of strings
    header: list[str]
        CSV header row to map column names
    
    Returns
    -------
    Optional[dict[str, Any]]
        Address data dictionary or None if invalid
    """
    try:
        # Create a dictionary mapping column names to values
        row_dict = dict(zip(header, row))
        
        address_id = row_dict.get('id', '').strip()
        lat_str = row_dict.get('lat', '').strip()
        lon_str = row_dict.get('lon', '').strip()
        street = row_dict.get('street', '').strip() or None
        house_number = row_dict.get('house_number', '').strip() or None
        postcode = row_dict.get('postcode', '').strip() or None
        city = row_dict.get('city', '').strip() or None
        nuts_region_code = row_dict.get('nuts_region_code', '').strip() or None
        
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
            'city': city,
            'nuts_region_code': nuts_region_code
        }
    except (ValueError, IndexError, KeyError):
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
            'lon': addr_data['lon'],
            'region': addr_data['nuts_region_code']
        })
    
    # Use bulk insert with ON CONFLICT DO NOTHING
    stmt = insert(Address).values(values_list)
    stmt = stmt.on_conflict_do_nothing(index_elements=['id'])
    session.execute(stmt)
    session.commit()


def load_region_counts(counts_file: Path) -> dict[str, int]:
    """
    Load region address counts from CSV file.
    
    Parameters
    ----------
    counts_file: Path
        Path to the region counts CSV file
    
    Returns
    -------
    dict[str, int]
        Dictionary mapping region code to address count
    """
    region_counts: dict[str, int] = {}
    
    with open_csv_file(counts_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            region_code = row.get('nuts_region_code', '').strip()
            count_str = row.get('address_count', '').strip()
            if region_code and count_str:
                try:
                    region_counts[region_code] = int(count_str)
                except ValueError:
                    continue
    
    return region_counts


def compute_region_probabilities(
    region_counts: dict[str, int], 
    max_per_region: int
) -> dict[str, float]:
    """
    Compute sampling probability for each region.
    
    Parameters
    ----------
    region_counts: dict[str, int]
        Dictionary mapping region code to address count
    max_per_region: int
        Maximum number of addresses to sample per region
    
    Returns
    -------
    dict[str, float]
        Dictionary mapping region code to sampling probability
    """
    probabilities: dict[str, float] = {}
    
    for region_code, count in region_counts.items():
        if count > 0:
            probabilities[region_code] = min(1.0, max_per_region / count)
        else:
            probabilities[region_code] = 0.0
    
    return probabilities


@click.command()
@click.argument('input_file', type=click.Path(exists=True), required=False)
@click.option('--max-per-region', '-m', default=1000, type=int,
              help='Maximum number of addresses to sample per region. Default: 1000')
@click.option('--region-counts-file', type=click.Path(exists=True), required=True,
              help='Path to region counts CSV file')
@click.option('--exclude-region', multiple=True, default=['ES63', 'ES64'],
              help='Region codes to exclude from sampling (can be specified multiple times). Default: ES63 ES64')
@click.option('--batch-size', default=1000, help='Batch size for database inserts')
@click.option('--seed', type=int, help='Random seed for reproducible sampling')
def main(
    input_file: Optional[str], 
    max_per_region: int, 
    region_counts_file: str,
    exclude_region: tuple[str, ...],
    batch_size: int, 
    seed: Optional[int]
):
    """
    Extract addresses from a CSV file and save to PostgreSQL database with per-region sampling.
    
    The CSV file should have columns: id,lat,lon,street,house_number,postcode,city,nuts_region_code
    
    If INPUT_FILE is not provided, defaults to osm_files/europe-latest.addresses_with_regions.csv.gz
    """
    # Default input file if not provided
    if input_file is None:
        default_path = Path('osm_files/europe-latest.addresses_with_regions.csv.gz')
        if not default_path.exists():
            raise click.BadParameter(
                f"Default input file not found: {default_path}. Please specify INPUT_FILE."
            )
        input_file = str(default_path)
    
    input_path = Path(input_file)
    counts_path = Path(region_counts_file)
    excluded_regions = set(exclude_region)
    
    # Set random seed if provided
    if seed is not None:
        random.seed(seed)
    
    print(f"Extracting addresses from: {input_file}")
    print(f"Max addresses per region: {max_per_region}")
    print(f"Region counts file: {region_counts_file}")
    print(f"Excluded regions: {', '.join(sorted(excluded_regions))}")
    print(f"Database batch size: {batch_size}")
    if seed is not None:
        print(f"Random seed: {seed}")
    
    # Load region counts and compute probabilities
    print("Loading region counts...")
    region_counts = load_region_counts(counts_path)
    print(f"Loaded counts for {len(region_counts):,} regions")
    
    print("Computing per-region sampling probabilities...")
    region_probabilities = compute_region_probabilities(region_counts, max_per_region)
    
    # Filter out excluded regions from probabilities
    for region in excluded_regions:
        region_probabilities.pop(region, None)
    
    print(f"Sampling probabilities computed for {len(region_probabilities):,} regions")
    
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
        
        # Read header
        header_row = next(reader, None)
        if header_row is None:
            print("Error: CSV file is empty or has no header")
            return
        
        # Normalize header (strip whitespace, lowercase for comparison)
        header = [col.strip() for col in header_row]
        
        # Validate required columns
        required_columns = ['id', 'lat', 'lon', 'nuts_region_code']
        missing_columns = [col for col in required_columns if col not in header]
        if missing_columns:
            raise ValueError(f"CSV file missing required columns: {', '.join(missing_columns)}")
        
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
            addr_data = parse_csv_row(row, header)
            if addr_data is None:
                continue
            
            # Get region code
            region_code = addr_data.get('nuts_region_code')
            if not region_code:
                continue
            
            # Skip excluded regions
            if region_code in excluded_regions:
                continue
            
            # Get probability for this region (default to 0 if not found)
            probability = region_probabilities.get(region_code, 0.0)
            
            # Decide whether to insert based on region-specific probability
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

