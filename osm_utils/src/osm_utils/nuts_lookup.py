"""
Utilities for looking up Eurostat NUTS regions for a given point.

The intended workflow is to download a NUTS GeoJSON (e.g. from Nuts2json) and
use :class:`~osm_utils.nuts_lookup.NUTSIndex` to map WGS84 lat/lon coordinates
to NUTS region IDs.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from numbers import Integral
from typing import Any, Iterable, Mapping, Sequence

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree


_WEB_MERCATOR_MAX_LAT_DEG: float = 85.05112878
_WEB_MERCATOR_EARTH_RADIUS_M: float = 6_378_137.0


def wgs84_to_web_mercator(lat: float, lon: float) -> tuple[float, float]:
    """
    Convert WGS84 latitude/longitude (EPSG:4326) to Web Mercator (EPSG:3857).

    Parameters
    ----------
    lat
        Latitude in degrees.
    lon
        Longitude in degrees.

    Returns
    -------
    x, y
        Web Mercator coordinates in meters.
    """

    # Clamp to the valid latitude range of Web Mercator.
    if lat > _WEB_MERCATOR_MAX_LAT_DEG:
        lat = _WEB_MERCATOR_MAX_LAT_DEG
    elif lat < -_WEB_MERCATOR_MAX_LAT_DEG:
        lat = -_WEB_MERCATOR_MAX_LAT_DEG

    import math

    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)

    x = _WEB_MERCATOR_EARTH_RADIUS_M * lon_rad
    y = _WEB_MERCATOR_EARTH_RADIUS_M * math.log(math.tan((math.pi / 4.0) + (lat_rad / 2.0)))
    return (x, y)


@dataclass(frozen=True, slots=True)
class NUTSRegion:
    """
    A single NUTS region geometry with its identifying properties.

    Attributes
    ----------
    nuts_id
        NUTS identifier (e.g. "NL31").
    name
        Latin name of the region, when available.
    geometry
        Region geometry in the same CRS as the source GeoJSON (often EPSG:3857).
    """

    nuts_id: str
    name: str | None
    geometry: BaseGeometry


class NUTSIndex:
    """
    Spatial index for fast point-in-NUTS-region lookups.

    Parameters
    ----------
    regions
        Sequence of NUTS region records.
    """

    def __init__(self, regions: Sequence[NUTSRegion]) -> None:
        self._regions: Sequence[NUTSRegion] = regions
        geometries: list[BaseGeometry] = [r.geometry for r in regions]
        self._tree: STRtree = STRtree(geometries)

    @classmethod
    def from_geojson_file(cls, geojson_path: str | Path) -> "NUTSIndex":
        """
        Create a :class:`~osm_utils.nuts_lookup.NUTSIndex` from a GeoJSON file.

        The file is expected to be a FeatureCollection with features containing:
        - properties.id (NUTS ID)
        - properties.na (optional name)

        Parameters
        ----------
        geojson_path
            Path to the GeoJSON feature collection.

        Returns
        -------
        index
            Constructed NUTS index.
        """

        path = Path(geojson_path)
        with path.open("r", encoding="utf-8") as f:
            data: Mapping[str, Any] = json.load(f)

        features: Iterable[Mapping[str, Any]] = data.get("features", [])
        regions: list[NUTSRegion] = []

        for feat in features:
            props: Mapping[str, Any] = feat.get("properties", {})
            nuts_id_raw = props.get("id")
            if not isinstance(nuts_id_raw, str) or not nuts_id_raw:
                continue
            name_raw = props.get("na")
            name = name_raw if isinstance(name_raw, str) and name_raw else None

            geom_mapping = feat.get("geometry")
            if not isinstance(geom_mapping, Mapping):
                continue
            geom = shape(geom_mapping)
            if geom.is_empty:
                continue

            regions.append(NUTSRegion(nuts_id=nuts_id_raw, name=name, geometry=geom))

        return cls(regions=regions)

    def lookup_web_mercator(self, x: float, y: float) -> NUTSRegion | None:
        """
        Find the NUTS region containing a Web Mercator point.

        Parameters
        ----------
        x
            Web Mercator x coordinate (meters).
        y
            Web Mercator y coordinate (meters).

        Returns
        -------
        region
            Matching NUTS region if found, otherwise None.
        """

        pt = Point(x, y)
        candidates = self._tree.query(pt)

        # Shapely 2.x returns an array of indices for STRtree.query(...)
        if len(candidates) == 0:
            return None

        if isinstance(candidates[0], Integral):
            indices: Iterable[int] = (int(i) for i in candidates)
            for idx in indices:
                region = self._regions[idx]
                if region.geometry.covers(pt):
                    return region
            return None

        # Fallback: older behavior returning geometries
        geom_to_index = {id(r.geometry): i for i, r in enumerate(self._regions)}
        for geom in candidates:
            idx = geom_to_index.get(id(geom))
            if idx is None:
                continue
            region = self._regions[idx]
            if region.geometry.covers(pt):
                return region
        return None

    def lookup_wgs84(self, lat: float, lon: float) -> NUTSRegion | None:
        """
        Find the NUTS region containing a WGS84 latitude/longitude point.

        Parameters
        ----------
        lat
            Latitude in degrees (EPSG:4326).
        lon
            Longitude in degrees (EPSG:4326).

        Returns
        -------
        region
            Matching NUTS region if found, otherwise None.
        """

        x, y = wgs84_to_web_mercator(lat=lat, lon=lon)
        return self.lookup_web_mercator(x=x, y=y)


