"""Port of ``src/parsers/unit.test.ts``: every case, same expectations, plus the
Python-only ``unit_station`` convenience and a shape check on the default table."""

from __future__ import annotations

import math

from mcfrs_api.models import UnitCategory
from mcfrs_api.parsers.unit import (
    DEFAULT_NOMENCLATURE,
    MAX_STATION,
    ParsedUnit,
    UnitNomenclature,
    is_station_unit,
    parse_unit,
    station_from_unit_number,
    unit_station,
    units_at_station,
)


class TestStationFromUnitNumber:
    def test_maps_county_7xx_unit_numbers_to_the_station_number(self) -> None:
        assert station_from_unit_number(714) == 14
        assert station_from_unit_number(705) == 5
        assert station_from_unit_number(729) == 29
        assert station_from_unit_number(701) == 1

    def test_returns_a_bare_number_only_when_it_is_a_plausible_station(self) -> None:
        assert MAX_STATION == 54
        assert station_from_unit_number(14) == 14
        assert station_from_unit_number(1) == 1
        assert station_from_unit_number(54) == 54
        assert station_from_unit_number(0) is None
        assert station_from_unit_number(55) is None
        assert station_from_unit_number(99) is None

    def test_rejects_numbers_that_are_neither_7xx_nor_a_bare_station(self) -> None:
        for n in (614, 814, 700, 799, 7140, -714):
            assert station_from_unit_number(n) is None, n
        # TS passes Number.NaN; the closest Python equivalent is a float NaN.
        assert station_from_unit_number(math.nan) is None


class TestParseUnit:
    def test_parses_a_paramedic_engine(self) -> None:
        assert parse_unit("PE714") == ParsedUnit(
            unit="PE714",
            prefix="PE",
            station=14,
            number=714,
            type="Paramedic Engine",
            category=UnitCategory.ENGINE,
            suffix=None,
            known=True,
            role="ALS",
        )

    def test_parses_an_aerial_tower_as_a_truck(self) -> None:
        u = parse_unit("AT714")
        assert (u.prefix, u.type, u.category, u.station) == ("AT", "Aerial Tower", UnitCategory.TRUCK, 14)

    def test_parses_a_plain_truck(self) -> None:
        u = parse_unit("T714")
        assert (u.prefix, u.type, u.category, u.station) == ("T", "Truck", UnitCategory.TRUCK, 14)

    def test_parses_an_ambulance_and_a_medic_unit(self) -> None:
        a = parse_unit("A714")
        assert (a.prefix, a.type, a.category, a.station) == ("A", "Ambulance", UnitCategory.AMBULANCE, 14)
        m = parse_unit("M729")
        assert (m.prefix, m.type, m.category, m.station) == ("M", "Medic", UnitCategory.MEDIC, 29)

    def test_parses_a_battalion_chief(self) -> None:
        u = parse_unit("BC705")
        assert (u.prefix, u.type, u.category, u.station) == ("BC", "Battalion Chief", UnitCategory.CHIEF, 5)

    def test_parses_a_rescue_squad(self) -> None:
        u = parse_unit("RS729")
        assert (u.prefix, u.type, u.category, u.station) == ("RS", "Rescue Squad", UnitCategory.RESCUE, 29)

    def test_parses_an_ems_duty_officer_as_command(self) -> None:
        u = parse_unit("EMS703")
        assert (u.prefix, u.category, u.station) == ("EMS", UnitCategory.COMMAND, 3)

    def test_keeps_a_trailing_letter_as_a_suffix(self) -> None:
        u = parse_unit("E714B")
        assert (u.unit, u.prefix, u.type, u.category, u.station, u.suffix) == (
            "E714B",
            "E",
            "Engine",
            UnitCategory.ENGINE,
            14,
            "B",
        )

    def test_marks_unknown_prefixes_as_unknown_but_still_infers_the_station(self) -> None:
        u = parse_unit("xyz714")
        assert u.known is False
        assert u.category == UnitCategory.UNKNOWN
        assert u.type == "Unknown"
        assert u.prefix == "XYZ"
        assert u.station == 14
        assert u.number == 714

    def test_prefers_the_longest_matching_prefix(self) -> None:
        assert parse_unit("PE714").prefix == "PE"
        assert parse_unit("E714").prefix == "E"
        assert parse_unit("AT714").prefix == "AT"
        assert parse_unit("BC705").prefix == "BC"
        assert parse_unit("B705").prefix == "B"
        assert parse_unit("B705").category == UnitCategory.SPECIAL

    def test_normalizes_whitespace_and_lowercase(self) -> None:
        u = parse_unit("  pe714 ")
        assert (u.unit, u.prefix, u.type, u.station, u.known) == ("PE714", "PE", "Paramedic Engine", 14, True)
        assert parse_unit("e 714").unit == "E714"

    def test_ignores_hyphens_and_dots_between_prefix_and_number(self) -> None:
        u = parse_unit("PE-714")
        assert (u.unit, u.prefix, u.station, u.known) == ("PE714", "PE", 14, True)
        u = parse_unit("A.714")
        assert (u.unit, u.prefix, u.station, u.known) == ("A714", "A", 14, True)

    def test_handles_a_unit_number_that_is_not_a_county_7xx_number(self) -> None:
        u = parse_unit("E14")
        assert (u.prefix, u.station, u.number, u.known) == ("E", 14, 14, True)
        assert parse_unit("E614").station is None

    def test_handles_an_empty_or_letters_only_designator(self) -> None:
        empty = parse_unit("")
        assert (empty.unit, empty.prefix, empty.category, empty.known) == ("", "", UnitCategory.UNKNOWN, False)
        assert empty.station is None
        assert empty.number is None

        letters = parse_unit("PE")
        assert (letters.unit, letters.prefix, letters.type, letters.category, letters.known) == (
            "PE",
            "PE",
            "Paramedic Engine",
            UnitCategory.ENGINE,
            True,
        )
        assert letters.station is None

    def test_accepts_a_custom_nomenclature_that_overrides_the_default(self) -> None:
        custom = [
            UnitNomenclature(prefix="PE", type="Pumper Engine", category=UnitCategory.ENGINE),
            UnitNomenclature(prefix="ZZ", type="Zeppelin", category=UnitCategory.SPECIAL),
        ]
        u = parse_unit("PE714", custom)
        assert (u.type, u.category, u.known) == ("Pumper Engine", UnitCategory.ENGINE, True)
        u = parse_unit("ZZ714", custom)
        assert (u.type, u.category, u.known) == ("Zeppelin", UnitCategory.SPECIAL, True)
        # Not in the custom table, so unknown even though the default knows it.
        assert parse_unit("A714", custom).known is False

    def test_ships_a_default_nomenclature_with_unique_prefixes(self) -> None:
        prefixes = [n.prefix for n in DEFAULT_NOMENCLATURE]
        assert len(set(prefixes)) == len(prefixes)
        assert {"PE", "E", "T", "AT", "A", "M", "RS", "BC", "EMS", "U", "HM"} <= set(prefixes)

    def test_default_nomenclature_mirrors_the_typescript_table(self) -> None:
        # Same entries in the same order as src/parsers/unit.ts.
        assert len(DEFAULT_NOMENCLATURE) == 31
        assert DEFAULT_NOMENCLATURE[0].prefix == "PRE"
        assert DEFAULT_NOMENCLATURE[-1] == UnitNomenclature(prefix="U", type="Utility", category=UnitCategory.SUPPORT)
        assert all(isinstance(n.category, UnitCategory) for n in DEFAULT_NOMENCLATURE)


