from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

import pytest

from osm_utils.way_simplifier import compute_segment_lengths_m, haversine_m, simplify_node_refs


class _FakeLoc:
    def __init__(self, lat: float, lon: float, valid: bool = True) -> None:
        self.lat = lat
        self.lon = lon
        self._valid = valid

    def valid(self) -> bool:  # pragma: no cover (matches osmium API)
        return self._valid


class _FakeIndex:
    def __init__(self, mapping: Dict[int, _FakeLoc]) -> None:
        self._m = mapping

    def get(self, node_id: int) -> _FakeLoc:
        return self._m[node_id]


def _grid_line(nodes: Sequence[int]) -> Tuple[Dict[int, _FakeLoc], List[int]]:
    """
    Create a simple polyline along the equator with 0.001 deg lon increments.
    """
    m: Dict[int, _FakeLoc] = {}
    for i, nid in enumerate(nodes):
        m[int(nid)] = _FakeLoc(lat=0.0, lon=0.001 * i)
    return m, [int(n) for n in nodes]


def test_simplify_node_refs_keeps_endpoints_and_kept() -> None:
    refs = [10, 11, 12, 13, 14]
    kept = {12}
    assert simplify_node_refs(refs, kept) == [10, 12, 14]


def test_simplify_node_refs_drops_all_intermediate_when_no_kept() -> None:
    refs = [1, 2, 3, 4]
    kept: set[int] = set()
    assert simplify_node_refs(refs, kept) == [1, 4]


def test_haversine_reasonable_scale() -> None:
    # Roughly ~111m per 0.001 deg lon at equator.
    d = haversine_m(0.0, 0.0, 0.0, 0.001)
    assert 90.0 < d < 140.0


def test_compute_segment_lengths_m_sums_segments() -> None:
    locs, refs = _grid_line([1, 2, 3, 4, 5])
    idx = _FakeIndex(locs)

    simplified = [1, 3, 5]
    total_m, segs = compute_segment_lengths_m(refs, simplified, idx)  # type: ignore[arg-type]

    assert len(segs) == 2
    assert total_m == pytest.approx(segs[0] + segs[1], abs=5)
    assert total_m > 0


def test_compute_segment_lengths_m_padding_when_missing_closures() -> None:
    # If the original list doesn't reach the last simplified ref (pathological),
    # we should still return the right number of segments.
    locs, refs = _grid_line([1, 2, 3])
    idx = _FakeIndex(locs)
    simplified = [1, 2, 3, 999]
    total_m, segs = compute_segment_lengths_m(refs, simplified, idx)  # type: ignore[arg-type]
    assert len(segs) == 3
    assert total_m >= 0


