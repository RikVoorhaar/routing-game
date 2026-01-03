"""
CLI utility to map points (lat/lon) to Eurostat NUTS regions.

Processes address files and adds NUTS region codes to each address.
"""

from __future__ import annotations

import csv
import gzip
import os
from collections import Counter
from pathlib import Path
from typing import IO

import click
from tqdm import tqdm

from osm_utils.nuts_lookup import NUTSIndex


def _open_gzip_text(path: Path) -> IO[str]:
    return gzip.open(path, mode="rt", encoding="utf-8", newline="")


@click.command()
@click.option(
    "--geojson",
    "geojson_path",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=Path("../osm_files/regions/combined_01m.geojson"),
    show_default=True,
    help="Path to the NUTS regions GeoJSON file (typically EPSG:3857).",
)
@click.option("--lat", type=float, default=None, help="Latitude in degrees (EPSG:4326).")
@click.option("--lon", type=float, default=None, help="Longitude in degrees (EPSG:4326).")
@click.option(
    "--addresses-gz",
    "addresses_gz",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=None,
    help="Path to an addresses CSV.gz file with 'lat' and 'lon' columns.",
)
@click.option(
    "--output",
    "output_path",
    type=click.Path(path_type=Path, file_okay=True, dir_okay=False),
    default=None,
    help="Output CSV file path. If not specified, appends '_with_regions' to input filename.",
)
@click.option(
    "--limit",
    type=int,
    default=100,
    show_default=True,
    help="Max number of address rows to process (0 = process all).",
)
def main(
    geojson_path: Path,
    lat: float | None,
    lon: float | None,
    addresses_gz: Path | None,
    output_path: Path | None,
    limit: int,
) -> None:
    """
    Map addresses to NUTS regions and write output CSV with region codes.

    For single point lookup, provide --lat and --lon.
    For batch processing, provide --addresses-gz.
    """

    if addresses_gz is None and (lat is None or lon is None):
        raise click.UsageError("Provide either --addresses-gz or both --lat and --lon.")
    if addresses_gz is not None and (lat is not None or lon is not None):
        raise click.UsageError("Use either --addresses-gz OR --lat/--lon, not both.")

    click.echo(f"Loading NUTS index from {geojson_path.name}...")
    index = NUTSIndex.from_geojson_file(geojson_path)

    if addresses_gz is None:
        # Single point lookup
        region = index.lookup_wgs84(lat=lat, lon=lon)  # type: ignore[arg-type]
        if region is None:
            click.echo("NOT_FOUND")
            return
        click.echo(f"{region.nuts_id}\t{region.name or ''}")
        return

    # Batch processing
    if output_path is None:
        # Generate output filename by appending '_with_regions' before .csv.gz
        input_stem = addresses_gz.stem.replace(".csv", "")
        output_path = addresses_gz.parent / f"{input_stem}_with_regions.csv.gz"

    # Get total file size for progress tracking (compressed size)
    total_file_size = os.path.getsize(addresses_gz)
    click.echo(f"Processing addresses from {addresses_gz.name} ({total_file_size / 1024 / 1024:.1f} MB)...")

    processed = 0
    skipped = 0
    found_regions = 0
    region_counts: Counter[str] = Counter()  # Track counts per region

    # Open gzip file in binary mode to track position
    with gzip.open(addresses_gz, "rb") as input_gz, gzip.open(output_path, "wt", encoding="utf-8", newline="") as output_f:
        # Read header line
        header_line = input_gz.readline()
        if not header_line:
            raise click.ClickException("No CSV header found in addresses file.")
        
        header = header_line.decode("utf-8").strip().split(",")
        
        # Find column indices
        try:
            id_idx = header.index("id")
            lat_idx = header.index("lat")
            lon_idx = header.index("lon")
        except ValueError as e:
            raise click.ClickException(f"Missing required column: {e}")

        # Prepare output columns: original columns + nuts_region_code
        output_fieldnames = header + ["nuts_region_code"]
        writer = csv.writer(output_f)
        writer.writerow(output_fieldnames)

        # Create progress bar based on file position (compressed bytes read)
        with tqdm(total=total_file_size, unit="B", unit_scale=True, unit_divisor=1024, desc="Processing") as pbar:
            while True:
                if limit > 0 and processed >= limit:
                    break

                # Read next line
                line_bytes = input_gz.readline()
                if not line_bytes:
                    break

                # Update progress bar based on current file position (every 100 rows)
                if processed % 100 == 0:
                    current_pos = input_gz.fileobj.tell()  # Position in compressed stream
                    pbar.n = min(current_pos, total_file_size)
                    pbar.refresh()

                # Parse CSV line manually
                line = line_bytes.decode("utf-8").strip()
                if not line:
                    continue

                # Simple CSV parsing (handles quoted fields)
                row = []
                in_quotes = False
                current_field = ""
                for char in line:
                    if char == '"':
                        in_quotes = not in_quotes
                    elif char == ',' and not in_quotes:
                        row.append(current_field)
                        current_field = ""
                    else:
                        current_field += char
                row.append(current_field)  # Add last field

                # Ensure we have enough columns
                while len(row) < len(header):
                    row.append("")

                # Extract coordinates
                try:
                    address_id = row[id_idx] if id_idx < len(row) else ""
                    lat_s = row[lat_idx] if lat_idx < len(row) else ""
                    lon_s = row[lon_idx] if lon_idx < len(row) else ""
                except IndexError:
                    skipped += 1
                    processed += 1
                    continue

                try:
                    lat_v = float(lat_s) if lat_s else float("nan")
                    lon_v = float(lon_s) if lon_s else float("nan")
                except (ValueError, TypeError):
                    # Invalid coordinates - write row with empty region code
                    row.append("")
                    writer.writerow(row)
                    skipped += 1
                    processed += 1
                    continue

                # Lookup region
                region = index.lookup_wgs84(lat=lat_v, lon=lon_v)
                if region is None:
                    row.append("")
                else:
                    region_id = region.nuts_id
                    row.append(region_id)
                    found_regions += 1
                    # Count addresses per region
                    region_counts[region_id] += 1

                writer.writerow(row)
                processed += 1

    click.echo(f"\n✓ Processed {processed} addresses")
    click.echo(f"  - Found regions: {found_regions}")
    click.echo(f"  - Skipped (invalid coords): {skipped}")
    click.echo(f"  - Output written to: {output_path}")

    # Write region counts to separate CSV file
    if region_counts:
        counts_output_path = output_path.parent / f"{output_path.stem.replace('.csv', '')}_region_counts.csv"
        with open(counts_output_path, "w", encoding="utf-8", newline="") as counts_f:
            counts_writer = csv.writer(counts_f)
            counts_writer.writerow(["nuts_region_code", "address_count"])
            # Sort by count descending, then by region code
            for region_id, count in sorted(region_counts.items(), key=lambda x: (-x[1], x[0])):
                counts_writer.writerow([region_id, count])
        click.echo(f"  - Region counts written to: {counts_output_path}")
        click.echo(f"    Found {len(region_counts)} unique regions")


if __name__ == "__main__":
    main()



