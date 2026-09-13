# CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
"""BuildAndDo visual substrate: the backend boundary for Living Rooms.

The browser never signs and never holds a key. This package signs on its behalf
(`citadelkey`), calls the Citadel Nexus bridge (`bridge_client`), re-checks the
cleansed body (`leakcheck`) and serves `/api/rooms/*` to the SPA (`server`).
"""
__version__ = '1.1.0'
