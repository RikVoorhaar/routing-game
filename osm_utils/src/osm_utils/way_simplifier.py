"""
Way simplification utilities for OSM preprocessing.

This module contains pure(ish) helpers that can be unit tested, plus a few small
parsers used by scripts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Protocol, Sequence, Tuple


class LocationLike(Protocol):
    """
    Minimal protocol for a geographic location.

    Parameters
    ---------------
    lat: float
        Latitude in degrees.
    lon: float
        Longitude in degrees.

    Notes
    ---------------
    Matches `osmium.osm.Location` used at runtime.
    """

    lat: float
    lon: float

    def valid(self) -> bool: ...


class LocationIndexLike(Protocol):
    """
    Minimal protocol for a node location index.
    """

    def get(self, node_id: int) -> LocationLike: ...


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute great-circle distance between two points in meters.

    Parameters
    ---------------
    lat1: float
        Latitude of point 1 in degrees.
    lon1: float
        Longitude of point 1 in degrees.
    lat2: float
        Latitude of point 2 in degrees.
    lon2: float
        Longitude of point 2 in degrees.

    Returns
    -----------
    float
        Distance in meters.
    """
    r = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def simplify_node_refs(node_refs: Sequence[int], kept_nodes: "set[int]") -> List[int]:
    """
    Simplify a node reference list to only include kept nodes (plus endpoints).

    Parameters
    ---------------
    node_refs: Sequence[int]
        Original node IDs in order.
    kept_nodes: set[int]
        Node IDs that must be preserved.

    Returns
    -----------
    list[int]
        Simplified node ID list (endpoints preserved).
    """
    if len(node_refs) < 2:
        return []

    out: List[int] = [int(node_refs[0])]
    for ref in node_refs[1:-1]:
        r = int(ref)
        if r in kept_nodes and r != out[-1]:
            out.append(r)

    last = int(node_refs[-1])
    if last != out[-1]:
        out.append(last)
    return out


def compute_segment_lengths_m(
    node_refs: Sequence[int],
    simplified_refs: Sequence[int],
    location_index: LocationIndexLike,
) -> Tuple[int, List[int]]:
    """
    Compute total polyline length (meters) along original refs, grouped by simplified segments.

    Parameters
    ---------------
    node_refs: Sequence[int]
        Original node IDs in order.
    simplified_refs: Sequence[int]
        Simplified node IDs in order (must be subsequence of node_refs).
    location_index: LocationIndexLike
        Node ID -> location.

    Returns
    -----------
    tuple[int, list[int]]
        (total_length_m, segment_lengths_m) where values are integer meters.
    """
    if len(simplified_refs) < 2 or len(node_refs) < 2:
        return 0, []

    simplified_set = set(int(x) for x in simplified_refs)
    segments_m: List[int] = []
    total_m = 0.0
    current_seg_m = 0.0

    prev_ref: Optional[int] = None
    prev_loc: Optional[LocationLike] = None

    first = int(simplified_refs[0])
    last = int(simplified_refs[-1])

    for ref_raw in node_refs:
        ref = int(ref_raw)
        try:
            loc = location_index.get(ref)
        except (KeyError, RuntimeError):
            loc = None

        if prev_ref is not None and prev_loc is not None and loc is not None:
            if prev_loc.valid() and loc.valid():
                d = haversine_m(prev_loc.lat, prev_loc.lon, loc.lat, loc.lon)
                total_m += d
                current_seg_m += d

        prev_ref = ref
        prev_loc = loc

        if ref in simplified_set and ref != first:
            seg_i = int(round(current_seg_m))
            segments_m.append(seg_i)
            current_seg_m = 0.0

        if ref == last:
            break

    expected_segments = max(0, len(simplified_refs) - 1)
    if len(segments_m) < expected_segments:
        segments_m.extend([0] * (expected_segments - len(segments_m)))
    elif len(segments_m) > expected_segments:
        segments_m = segments_m[:expected_segments]

    return int(round(total_m)), segments_m


def parse_maxspeed_kmh(tags: Dict[str, str]) -> Optional[float]:
    """
    Best-effort parse of OSM maxspeed tag to km/h.

    Parameters
    ---------------
    tags: dict[str, str]
        Way tags.

    Returns
    -----------
    float | None
        Speed in km/h, if parseable.
    """
    raw = tags.get("maxspeed")
    if not raw:
        return None

    s = raw.strip().lower()
    parts = s.replace("km/h", "").replace("kph", "").strip().split()
    if not parts:
        return None

    try:
        value = float(parts[0])
    except ValueError:
        return None

    if "mph" in s:
        return value * 1.609344
    return value


@dataclass(frozen=True)
class SimplifyConfig:
    """
    Configuration for OSM simplification.

    Parameters
    ---------------
    write_segment_lengths: bool
        If True, write `seg_length_m` tag (semicolon list). Useful for debugging.
    """

    write_segment_lengths: bool = True


