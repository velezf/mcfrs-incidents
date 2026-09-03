from mcfrs_api.services.hydrants import Hydrant, HydrantIndex, from_county_feature, load_snapshot, save_snapshot

FEATURE = {
    "type": "Feature",
    "id": 1,
    "geometry": {"type": "Point", "coordinates": [-77.207679968565685, 39.32528487475232]},
    "properties": {
        "HYD_ID": 1,
        "ST_NUM": "28607",
        "ST_NAME": "KEMPTOWN",
        "OWN": " ",
        "MAIN": "12",
        "CITY": "DAMASCUS",
        "ZIP": "20872",
        "OOC": None,
        "STATION": None,
        "VERIFIED": "Y",
        "OBJECTID": 1,
        "NOTES": " ",
        "FULL_ADDRE": "28607 KEMPTOWN RD",
    },
}


def test_from_county_feature_maps_fields():
    h = from_county_feature(FEATURE)
    assert h is not None
    assert (h.id, h.address, h.city, h.main_size, h.out_of_service, h.verified, h.notes) == (
        "mcgov:1",
        "28607 KEMPTOWN RD",
        "DAMASCUS",
        "12",
        False,
        True,
        None,
    )
    assert abs(h.latitude - 39.32528) < 1e-4 and abs(h.longitude + 77.20768) < 1e-4


def test_out_of_service_flag_variants():
    p = dict(FEATURE["properties"])
    for v, expect in [("Y", True), ("N", False), ("OOC", True), (None, False), (" ", False)]:
        p["OOC"] = v
        assert from_county_feature({**FEATURE, "properties": p}).out_of_service is expect


def test_feature_without_geometry_is_skipped():
    assert from_county_feature({"type": "Feature", "geometry": None, "properties": {}}) is None


def test_nearest_orders_limits_and_excludes_out_of_service():
    base = (39.1800, -77.4100)
    hs = [
        Hydrant("a", 39.1801, -77.4100),  # ~11 m
        Hydrant("b", 39.1820, -77.4100),  # ~220 m
        Hydrant("c", 39.1800, -77.4050, out_of_service=True),  # ~430 m but OOS
        Hydrant("d", 39.2000, -77.4100),  # ~2.2 km, beyond max
        Hydrant("e", 39.1790, -77.4120),  # ~200 m
    ]
    idx = HydrantIndex(hs)
    near = idx.nearest(*base, n=5, max_km=1.6)
    assert [x.hydrant.id for x in near] == ["a", "e", "b"]
    assert idx.nearest(*base, n=5, max_km=1.6, include_out_of_service=True)[3].hydrant.id == "c"
    assert near[0].as_wire()["distanceFt"] < 60


def test_nearest_across_grid_cells():
    idx = HydrantIndex([Hydrant("x", 39.1899, -77.4001)])
    assert idx.nearest(39.1901, -77.3999, max_km=1.0)[0].hydrant.id == "x"


def test_snapshot_roundtrip(tmp_path):
    p = tmp_path / "h.json"
    assert save_snapshot([from_county_feature(FEATURE)], p) == 1
    idx = load_snapshot(p)
    assert len(idx) == 1 and idx.hydrants[0].address == "28607 KEMPTOWN RD"
    assert len(load_snapshot(tmp_path / "missing.json")) == 0
