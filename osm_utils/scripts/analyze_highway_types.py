#!/usr/bin/env python3
"""
Analyze highway types in an OSM file by frequency.
"""

import click
import pandas as pd
from pathlib import Path
import sys
import os

# Add the parent directory to the path so we can import osm_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from osm_utils.osm_analyzer import OSMHandler


@click.command()
@click.argument('osm_file', type=click.Path(exists=True))
@click.option('--output', '-o', help='Output CSV file for highway type analysis')
def main(osm_file: str, output: str):
    """Analyze highway types in an OSM file by frequency."""
    
    print(f"Analyzing highway types in: {osm_file}")
    
    # Parse OSM file - we want to count ALL highway types, not just routable ones
    handler = OSMHandler(include_all_highway_types=True)
    print("Parsing OSM file...")
    handler.apply_file(osm_file)
    
    print(f"Found {len(handler.nodes):,} total nodes")
    print(f"Found {len(handler.ways):,} total ways with highway tags")
    
    # Create dataframe from highway counts
    highway_data = []
    total_highways = sum(handler.highway_counts.values())
    
    for highway_type, count in sorted(handler.highway_counts.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / total_highways * 100) if total_highways > 0 else 0
        highway_data.append({
            'highway_type': highway_type,
            'count': count,
            'percentage': percentage
        })
    
    df = pd.DataFrame(highway_data)
    
    # Print results
    print(f"\n=== Highway Types Analysis ===")
    print(f"Total ways with highway tags: {total_highways:,}")
    print(f"Number of different highway types: {len(handler.highway_counts)}")
    
    print(f"\n=== Highway Types by Frequency ===")
    print("Highway Type           | Count     | Percentage")
    print("-" * 50)
    
    for _, row in df.head(30).iterrows():  # Show top 30
        print(f"{row['highway_type']:<20} | {row['count']:8,} | {row['percentage']:9.1f}%")
    
    if len(df) > 30:
        remaining = len(df) - 30
        print(f"... and {remaining} more highway types")
    
    # Save to file
    if output is None:
        # Default output filename based on input
        input_path = Path(osm_file)
        output = input_path.parent / f"{input_path.stem}_highway_types.csv"
    
    df.to_csv(output, index=False)
    print(f"\nHighway type analysis saved to {output}")


if __name__ == '__main__':
    main() 