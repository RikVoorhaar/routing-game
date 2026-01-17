#!/usr/bin/env python3
"""
Extract places from a CSV file and save to PostgreSQL database with PostGIS.

This script reads CSV files (optionally gzipped) and inserts places with
tile coordinates calculated at zoom level 8.
"""

import click
import csv
import gzip
import math
import os
from pathlib import Path
from typing import Optional, Any
import sys
from tqdm import tqdm

# Import our database module
sys.path.append(str(Path(__file__).parent.parent / 'src'))
from osm_utils.database import (
    Place, create_db_session, init_database, 
    truncate_places_table
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


def lat_lon_to_tile(lat: float, lon: float, zoom: int = 8) -> tuple[int, int]:
    """
    Convert latitude/longitude to tile coordinates at specified zoom level.
    
    Uses Web Mercator tile formula.
    
    Parameters
    ----------
    lat: float
        Latitude in degrees
    lon: float
        Longitude in degrees
    zoom: int
        Zoom level (default: 8)
    
    Returns
    -------
    tuple[int, int]
        Tile coordinates (tile_x, tile_y)
    """
    n = 2 ** zoom
    tile_x = int(math.floor((lon + 180.0) / 360.0 * n))
    lat_rad = math.radians(lat)
    tile_y = int(math.floor((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n))
    return tile_x, tile_y


def wgs84_to_web_mercator(lat: float, lon: float) -> tuple[float, float]:
    """
    Convert WGS84 latitude/longitude (EPSG:4326) to Web Mercator (EPSG:3857).
    
    Parameters
    ----------
    lat: float
        Latitude in degrees
    lon: float
        Longitude in degrees
    
    Returns
    -------
    tuple[float, float]
        Web Mercator coordinates (x, y) in meters
    """
    WEB_MERCATOR_MAX_LAT_DEG: float = 85.05112878
    WEB_MERCATOR_EARTH_RADIUS_M: float = 6_378_137.0
    
    # Clamp to the valid latitude range of Web Mercator
    if lat > WEB_MERCATOR_MAX_LAT_DEG:
        lat = WEB_MERCATOR_MAX_LAT_DEG
    elif lat < -WEB_MERCATOR_MAX_LAT_DEG:
        lat = -WEB_MERCATOR_MAX_LAT_DEG
    
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    
    x = WEB_MERCATOR_EARTH_RADIUS_M * lon_rad
    y = WEB_MERCATOR_EARTH_RADIUS_M * math.log(math.tan((math.pi / 4.0) + (lat_rad / 2.0)))
    return (x, y)


def parse_csv_row(row: list[str], header: list[str]) -> Optional[dict[str, Any]]:
    """
    Parse a CSV row into place data.
    
    Parameters
    ----------
    row: list[str]
        CSV row as a list of strings
    header: list[str]
        CSV header row to map column names
    
    Returns
    -------
    Optional[dict[str, Any]]
        Place data dictionary or None if invalid
    """
    try:
        # Create a dictionary mapping column names to values
        row_dict = dict(zip(header, row))
        
        place_id_str = row_dict.get('id', '').strip()
        category = row_dict.get('category', '').strip()
        lat_str = row_dict.get('lat', '').strip()
        lon_str = row_dict.get('lon', '').strip()
        x_mercator_str = row_dict.get('x_mercator', '').strip()
        y_mercator_str = row_dict.get('y_mercator', '').strip()
        region = row_dict.get('region', '').strip()
        
        # Validate coordinates
        try:
            lat = float(lat_str)
            lon = float(lon_str)
            x_mercator = float(x_mercator_str)
            y_mercator = float(y_mercator_str)
        except (ValueError, IndexError):
            return None
        
        # Validate ID
        try:
            place_id = int(place_id_str)
        except (ValueError, IndexError):
            return None
        
        # Validate category
        if not category:
            return None
        
        # Validate region (required)
        if not region:
            return None
        
        # Calculate tile coordinates at zoom level 8
        tile_x, tile_y = lat_lon_to_tile(lat, lon, zoom=8)
        
        # Create PostGIS POINT geometries
        # EPSG:4326 (WGS84) - lon, lat order
        location_4326 = f"POINT({lon} {lat})"
        
        # EPSG:3857 (Web Mercator) - use provided x_mercator, y_mercator
        location_3857 = f"POINT({x_mercator} {y_mercator})"
        
        return {
            'id': place_id,
            'category': category,
            'lat': lat,
            'lon': lon,
            'x_mercator': x_mercator,
            'y_mercator': y_mercator,
            'region': region,
            'tile_x': tile_x,
            'tile_y': tile_y,
            'location_4326': location_4326,
            'location_3857': location_3857
        }
    except (ValueError, IndexError, KeyError):
        return None


def save_batch(places: list[dict[str, Any]], session) -> None:
    """
    Save a batch of places to the database using bulk insert.
    
    Parameters
    ----------
    places: list[dict[str, Any]]
        List of place dictionaries to insert
    session
        SQLAlchemy session
    """
    if not places:
        return
    
    from sqlalchemy.dialects.postgresql import insert
    
    # Prepare bulk insert data
    values_list = []
    for place_data in places:
        values_list.append({
            'id': place_data['id'],
            'category': place_data['category'],
            'lat': place_data['lat'],
            'lon': place_data['lon'],
            'x_mercator': place_data['x_mercator'],
            'y_mercator': place_data['y_mercator'],
            'region': place_data['region'],
            'tile_x': place_data['tile_x'],
            'tile_y': place_data['tile_y'],
            'location_4326': place_data['location_4326'],
            'location_3857': place_data['location_3857']
        })
    
    # Use bulk insert with ON CONFLICT DO NOTHING
    stmt = insert(Place).values(values_list)
    stmt = stmt.on_conflict_do_nothing(index_elements=['id'])
    session.execute(stmt)
    session.commit()


@click.command()
@click.argument('input_file', type=click.Path(exists=True), required=False)
@click.option('--batch-size', default=1000, help='Batch size for database inserts')
def main(
    input_file: Optional[str], 
    batch_size: int
):
    """
    Extract places from a CSV file and save to PostgreSQL database.
    
    The CSV file should have columns: id,category,lat,lon,x_mercator,y_mercator,region
    
    If INPUT_FILE is not provided, defaults to osm_files/europe-latest.places.csv.gz
    """
    # Default input file if not provided
    if input_file is None:
        default_path = Path('osm_files/europe-latest.places.csv.gz')
        if not default_path.exists():
            raise click.BadParameter(
                f"Default input file not found: {default_path}. Please specify INPUT_FILE."
            )
        input_file = str(default_path)
    
    input_path = Path(input_file)
    
    print(f"Extracting places from: {input_file}")
    print(f"Database batch size: {batch_size}")
    
    # Initialize database
    print("Initializing database...")
    init_database()
    
    # Clear existing places
    print("Clearing existing places...")
    truncate_places_table()
    
    # Get file size for progress tracking
    file_size = os.path.getsize(input_path)
    
    # Extract places
    print("Processing places...")
    
    places_batch: list[dict[str, Any]] = []
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
        required_columns = ['id', 'category', 'lat', 'lon', 'x_mercator', 'y_mercator']
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
            place_data = parse_csv_row(row, header)
            if place_data is None:
                continue
            
            places_batch.append(place_data)
            inserted_count += 1
            
            # Save batch when it reaches batch_size
            if len(places_batch) >= batch_size:
                session = create_db_session()
                try:
                    save_batch(places_batch, session)
                    places_batch.clear()
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
    if places_batch:
        session = create_db_session()
        try:
            save_batch(places_batch, session)
        except Exception as e:
            session.rollback()
            print(f"Error saving final batch: {e}")
            raise
        finally:
            session.close()
    
    print(f"\nExtraction complete!")
    print(f"Processed {processed_count:,} places from CSV")
    print(f"Inserted {inserted_count:,} places ({inserted_count/processed_count*100:.2f}%)")
    
    # Get final count from database
    session = create_db_session()
    try:
        db_count = session.query(Place).count()
        print(f"Final database count: {db_count:,} places")
    finally:
        session.close()


if __name__ == '__main__':
    main()
