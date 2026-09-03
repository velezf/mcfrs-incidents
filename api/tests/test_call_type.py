"""Port of ``src/parsers/callType.test.ts``: every case, same expectations."""

from __future__ import annotations

import re

from mcfrs_api.models import IncidentCategory
from mcfrs_api.parsers.call_type import CALL_TYPE_RULES, CallTypeInfo, CallTypeRule, classify_call_type


class TestClassifyCallType:
    def test_classifies_structure_fires(self) -> None:
        for ct in ["HOUSE FIRE", "APARTMENT FIRE", "BUILDING FIRE", "STRUCTURE FIRE", "Townhouse Fire"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.STRUCTURE_FIRE, ct
            assert info.severity == 4, ct

    def test_classifies_a_working_fire_as_the_top_severity_and_major(self) -> None:
        info = classify_call_type("WORKING FIRE")
        assert info == CallTypeInfo(
            category=IncidentCategory.WORKING_FIRE, label="Working Fire", severity=5, major=True
        )

    def test_classifies_fire_alarms(self) -> None:
        for ct in ["FIRE ALARM", "ALARM SOUNDING", "CO ALARM", "Smoke Detector"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.FIRE_ALARM, ct
            assert info.major is False, ct

    def test_classifies_brush_and_outside_fires(self) -> None:
        for ct in ["BRUSH FIRE", "OUTSIDE FIRE", "WOODS FIRE"]:
            assert classify_call_type(ct).category == IncidentCategory.BRUSH_FIRE, ct

    def test_classifies_vehicle_fires(self) -> None:
        for ct in ["VEHICLE FIRE", "CAR FIRE"]:
            assert classify_call_type(ct).category == IncidentCategory.VEHICLE_FIRE, ct

    def test_classifies_collisions(self) -> None:
        for ct in ["PIC", "PERSONAL INJURY COLLISION", "MVC", "MVA", "AUTO ACCIDENT", "COLLISION", "PEDESTRIAN STRUCK"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.COLLISION, ct
            assert info.severity == 3, ct

    def test_escalates_a_collision_with_entrapment_or_rollover_to_rescue_severity_4(self) -> None:
        for ct in ["PIC WITH ENTRAPMENT", "MVC OVERTURNED", "COLLISION ROLLOVER"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.RESCUE, ct
            assert info.severity == 4, ct

    def test_classifies_als_calls(self) -> None:
        for ct in ["ALS", "ALS1", "ALS2", "CARDIAC ARREST", "CHEST PAIN", "STROKE", "DIFFICULTY BREATHING"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.ALS, ct
            assert info.severity == 3, ct

    def test_classifies_bls_calls(self) -> None:
        for ct in ["BLS", "SICK PERSON", "FALL"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.BLS, ct
            assert info.severity == 2, ct

    def test_classifies_generic_ems_and_medical_calls(self) -> None:
        for ct in ["EMS", "MEDICAL", "MEDICAL LOCAL"]:
            assert classify_call_type(ct).category == IncidentCategory.EMS, ct

    def test_classifies_rescues(self) -> None:
        for ct in ["RESCUE", "ELEVATOR RESCUE", "LOCKOUT"]:
            assert classify_call_type(ct).category == IncidentCategory.RESCUE, ct

    def test_classifies_technical_rescues(self) -> None:
        for ct in ["TECHNICAL RESCUE", "CONFINED SPACE", "TRENCH RESCUE", "COLLAPSE", "HIGH ANGLE RESCUE"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.TECHNICAL_RESCUE, ct
            assert info.severity == 4, ct

    def test_classifies_water_rescues(self) -> None:
        for ct in ["WATER RESCUE", "SWIFT WATER", "RIVER RESCUE", "DROWNING"]:
            assert classify_call_type(ct).category == IncidentCategory.WATER_RESCUE, ct

    def test_classifies_hazmat(self) -> None:
        for ct in ["HAZMAT", "HAZ-MAT", "GAS LEAK", "ODOR OF GAS", "CHEMICAL SPILL", "FUEL SPILL"]:
            assert classify_call_type(ct).category == IncidentCategory.HAZMAT, ct

    def test_classifies_mass_casualty_incidents_as_major(self) -> None:
        for ct in ["MASS CASUALTY", "MCI"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.MASS_CASUALTY, ct
            assert info.severity == 5, ct
            assert info.major is True, ct

    def test_classifies_special_operations_as_major(self) -> None:
        for ct in ["SPECIAL OPERATIONS", "BOMB THREAT", "ACTIVE ASSAILANT"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.SPECIAL_OPS, ct
            assert info.major is True, ct

    def test_classifies_service_calls(self) -> None:
        for ct in ["SERVICE CALL", "ASSIST", "PUBLIC SERVICE", "WIRES DOWN", "TREE DOWN"]:
            info = classify_call_type(ct)
            assert info.category == IncidentCategory.SERVICE, ct
            assert info.severity == 1, ct

    def test_falls_back_to_other_with_a_readable_label(self) -> None:
        info = classify_call_type("SOMETHING NOBODY EXPECTED")
        assert (info.category, info.severity, info.major) == (IncidentCategory.OTHER, 1, False)
        assert info.label == "Something Nobody Expected"
        assert classify_call_type("").category == IncidentCategory.OTHER
        assert classify_call_type("   ").label == "Other"

    def test_is_case_insensitive_and_tolerant_of_whitespace(self) -> None:
        assert classify_call_type("  house   fire ").category == IncidentCategory.STRUCTURE_FIRE
        assert classify_call_type("pic").category == IncidentCategory.COLLISION

    def test_never_files_a_fire_under_service_and_ranks_an_unclassified_fire_above_routine(self) -> None:
        for ct in ["ELECTRICAL FIRE", "APPLIANCE FIRE"]:
            info = classify_call_type(ct)
            assert info.category != IncidentCategory.SERVICE, ct
            assert info.severity >= 3, ct
        assert classify_call_type("ELECTRICAL PROBLEM").category == IncidentCategory.SERVICE

    def test_treats_motorcycle_and_bicycle_accidents_as_collisions(self) -> None:
        assert classify_call_type("MOTORCYCLE ACCIDENT").category == IncidentCategory.COLLISION
        assert classify_call_type("BICYCLE ACCIDENT").category == IncidentCategory.COLLISION

    def test_ranks_a_person_locked_in_above_a_plain_lockout(self) -> None:
        info = classify_call_type("LOCKOUT")
        assert (info.category, info.severity) == (IncidentCategory.RESCUE, 1)
        info = classify_call_type("CHILD LOCKED IN VEHICLE")
        assert (info.category, info.severity) == (IncidentCategory.RESCUE, 3)

    def test_does_not_confuse_a_fire_alarm_with_a_structure_fire(self) -> None:
        assert classify_call_type("FIRE ALARM").category == IncidentCategory.FIRE_ALARM
        assert classify_call_type("HOUSE FIRE ALARM").category == IncidentCategory.FIRE_ALARM

    def test_gives_every_matched_rule_a_label(self) -> None:
        for ct in ["HOUSE FIRE", "PIC", "ALS", "HAZMAT", "SERVICE CALL"]:
            assert len(classify_call_type(ct).label) > 0, ct
        assert classify_call_type("PIC").label == "Personal Injury Collision"


class TestSubtypeEscalation:
    def test_escalates_a_house_fire_to_working_fire(self) -> None:
        info = classify_call_type("HOUSE FIRE", "WORKING FIRE")
        assert (info.category, info.severity, info.major) == (IncidentCategory.WORKING_FIRE, 5, True)

    def test_escalates_a_collision_to_rescue_on_an_entrapment_subtype(self) -> None:
        info = classify_call_type("PIC", "ENTRAPMENT")
        assert (info.category, info.severity) == (IncidentCategory.RESCUE, 4)

    def test_does_not_de_escalate_on_a_lower_severity_subtype(self) -> None:
        info = classify_call_type("HOUSE FIRE", "SMOKE SHOWING")
        assert info.category == IncidentCategory.STRUCTURE_FIRE
        assert info.severity == 4

    def test_uses_the_subtype_when_the_call_type_is_unrecognized(self) -> None:
        assert classify_call_type("ZZZ", "GAS LEAK").category == IncidentCategory.HAZMAT
        assert classify_call_type("ZZZ", "SERVICE CALL").category == IncidentCategory.SERVICE

    def test_ignores_an_empty_subtype(self) -> None:
        assert classify_call_type("PIC", "").category == IncidentCategory.COLLISION
        assert classify_call_type("PIC", None).category == IncidentCategory.COLLISION


class TestRuleTable:
    def test_only_uses_known_incident_categories_and_valid_severities(self) -> None:
        for rule in CALL_TYPE_RULES:
            assert isinstance(rule.category, IncidentCategory), rule
            assert 1 <= rule.severity <= 5, rule
            assert rule.pattern.flags & re.IGNORECASE, rule

    def test_accepts_a_custom_rule_table(self) -> None:
        rules = [
            CallTypeRule(
                pattern=re.compile(r"\bLLAMA\b", re.IGNORECASE),
                category=IncidentCategory.SPECIAL_OPS,
                label="Llama Loose",
                severity=5,
                major=True,
            )
        ]
        assert classify_call_type("LLAMA LOOSE", None, rules) == CallTypeInfo(
            category=IncidentCategory.SPECIAL_OPS, label="Llama Loose", severity=5, major=True
        )
        assert classify_call_type("HOUSE FIRE", None, rules).category == IncidentCategory.OTHER
