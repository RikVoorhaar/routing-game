#!/usr/bin/env python3
"""
Profile the CSV to Parquet conversion process (simplified version).

This script converts CSV to Parquet using simple lat/lon coordinates
without GeoPandas geometry operations for maximum performance.
"""

#!/usr/bin/env python3
"""
Fast CSV to Parquet converter for address data.

Converts address CSV files to Parquet format using Polars for maximum performance.
No geometry operations - processes lat/lon coordinates as simple floats.

Usage:
    python csv_to_parquet_addressed_converter.py <csv_path> [--output-dir DIR] [--max-rows N]
"""

import argparse
import cProfile
import pstats
import sys
from pathlib import Path
from typing import Optional

import polars as pl
import pyarrow.parquet as pq
from tqdm import tqdm


def csv_to_parquet_addressed_converter(
    csv_path: str | Path,
    output_dir: Optional[str | Path] = None,
    max_rows: Optional[int] = None,
) -> dict[str, Path]:
    """
    Convert addresses CSV to Parquet files using Polars + PyArrow.

    Ultra-fast version using Polars for CSV reading + PyArrow for Parquet writing.
    No geometry operations - just lat/lon as floats.

    Parameters
    ----------
    csv_path : str | Path
        Path to the CSV file containing addresses/buildings (supports .gz)
    output_dir : Optional[str | Path], default None
        Directory to save parquet files
    batch_size : int, default 500_000
        Number of rows to process in each batch (Polars handles large batches well)
    max_rows : Optional[int], default None
        Maximum number of rows to process. If None, processes all rows

    Returns
    -------
    dict[str, Path]
        Dictionary with single entry for the output file
    """
    csv_path = Path(csv_path)

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    # Determine output directory
    if output_dir is None:
        output_dir = csv_path.parent / "addresses_simple"
    else:
        output_dir = Path(output_dir) / "addresses_simple"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "addresses.parquet"

    with tqdm(desc=f"Converting {csv_path.name}", unit="rows") as pbar:
        # Read CSV with Polars (handles gzip automatically)
        pbar.set_description("Reading CSV with Polars")

        # Configure Polars CSV reading for maximum performance
        df = pl.scan_csv(
            csv_path,
            separator=",",
            has_header=True,
            encoding="utf8",
            dtypes={
                "id": pl.Int64,
                "is_building": pl.Int32,
                "is_addr": pl.Int32,
                "lat": pl.Float64,
                "lon": pl.Float64,
            },
            # Let Polars infer other columns
        )

        # Limit rows if specified
        if max_rows is not None:
            df = df.limit(max_rows)

        # Collect into DataFrame with optimized batch processing
        pbar.set_description("Processing data")
        df_polars = df.collect()

        total_processed = len(df_polars)
        pbar.update(total_processed)
        pbar.set_description(f"✓ Loaded {total_processed:,} rows")

        # Validate required columns
        required_cols = ["id", "is_building", "is_addr", "lat", "lon"]
        missing_cols = [col for col in required_cols if col not in df_polars.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")

        # Convert to PyArrow table directly from Polars
        pbar.set_description("Converting to PyArrow")
        table = df_polars.to_arrow()

        pbar.set_description("Writing to Parquet")
        # Write to Parquet with optimizations
        pq.write_table(
            table,
            output_file,
            row_group_size=250000,  # Larger row groups for Polars data
            compression='snappy',
            use_dictionary=True
        )

        pbar.set_description(f"✓ Created Parquet file with {total_processed:,} addresses")

    if output_file.exists():
        file_size_mb = output_file.stat().st_size / (1024 * 1024)
        tqdm.write(f"  Output: {output_file}")
        tqdm.write(f"  File size: {file_size_mb:.1f} MB")

    return {"addresses": output_file}

def profile_csv_conversion(
    csv_path: str | Path,
    output_dir: Optional[str | Path] = None,
    max_rows: int = 1_000_000,
    profile_output: str = "profile_results.prof",
    text_output: str = "profile_results.txt",
) -> dict[str, Path]:
    """
    Profile the simplified CSV to Parquet conversion process.

    Runs csv_to_parquet_simple with profiling enabled and saves
    the results for analysis. Uses simple lat/lon coordinates without geometry operations.

    Parameters
    ----------
    csv_path : str | Path
        Path to the CSV file containing addresses/buildings
    output_dir : Optional[str | Path], default None
        Directory to save parquet files
    max_rows : int, default 1_000_000
        Maximum number of rows to process for profiling
    profile_output : str, default "profile_results.prof"
        Path to save binary profiling data
    text_output : str, default "profile_results.txt"
        Path to save human-readable profiling report

    Returns
    -------
    dict[str, Path]
        Dictionary with single entry for the output file
    """
    print(f"Starting profiling of CSV conversion with max_rows={max_rows:,}...")

    # Run the conversion with profiling
    profiler = cProfile.Profile()
    profiler.enable()

    try:
        result = csv_to_parquet_addressed_converter(
            csv_path=csv_path,
            output_dir=output_dir,
            max_rows=max_rows,
        )
    finally:
        profiler.disable()

    # Save profiling results
    print(f"Saving profiling data to {profile_output}...")
    profiler.dump_stats(profile_output)

    # Generate and save text report
    print(f"Generating text report to {text_output}...")
    with open(text_output, "w") as f:
        stats = pstats.Stats(profiler, stream=f)
        stats.sort_stats("cumulative")
        stats.print_stats(50)  # Top 50 functions by cumulative time

    # Print summary statistics
    print("\n=== Profiling Summary ===")
    stats = pstats.Stats(profiler)
    stats.sort_stats("cumulative")

    # Get total time
    total_time = sum(stat[3] for stat in stats.stats.values())  # cumulative time
    print(f"Total execution time: {total_time:.2f} seconds")

    # Show top 10 most time-consuming functions
    print("\nTop 10 most time-consuming functions:")
    for i, (filename_lineno_func, (cc, nc, tt, ct, callers)) in enumerate(list(stats.stats.items())[:10]):
        func_name = filename_lineno_func[2]
        print(f"  {i+1}. {func_name}: {ct:.2f}s cumulative")

    print("\nDetailed reports saved to:")
    print(f"  Binary: {profile_output}")
    print(f"  Text:   {text_output}")

    return result


if __name__ == "__main__":
    # Profile the Europe addresses conversion
    osm_files_folder = Path(__file__).parent.parent.parent / "osm_files"
    csv_path = osm_files_folder / "europe-latest.addresses_20260110_222142.csv.gz"
    output_dir = osm_files_folder / "addresses_by_region"

    output_dir = osm_files_folder / "addresses_simple"
    print(f"Profiling simplified CSV conversion from: {csv_path}")
    print(f"Output directory: {output_dir}")

    # Clean the output directory for a fresh profiling run
    if output_dir.exists():
        print(f"Cleaning existing output directory: {output_dir}")
        import shutil
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Clean up any existing profile result files
    profile_prof = osm_files_folder / "profile_results_simple.prof"
    profile_txt = osm_files_folder / "profile_results_simple.txt"
    if profile_prof.exists():
        profile_prof.unlink()
        print(f"Removed existing profile file: {profile_prof}")
    if profile_txt.exists():  
        profile_txt.unlink()
        print(f"Removed existing profile file: {profile_txt}")

def main():
    """Command line interface for the CSV to Parquet converter."""
    parser = argparse.ArgumentParser(
        description="Fast CSV to Parquet converter for address data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python csv_to_parquet_addressed_converter.py addresses.csv
  python csv_to_parquet_addressed_converter.py addresses.csv.gz --output-dir ./output --max-rows 100000
        """
    )

    parser.add_argument(
        "csv_path",
        help="Path to the CSV file (supports .gz compression)"
    )

    parser.add_argument(
        "--output-dir",
        help="Output directory (default: same as input file directory)"
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

    if args.profile:
        # Run with profiling
        print(f"🔍 Profiling conversion of {csv_path.name}")
        result = profile_csv_conversion(
            csv_path=csv_path,
            output_dir=Path(args.output_dir) if args.output_dir else None,
            max_rows=args.max_rows,
        )
    else:
        # Run normal conversion
        print(f"🚀 Converting {csv_path.name} to Parquet")
        result = csv_to_parquet_addressed_converter(
            csv_path=csv_path,
            output_dir=Path(args.output_dir) if args.output_dir else None,
            max_rows=args.max_rows,
        )

    output_file = result["addresses"]
    print(f"✅ Conversion complete: {output_file}")


if __name__ == "__main__":
    main()