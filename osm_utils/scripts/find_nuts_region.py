"""
CLI utility to map points (lat/lon) to Eurostat NUTS regions.
"""

from __future__ import annotations

import csv
import gzip
from pathlib import Path
from typing import IO

import click

from osm_utils.nuts_lookup import NUTSIndex


def _open_gzip_text(path: Path) -> IO[str]:
    return gzip.open(path, mode="rt", encoding="utf-8", newline="")


@click.command()
@click.option(
    "--geojson",
    "geojson_path",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=Path("../osm_files/nutsrg_2024_3857_60M_level2.geojson"),
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
    "--limit",
    type=int,
    default=10,
    show_default=True,
    help="Max number of address rows to process (only used with --addresses-gz).",
)
def main(geojson_path: Path, lat: float | None, lon: float | None, addresses_gz: Path | None, limit: int) -> None:
    """
    Print the containing NUTS region for a point or a small sample from an addresses file.
    """

    if addresses_gz is None and (lat is None or lon is None):
        raise click.UsageError("Provide either --addresses-gz or both --lat and --lon.")
    if addresses_gz is not None and (lat is not None or lon is not None):
        raise click.UsageError("Use either --addresses-gz OR --lat/--lon, not both.")

    index = NUTSIndex.from_geojson_file(geojson_path)

    if addresses_gz is None:
        region = index.lookup_wgs84(lat=lat, lon=lon)  # type: ignore[arg-type]
        if region is None:
            click.echo("NOT_FOUND")
            return
        click.echo(f"{region.nuts_id}\t{region.name or ''}")
        return

    processed = 0
    with _open_gzip_text(addresses_gz) as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise click.ClickException("No CSV header found in addresses file.")

        if "lat" not in reader.fieldnames or "lon" not in reader.fieldnames:
            raise click.ClickException(f"Expected 'lat'/'lon' columns, got: {reader.fieldnames}")

        click.echo("address_id\tlat\tlon\tnuts_id\tnuts_name")
        for row in reader:
            if processed >= limit:
                break

            address_id = row.get("id", "")
            lat_s = row.get("lat", "")
            lon_s = row.get("lon", "")

            try:
                lat_v = float(lat_s) if lat_s is not None else float("nan")
                lon_v = float(lon_s) if lon_s is not None else float("nan")
            except ValueError:
                continue

            region = index.lookup_wgs84(lat=lat_v, lon=lon_v)
            if region is None:
                click.echo(f"{address_id}\t{lat_s}\t{lon_s}\t\t")
            else:
                click.echo(f"{address_id}\t{lat_s}\t{lon_s}\t{region.nuts_id}\t{region.name or ''}")

            processed += 1


if __name__ == "__main__":
    main()



