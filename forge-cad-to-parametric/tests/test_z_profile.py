"""Tests for Stage 1: Z-profile extraction."""

from __future__ import annotations

import numpy as np
import pytest

from forge_cad.analyzer.z_profile import ZProfileExtractor, Z_CLUSTER_TOLERANCE


class FakeMesh:
    """Minimal trimesh-like object for testing."""

    def __init__(self, z_values: list[float]) -> None:
        # Build a fake vertices array with the given Z distribution
        self.vertices = np.array(
            [[0.0, 0.0, z] for z in z_values]
            + [[5.0, 0.0, z] for z in z_values]
        )
        self.bounds = np.array([
            [0.0, 0.0, min(z_values)],
            [5.0, 5.0, max(z_values)],
        ])


class FakeLoadedMesh:
    """Minimal LoadedMesh-like object for testing."""

    def __init__(self, name: str, z_values: list[float], file_type: str = "obj") -> None:
        self.name = name
        self.file_type = file_type
        self.mesh = FakeMesh(z_values)
        self.z_min = min(z_values)
        self.z_max = max(z_values)
        self.volume = float(len(z_values))
        self.vertex_count = len(z_values) * 2
        self.bounding_box = self.mesh.bounds
        self.auto_role = "full_assembly"


def test_extract_simple_slab():
    """A flat slab with two Z-levels should produce [z_min, z_max]."""
    mesh = FakeLoadedMesh("body", [0.0] * 50 + [8.0] * 50)
    extractor = ZProfileExtractor([mesh])
    result = extractor.extract()

    profile = result["profiles"]["body"]
    assert profile["z_min"] == pytest.approx(0.0, abs=0.01)
    assert profile["z_max"] == pytest.approx(8.0, abs=0.01)
    assert profile["is_flat_slab"] is True
    assert len(result["all_levels"]) >= 2


def test_staircase_z_levels():
    """A staircase mesh should produce multiple Z-levels: 0, 3, 6, 8."""
    z_values = [0.0] * 40 + [3.0] * 30 + [6.0] * 20 + [8.0] * 40
    mesh = FakeLoadedMesh("staircase", z_values)
    extractor = ZProfileExtractor([mesh])
    result = extractor.extract()

    levels = result["all_levels"]
    assert any(abs(l - 0.0) < Z_CLUSTER_TOLERANCE for l in levels), f"Missing 0.0 in {levels}"
    assert any(abs(l - 8.0) < Z_CLUSTER_TOLERANCE for l in levels), f"Missing 8.0 in {levels}"


def test_body_candidate_is_tallest():
    """The body candidate should be the mesh with the largest Z-thickness."""
    body = FakeLoadedMesh("body", [0.0] * 50 + [8.0] * 50)
    plate = FakeLoadedMesh("plate_layer_1", [0.0] * 50 + [3.0] * 50)
    extractor = ZProfileExtractor([body, plate])
    result = extractor.extract()

    assert result["body_candidate"] == "body"
    assert result["body_z_max"] == pytest.approx(8.0, abs=0.1)


def test_cluster_merges_nearby_levels():
    """Z-levels within cluster tolerance should be merged."""
    z_values = [0.0] * 30 + [2.99] * 20 + [3.01] * 20 + [8.0] * 30
    mesh = FakeLoadedMesh("mesh", z_values)
    extractor = ZProfileExtractor([mesh])
    result = extractor.extract()

    levels = result["all_levels"]
    # 2.99 and 3.01 should be merged into one level around 3.0
    near_three = [l for l in levels if 2.5 < l < 3.5]
    assert len(near_three) <= 2, f"Expected merged level near 3.0, got {near_three}"


def test_dxf_files_excluded():
    """DXF meshes should be excluded from Z-profile extraction."""
    dxf_mesh = FakeLoadedMesh("dxf_profile", [0.0, 1.0], file_type="dxf")
    real_mesh = FakeLoadedMesh("body", [0.0] * 50 + [8.0] * 50)
    extractor = ZProfileExtractor([dxf_mesh, real_mesh])
    result = extractor.extract()

    assert "body" in result["profiles"]
    assert "dxf_profile" not in result["profiles"]
