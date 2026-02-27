"""Tests for Stage 2: Variant differencing."""

from __future__ import annotations

import pytest

from forge_cad.analyzer.variant_diff import VariantDiffer


class FakeMesh:
    def __init__(self, name: str, volume: float, z_min: float = 0.0, z_max: float = 8.0) -> None:
        self.name = name
        self.file_type = "obj"
        self.volume = volume
        self.z_min = z_min
        self.z_max = z_max
        self.bounding_box = None

        class _Path:
            stem = name
        self.path = _Path()


def test_detect_removed_variant():
    """Files with 'removed' in the name should be detected as variant_removed."""
    base = FakeMesh("Full General", 10000.0)
    variant = FakeMesh("Full (Plug Base Plates Removed)", 8000.0)
    differ = VariantDiffer([base, variant])
    result = differ.compute()

    assert len(result["pairs"]) >= 1
    pair = result["pairs"][0]
    assert pair["relationship"] == "subtracted"


def test_detect_no_holes_variant():
    """Files with 'no holes' in the name should be detected as holes_removed."""
    base = FakeMesh("Full Assembly", 10000.0)
    variant = FakeMesh("Full General No Holes", 9500.0)
    differ = VariantDiffer([base, variant])
    result = differ.compute()

    assert any(p["relationship"] == "holes_removed" for p in result["pairs"])


def test_volume_diff_computed():
    """Volume difference should be computed for variant pairs."""
    base = FakeMesh("Body", 10000.0)
    variant = FakeMesh("Body No Holes", 9000.0)
    differ = VariantDiffer([base, variant])
    result = differ.compute()

    pairs = result["pairs"]
    assert len(pairs) >= 1
    pair = pairs[0]
    assert pair["volume_diff"] == pytest.approx(1000.0, abs=1.0)
    assert pair["volume_diff_pct"] == pytest.approx(10.0, abs=0.5)


def test_no_false_positives_for_clean_names():
    """Files with no variant keywords should produce no pairs."""
    body = FakeMesh("body", 10000.0)
    plate = FakeMesh("plate_layer_1", 2000.0)
    differ = VariantDiffer([body, plate])
    result = differ.compute()

    assert result["pairs"] == []


def test_base_selection():
    """The base of a variant pair should be the non-variant mesh."""
    base = FakeMesh("Assembly Overview", 12000.0)
    variant = FakeMesh("Assembly Plates Removed", 10000.0)
    differ = VariantDiffer([base, variant])
    result = differ.compute()

    if result["pairs"]:
        pair = result["pairs"][0]
        assert "Removed" not in pair["base"] or "Overview" in pair["base"]
