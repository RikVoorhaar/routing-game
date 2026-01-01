from __future__ import annotations

from shapely.geometry import Polygon

from osm_utils.nuts_lookup import NUTSIndex, NUTSRegion, wgs84_to_web_mercator


def test_wgs84_to_web_mercator_origin() -> None:
    x, y = wgs84_to_web_mercator(lat=0.0, lon=0.0)
    assert abs(x) < 1e-9
    assert abs(y) < 1e-9


def test_index_lookup_web_mercator_simple_polygon() -> None:
    square = Polygon([(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)])
    idx = NUTSIndex(regions=[NUTSRegion(nuts_id="XX00", name="Test", geometry=square)])
    region = idx.lookup_web_mercator(x=5.0, y=5.0)
    assert region is not None
    assert region.nuts_id == "XX00"



