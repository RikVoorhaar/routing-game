#!/usr/bin/env python3
"""
Seed regions table from GeoJSON file.

This script reads a GeoJSON file containing NUTS region data and populates
the region table with unique regions (code, country_code, name_latn).
"""

import click
import json
from pathlib import Path
from typing import Any
import sys

# Import our database module
sys.path.append(str(Path(__file__).parent.parent / 'src'))
from osm_utils.database import Region, create_db_session, init_database


def extract_regions_from_geojson(geojson_path: Path) -> dict[str, dict[str, Any]]:
    """
    Extract unique regions from GeoJSON file.
    
    Parameters
    ----------
    geojson_path: Path
        Path to the GeoJSON file
    
    Returns
    -------
    dict[str, dict[str, Any]]
        Dictionary mapping region code to region data
    """
    regions: dict[str, dict[str, Any]] = {}
    
    print(f"Reading GeoJSON file: {geojson_path}")
    with open(geojson_path, 'r', encoding='utf-8') as f:
        geojson_data = json.load(f)
    
    if 'features' not in geojson_data:
        raise ValueError("GeoJSON file must contain 'features' array")
    
    for feature in geojson_data['features']:
        props = feature.get('properties', {})
        
        nuts_id = props.get('NUTS_ID')
        cntr_code = props.get('CNTR_CODE')
        name_latn = props.get('NAME_LATN')
        
        if not nuts_id or not cntr_code or not name_latn:
            continue
        
        # Use NUTS_ID as key to ensure uniqueness
        if nuts_id not in regions:
            regions[nuts_id] = {
                'code': nuts_id,
                'country_code': cntr_code,
                'name_latn': name_latn
            }
    
    return regions


def seed_regions(regions: dict[str, dict[str, Any]], session) -> tuple[int, int]:
    """
    Upsert regions into the database.
    
    Parameters
    ----------
    regions: dict[str, dict[str, Any]]
        Dictionary of region data to insert/update
    session
        SQLAlchemy session
    
    Returns
    -------
    tuple[int, int]
        Tuple of (inserted_count, updated_count)
    """
    from sqlalchemy.dialects.postgresql import insert
    
    # Get count before upsert
    count_before = session.query(Region).count()
    
    # Prepare bulk insert data
    values_list = list(regions.values())
    
    # Use PostgreSQL INSERT ... ON CONFLICT DO UPDATE (upsert)
    stmt = insert(Region).values(values_list)
    stmt = stmt.on_conflict_do_update(
        index_elements=['code'],
        set_={
            'country_code': stmt.excluded.country_code,
            'name_latn': stmt.excluded.name_latn
        }
    )
    
    session.execute(stmt)
    session.commit()
    
    # Get count after upsert
    count_after = session.query(Region).count()
    
    # Calculate inserted count (new regions)
    inserted_count = count_after - count_before
    # Updated count is the rest
    updated_count = len(regions) - inserted_count
    
    return (inserted_count, updated_count)


@click.command()
@click.argument('geojson_file', type=click.Path(exists=True))
def main(geojson_file: str):
    """
    Seed regions table from GeoJSON file.
    
    The GeoJSON file should contain features with properties:
    - NUTS_ID: NUTS region code
    - CNTR_CODE: Country code
    - NAME_LATN: Latin name of the region
    """
    geojson_path = Path(geojson_file)
    
    print(f"Seeding regions from: {geojson_file}")
    
    # Initialize database
    print("Initializing database...")
    init_database()
    
    # Extract regions from GeoJSON
    print("Extracting regions from GeoJSON...")
    regions = extract_regions_from_geojson(geojson_path)
    print(f"Found {len(regions):,} unique regions")
    
    # Seed regions
    print("Inserting/updating regions in database...")
    session = create_db_session()
    try:
        inserted_count, updated_count = seed_regions(regions, session)
        print(f"Inserted {inserted_count:,} regions")
        if updated_count > 0:
            print(f"Updated {updated_count:,} regions")
    except Exception as e:
        session.rollback()
        print(f"Error seeding regions: {e}")
        raise
    finally:
        session.close()
    
    # Get final count
    session = create_db_session()
    try:
        total_count = session.query(Region).count()
        print(f"Total regions in database: {total_count:,}")
    finally:
        session.close()
    
    print("Seeding complete!")


if __name__ == '__main__':
    main()

