"""Phase 3C: Mirror and rotational symmetry detection.

Tests whether a mesh is symmetric about the XZ, YZ, or XY planes, and
whether it has N-fold rotational symmetry around the Z-axis.

Impact on SCAD output:
  - Mirror symmetry  → reinforce use of mirror() calls in assembly
  - Rotational sym.  → reinforce archetype = "rotational" in ArchetypeDetector
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class SymmetryResult:
    """Detected symmetry information for a single mesh."""

    mirror_xz: bool = False     # symmetric about XZ plane (flip Y)
    mirror_yz: bool = False     # symmetric about YZ plane (flip X)
    mirror_xy: bool = False     # symmetric about XY plane (flip Z)
    rotational_n: int = 0       # N-fold rotational symmetry (0 = none detected)
    rotational_score: float = 0.0

    @property
    def has_any(self) -> bool:
        return self.mirror_xz or self.mirror_yz or self.mirror_xy or self.rotational_n >= 2


# Tolerance: fraction of bounding-box extent within which vertex counts must match
_SYMMETRY_TOL = 0.05
_ROT_SCORE_THRESH = 0.75


class SymmetryDetector:
    """Detect mirror and rotational symmetry in loaded meshes."""

    def detect(self, meshes: list) -> dict[str, SymmetryResult]:
        """Return a mapping of mesh name → SymmetryResult."""
        results: dict[str, SymmetryResult] = {}
        for m in meshes:
            if not hasattr(m.mesh, "vertices"):
                continue
            results[m.name] = self._analyse_mesh(m.mesh)
        return results

    def _analyse_mesh(self, mesh: object) -> SymmetryResult:
        result = SymmetryResult()
        try:
            verts = np.asarray(mesh.vertices, dtype=float)
            if len(verts) < 8:
                return result

            centroid = verts.mean(axis=0)
            centred = verts - centroid

            bounds = np.array(mesh.bounds)
            extents = bounds[1] - bounds[0]

            # Mirror symmetry tests
            result.mirror_yz = _test_mirror_symmetry(centred, axis=0, extents=extents)
            result.mirror_xz = _test_mirror_symmetry(centred, axis=1, extents=extents)
            result.mirror_xy = _test_mirror_symmetry(centred, axis=2, extents=extents)

            # Rotational symmetry around Z
            n, score = _test_rotational_symmetry(centred)
            result.rotational_n = n
            result.rotational_score = score

        except Exception:  # noqa: BLE001
            pass

        return result


# ── Private helpers ────────────────────────────────────────────────────────


def _test_mirror_symmetry(centred_verts: np.ndarray, axis: int, extents: np.ndarray) -> bool:
    """Test if vertices are symmetric about the plane normal to `axis`.

    Strategy: for each vertex, check whether the mirror image lies within
    a tolerance band of another vertex.  We use a histogram comparison for
    efficiency.
    """
    tol = float(extents[axis]) * _SYMMETRY_TOL
    if tol < 1e-6:
        return False

    coords = centred_verts[:, axis]
    mirrored = -coords

    # Compare distributions via sorted arrays
    sorted_orig = np.sort(coords)
    sorted_mirror = np.sort(mirrored)

    diffs = np.abs(sorted_orig - sorted_mirror)
    # Fraction of points within tolerance
    frac_close = float((diffs < tol).mean())
    return frac_close > 0.80


def _test_rotational_symmetry(centred_verts: np.ndarray) -> tuple[int, float]:
    """Test N-fold rotational symmetry around Z-axis.

    Returns (N, score) where N ∈ {2, 3, 4, 6, 8, 0} and score ∈ [0, 1].
    """
    radii = np.sqrt(centred_verts[:, 0] ** 2 + centred_verts[:, 1] ** 2)
    angles_deg = np.degrees(
        np.arctan2(centred_verts[:, 1], centred_verts[:, 0])
    ) % 360.0

    best_n = 0
    best_score = 0.0

    for n in [2, 3, 4, 6, 8]:
        angular_step = 360.0 / n
        # Rotate all angles by step increments and compare radius distributions
        sector_radii = []
        for k in range(n):
            target_angle = (angles_deg - k * angular_step) % 360.0
            # Normalise angles to [0, angular_step)
            in_sector = target_angle < angular_step
            if in_sector.any():
                sector_radii.append(radii[in_sector])
            else:
                sector_radii.append(np.array([0.0]))

        # Score = 1 - mean coefficient of variation of sector radius distributions
        cv_list = []
        for sr in sector_radii:
            m = float(sr.mean())
            if m > 1e-6:
                cv_list.append(float(sr.std()) / m)
        if not cv_list:
            continue
        score = float(max(0.0, 1.0 - float(np.mean(cv_list))))
        if score > best_score:
            best_score = score
            best_n = n

    if best_score < _ROT_SCORE_THRESH:
        return 0, best_score
    return best_n, best_score