class TestStationHelpers:
    units = ["PE714", "A714", "M729", "BC705", "xyz714", "E714B", "U799", ""]

    def test_filters_units_by_station(self) -> None:
        assert units_at_station(self.units, 14) == ["PE714", "A714", "xyz714", "E714B"]
        assert units_at_station(self.units, 29) == ["M729"]
        assert units_at_station(self.units, 99) == []

    def test_tests_a_single_unit_against_a_station(self) -> None:
        assert is_station_unit("PE714", 14) is True
        assert is_station_unit("pe714", 14) is True
        assert is_station_unit("PE714", 7) is False
        assert is_station_unit("", 14) is False

    def test_unit_station_returns_the_home_station_or_none(self) -> None:
        assert unit_station("PE714") == 14
        assert unit_station("m729") == 29
        assert unit_station("U799") is None
        assert unit_station("") is None


class TestStation14RosterDesignators:
    """Station 14 (UMCVFD) roster designators, sourced 2026-09-03."""

    def test_pre714_is_a_paramedic_rescue_engine_at_station_14(self) -> None:
        p = parse_unit("PRE714")
        assert [p.prefix, p.type, p.category, p.station, p.known] == [
            "PRE",
            "Paramedic Rescue Engine",
            UnitCategory.ENGINE,
            14,
            True,
        ]

    def test_be714_brush_engine_bt714_boat_bs714b_boat_support_with_suffix_ch714_chief(self) -> None:
        assert parse_unit("BE714").type == "Brush Engine"
        assert parse_unit("BT714").type == "Boat"
        assert [parse_unit("BS714B").type, parse_unit("BS714B").suffix] == ["Boat Support", "B"]
        assert parse_unit("CH714").category == UnitCategory.CHIEF
        assert parse_unit("UTV714").type == "UTV"

    def test_longest_prefix_still_wins_pre_before_pe_and_re_bs_before_b_utv_before_ut(self) -> None:
        assert parse_unit("PE714").prefix == "PE"
        assert parse_unit("RE714").prefix == "RE"
        assert parse_unit("B714").prefix == "B"
        assert parse_unit("UT714").prefix == "UT"
