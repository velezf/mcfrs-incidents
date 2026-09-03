from mcfrs_api.models import IncidentCategory
from mcfrs_api.services.privacy import PrivacyOptions, apply_privacy, fuzz_coordinate, mask_address
from tests.conftest import mk

PUB = PrivacyOptions(mode="public", mask_medical_addresses=True, precision="block")


def test_mask_address_levels():
    assert mask_address("12345 Example Farm Rd", "block") == "12300 blk Example Farm Rd"
    assert mask_address("12345 Example Farm Rd", "street") == "Example Farm Rd"
    assert mask_address("12345 Example Farm Rd", "exact") == "12345 Example Farm Rd"
    assert mask_address("I-270 NB AT EXIT 22", "block") == "I-270 NB AT EXIT 22"


def test_member_mode_is_identity():
    i = mk("a")
    assert apply_privacy(i, PrivacyOptions(mode="member")) is i


def test_public_masks_medical_and_drops_raw_payload():
    i = mk(
        "a",
        address="12345 Example Farm Rd",
        cross_street="Test Ln",
        latitude=39.17123,
        longitude=-77.41321,
        raw_payload={"secret": "x"},
    )
    p = apply_privacy(i, PUB)
    assert p.address == "12300 blk Example Farm Rd" and p.cross_street is None
    assert p.latitude == fuzz_coordinate(39.17123) and p.raw_payload is None


def test_public_leaves_fire_address_exact():
    p = apply_privacy(
        mk("a", address="12345 Example Farm Rd", category=IncidentCategory.STRUCTURE_FIRE, raw_payload={"s": 1}), PUB
    )
    assert p.address == "12345 Example Farm Rd" and p.raw_payload is None
