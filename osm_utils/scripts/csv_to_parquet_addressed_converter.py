#!/usr/bin/env python3
"""
Fast CSV to Parquet converter for address data with region splitting.

Converts address CSV files to separate Parquet files per NUTS2 region using Polars for maximum performance.

Usage:
    python csv_to_parquet_addressed_converter.py <csv_path> [--output-file FILE.zip] [--max-rows N] [--profile]
"""

import argparse
import cProfile
import gzip
import json
import pstats
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq
from shapely.geometry import Point
from tqdm import tqdm


def csv_to_parquet_addressed_converter(
    csv_path: str | Path,
    output_zip: str | Path,
    batch_size: int = 100_000,
    max_rows: Optional[int] = None,
) -> Path:
    """
    Convert addresses CSV to Parquet files, one per NUTS2 region, then ZIP them.

    Processes in batches to minimize memory usage and creates separate parquet files
    for each NUTS2 region. All files are then compressed into a single ZIP archive.

    Parameters
    ----------
    csv_path : str | Path
        Path to the CSV file containing addresses/buildings (supports .gz)
    output_zip : str | Path
        Path where to save the ZIP file containing all regional Parquet files
    batch_size : int, default 100_000
        Number of rows to process in each batch
    max_rows : Optional[int], default None
        Maximum number of rows to process. If None, processes all rows

    Returns
    -------
    Path
        Path to the created ZIP file
    """
    csv_path = Path(csv_path)
    output_zip = Path(output_zip)

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    print(f"Converting {csv_path.name} to regional Parquet files...")

    # Create temporary directory for Parquet files
    with tempfile.TemporaryDirectory(prefix="address_conversion_") as temp_dir:
        temp_output_dir = Path(temp_dir)

        # Load NUTS2 boundaries for region assignment
        print("Loading NUTS2 boundaries...")
        gdf_nuts2 = load_nuts2_boundaries()
        id_col = "id" if "id" in gdf_nuts2.columns else "NUTS_ID"

        # Track parquet files and writers per region
        region_files: dict[str, Path] = {}
        region_writers: dict[str, pq.ParquetWriter] = {}
        region_counts: dict[str, int] = {}

        # Define consistent schema for all batches
        schema_overrides = {
            'id': 'int64',
            'lat': 'float64',
            'lon': 'float64',
            'is_building': 'int32',
            'is_addr': 'int32',
            'is_relation': 'int32',
            'is_node': 'int32',
            'is_way': 'int32',
            'city': 'string',
            'tags': 'string'
        }

        # Process CSV in batches
        print(f"Processing CSV in batches of {batch_size:,} rows...")

        total_processed = 0

        with tqdm(desc=f"Processing {csv_path.name}", unit="rows") as pbar:
            for chunk_num, df_chunk in enumerate(pd.read_csv(
                csv_path if csv_path.suffix != ".gz" else gzip.open(csv_path, "rt", encoding="utf-8"),
                chunksize=batch_size,
                dtype=schema_overrides,
                engine='c'
            )):
                # Check if we've reached max_rows limit before processing this chunk
                if max_rows is not None and total_processed >= max_rows:
                    break

                # Calculate how many rows we can process from this chunk
                remaining_rows = max_rows - total_processed if max_rows is not None else len(df_chunk)
                if remaining_rows < len(df_chunk):
                    # Only process part of this chunk
                    df_chunk = df_chunk.head(remaining_rows)

                current_batch_size = len(df_chunk)
                total_processed += current_batch_size

                # Validate required columns
                required_cols = ["id", "is_building", "is_addr", "lat", "lon"]
                missing_cols = [col for col in required_cols if col not in df_chunk.columns]
                if missing_cols:
                    raise ValueError(f"Missing required columns: {missing_cols}")

                # Convert to GeoDataFrame for spatial join (optimized batch processing)
                geometry = [Point(lon, lat) for lon, lat in zip(df_chunk["lon"], df_chunk["lat"])]
                gdf_chunk = gpd.GeoDataFrame(df_chunk, geometry=geometry, crs="EPSG:4326")

                # Reproject addresses to match NUTS boundaries (EPSG:3857)
                gdf_chunk = gdf_chunk.to_crs("EPSG:3857")

                # Spatial join to find NUTS2 region for each point
                gdf_with_regions = gpd.sjoin(
                    gdf_chunk,
                    gdf_nuts2[[id_col, "geometry"]],
                    how="left",
                    predicate="within",
                )

                # Clean up join artifacts
                if "index_right" in gdf_with_regions.columns:
                    gdf_with_regions = gdf_with_regions.drop(columns=["index_right"])

                # Rename NUTS ID column
                if id_col in gdf_with_regions.columns:
                    gdf_with_regions = gdf_with_regions.rename(columns={id_col: "nuts_region_code"})

                # Group by region and accumulate/write
                for nuts_code, group in gdf_with_regions.groupby("nuts_region_code", dropna=False):
                    if pd.isna(nuts_code):
                        continue  # Skip addresses without a region

                    nuts_code_str = str(nuts_code)

                    # Initialize region file and writer if needed
                    if nuts_code_str not in region_files:
                        region_file = temp_output_dir / f"addresses_{nuts_code_str}.parquet"
                        region_files[nuts_code_str] = region_file
                        region_counts[nuts_code_str] = 0

                        # Create ParquetWriter for this region with consistent schema
                        # Define schema upfront to avoid mismatches
                        schema = pa.schema([
                            pa.field("id", pa.int64()),
                            pa.field("is_building", pa.int32()),
                            pa.field("is_addr", pa.int32()),
                            pa.field("is_relation", pa.int32()),
                            pa.field("is_node", pa.int32()),
                            pa.field("is_way", pa.int32()),
                            pa.field("lat", pa.float64()),
                            pa.field("lon", pa.float64()),
                            pa.field("city", pa.string()),
                            pa.field("tags", pa.string()),
                            pa.field("nuts_region_code", pa.string()),
                        ])
                        region_writers[nuts_code_str] = pq.ParquetWriter(
                            region_file, schema=schema
                        )

                    # Update count
                    region_counts[nuts_code_str] += len(group)

                    # Convert group to PyArrow and write (ensure schema consistency)
                    group_no_geom = group.drop(columns=['geometry']).copy()

                    # Reset index to avoid __index_level_0__ column
                    group_no_geom = group_no_geom.reset_index(drop=True)

                    # Ensure all columns match the expected schema
                    expected_columns = ['id', 'is_building', 'is_addr', 'is_relation', 'is_node', 'is_way', 'lat', 'lon', 'city', 'tags', 'nuts_region_code']
                    for col in expected_columns:
                        if col not in group_no_geom.columns:
                            if col == 'nuts_region_code':
                                group_no_geom[col] = nuts_code_str
                            else:
                                group_no_geom[col] = None

                    # Reorder columns to match schema
                    group_no_geom = group_no_geom[expected_columns]

                    # Convert to PyArrow table
                    table = pa.Table.from_pandas(group_no_geom)
                    region_writers[nuts_code_str].write_table(table)

                pbar.update(current_batch_size)
                pbar.set_description(f"Processed {total_processed:,} rows, {len(region_files)} regions")

                # Check if we've reached max_rows limit
                if max_rows is not None and total_processed >= max_rows:
                    print(f"  Reached max_rows limit ({max_rows:,}) - stopping processing")
                    break

        # Close all ParquetWriter instances
        print(f"\nClosing {len(region_writers)} Parquet writers...")
        for writer in region_writers.values():
            writer.close()

        print(f"\n✓ Created {len(region_files)} GeoParquet files in temporary directory")

        # Create ZIP archive
        print(f"Creating ZIP archive: {output_zip.name}")
        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for nuts_code, parquet_file in region_files.items():
                # Add to ZIP with a clean name
                zip_name = f"addresses_{nuts_code}.parquet"
                zipf.write(parquet_file, zip_name)

        # Get ZIP file size
        zip_size_mb = output_zip.stat().st_size / (1024 * 1024)

        print(f"\n✅ Conversion complete!")
        print(f"  ZIP archive: {output_zip}")
        print(f"  ZIP size: {zip_size_mb:.1f} MB")
        print(f"  Regions: {len(region_files)}")
        print(f"  Total addresses: {sum(region_counts.values()):,}")

        # Show top 10 regions by count
        top_regions = sorted(region_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        print(f"  Top regions:")
        for nuts_code, count in top_regions:
            print(f"    {nuts_code}: {count:,} addresses")

    return output_zip


def load_nuts2_boundaries():
    """Load NUTS2 boundaries for region assignment."""
    from pathlib import Path

    script_dir = Path(__file__).parent.parent.parent
    geojson_path = script_dir / "osm_files" / "regions" / "combined_01m.geojson"

    if not geojson_path.exists():
        raise FileNotFoundError(f"GeoJSON file not found: {geojson_path}")

    print(f"Loading NUTS boundaries from {geojson_path.name}...")

    # Load GeoJSON
    gdf = gpd.read_file(geojson_path)

    # Filter to NUTS level 2
    if "LEVL_CODE" in gdf.columns:
        gdf_nuts2 = gdf[gdf["LEVL_CODE"] == 2].copy()
    elif "id" in gdf.columns:
        # NUTS2 codes are 4 characters (e.g., "NL31")
        gdf_nuts2 = gdf[gdf["id"].str.len() == 4].copy()
    else:
        print("Warning: Could not determine NUTS level. Using all regions.")
        gdf_nuts2 = gdf.copy()

    # Ensure CRS is EPSG:3857 (Web Mercator)
    if gdf_nuts2.crs is None:
        # Try to infer from file
        with geojson_path.open("r") as f:
            import json
            data = json.load(f)
            crs_info = data.get("crs", {})
            if "properties" in crs_info:
                crs_name = crs_info["properties"].get("name", "")
                if "3857" in crs_name:
                    gdf_nuts2.set_crs("EPSG:3857", inplace=True)

    if gdf_nuts2.crs is None or str(gdf_nuts2.crs) != "EPSG:3857":
        print("Warning: CRS is not EPSG:3857. Reprojecting...")
        if gdf_nuts2.crs is None:
            gdf_nuts2.set_crs("EPSG:3857", inplace=True)
        else:
            gdf_nuts2 = gdf_nuts2.to_crs("EPSG:3857")

    print(f"✓ Loaded {len(gdf_nuts2):,} NUTS2 regions")
    return gdf_nuts2

def profile_csv_conversion(
    csv_path: str | Path,
    output_zip: str | Path,
    max_rows: Optional[int] = None,
) -> Path:
    """
    Profile the CSV to Parquet conversion process with region splitting.

    Parameters
    ----------
    csv_path : str | Path
        Path to the CSV file containing addresses/buildings
    output_zip : str | Path
        Path where to save the ZIP file containing all regional Parquet files
    max_rows : Optional[int], default None
        Maximum number of rows to process. If None, processes all rows

    Returns
    -------
    Path
        Path to the created ZIP file
    """
    print(f"🔍 Profiling conversion with cProfile...")

    pr = cProfile.Profile()
    pr.enable()

    # Run the conversion
    result = csv_to_parquet_addressed_converter(
        csv_path=csv_path,
        output_zip=output_zip,
        max_rows=max_rows,
    )

    pr.disable()

    # Save profile results
    profile_output = csv_path.parent / f"profile_{csv_path.stem}.txt"
    with open(profile_output, "w") as f:
        ps = pstats.Stats(pr, stream=f).sort_stats('cumulative')
        ps.print_stats()

    print(f"📊 Profile saved to: {profile_output}")

    # Print top 10 functions
    print("\n📈 Top 10 most time-consuming functions:")
    ps = pstats.Stats(pr).sort_stats('cumulative')
    ps.print_stats(10)

    return result


def main():
    """Command line interface for the CSV to Parquet converter."""
    parser = argparse.ArgumentParser(
        description="Fast CSV to Parquet converter for address data with region splitting",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python csv_to_parquet_addressed_converter.py addresses.csv
  python csv_to_parquet_addressed_converter.py addresses.csv.gz --output-file addresses_regions.zip --max-rows 100000
  python csv_to_parquet_addressed_converter.py addresses.csv.gz --profile
        """
    )

    parser.add_argument(
        "csv_path",
        help="Path to the CSV file (supports .gz compression)"
    )

    parser.add_argument(
        "--output-file",
        help="Output ZIP file path (default: based on input filename)"
    )

    parser.add_argument(
        "--max-rows",
        type=int,
        help="Maximum number of rows to process (default: all rows)"
    )

    parser.add_argument(
        "--profile",
        action="store_true",
        help="Enable performance profiling"
    )

    args = parser.parse_args()

    csv_path = Path(args.csv_path)

    # Determine output filename
    if args.output_file:
        output_zip = Path(args.output_file)
    else:
        # Base it on input filename: remove .csv.gz/.csv and add _regions.zip
        base_name = csv_path.stem
        if base_name.endswith('.csv'):
            base_name = base_name[:-4]  # Remove .csv extension
        output_zip = csv_path.parent / f"{base_name}_regions.zip"

    if args.profile:
        # Run with profiling
        print(f"🔍 Profiling conversion of {csv_path.name}")
        result = profile_csv_conversion(
            csv_path=csv_path,
            output_zip=output_zip,
            max_rows=args.max_rows,
        )
    else:
        # Run normal conversion
        print(f"🚀 Converting {csv_path.name} to regional Parquet files (ZIP archive)")
        result = csv_to_parquet_addressed_converter(
            csv_path=csv_path,
            output_zip=output_zip,
            max_rows=args.max_rows,
        )

    print(f"✅ Conversion complete: {result}")


if __name__ == "__main__":
    main()