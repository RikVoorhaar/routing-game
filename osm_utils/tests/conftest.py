from __future__ import annotations

import os
import sys


def pytest_configure() -> None:
    """
    Ensure `osm_utils/src` is importable during tests.
    """
    here = os.path.dirname(__file__)
    src = os.path.abspath(os.path.join(here, "..", "src"))
    if src not in sys.path:
        sys.path.insert(0, src)


