"""Stage 5: Archetype detection — classifies the overall geometry type.

Archetypes determine which SCAD generation strategy is used:

  flat_plate    – Aspect ratio XY >> Z; 1-2 Z-levels           → linear_extrude
  rotational    – High rotational symmetry around Z-axis        → rotate_extrude
  shell         – Thin walls (volume/surface_area below thresh) → offset + extrude
  box_enclosure – 6 dominant axis-aligned face normals, hollow  → cube + difference
  assembly      – Multiple disconnected bodies                  → multi-body translate
  organic       – High vertex count, low rectangularity         → hull/minkowski
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from forge_cad.forms.project_form import IntentData

# Category strings from the intent questionnaire → archetype names
_INTENT_CATEGORY_MAP: dict[str, str] = {
    "flat_plate": "flat_plate",
    "box_enclosure": "box_enclosure",
    "handle": "rotational",
    "rotational": "rotational",
    "bracket": "flat_plate",
    "organic": "organic",
    "custom": "",
}


class ArchetypeDetector:
    """Classify a set of loaded meshes into a single geometry archetype."""

    # --- tuneable thresholds ---
    FLAT_ASPECT_RATIO = 4.0      # XY >> Z when max(XY) / Z > this
    ROTATIONAL_SCORE_THRESH = 0.75
    SHELL_VOLUME_RATIO = 0.12    # volume / (surface_area * min_dim)
    ASSEMBLY_MIN_BODIES = 2

    def detect(self, meshes: list, z_profiles: dict, intent: "IntentData") -> str:
        """Return the archetype string for this set of meshes."""
        # 1. Trust explicit user category (unless "custom")
        user_category = getattr(intent, "object_category", "custom")
        mapped = _INTENT_CATEGORY_MAP.get(user_category, "")
        if mapped:
            return mapped

        # 2. Fall back to heuristic analysis
        if not meshes:
            return "flat_plate"

        # Filter to actual 3-D meshes (skip DXF/SVG stubs)
        solid_meshes = [m for m in meshes if _is_solid_mesh(m)]
        if not solid_meshes:
            return "flat_plate"

        # 2a. Check for multi-body assembly
        if len(solid_meshes) >= self.ASSEMBLY_MIN_BODIES:
            if _are_disjoint(solid_meshes):
                return "assembly"

        # Use the first (or largest) solid mesh for single-body heuristics
        primary = max(solid_meshes, key=lambda m: getattr(m, "volume", 0.0))
        mesh = primary.mesh

        bounds = getattr(mesh, "bounds", None)
        if bounds is None:
            return "flat_plate"

        lo, hi = bounds
        dx = float(hi[0] - lo[0])
        dy = float(hi[1] - lo[1])
        dz = float(hi[2] - lo[2])
        xy_max = max(dx, dy)

        if dz < 1e-6:
            return "flat_plate"

        aspect = xy_max / dz

        # 2b. Flat plate
        if aspect >= self.FLAT_ASPECT_RATIO:
            z_count = len(z_profiles.get("all_levels", []))
            if z_count <= 3:
                return "flat_plate"

        # 2c. Rotational symmetry
        if _rotational_score(mesh) >= self.ROTATIONAL_SCORE_THRESH:
            return "rotational"

        # 2d. Shell (thin-walled)
        volume = float(getattr(mesh, "volume", 0.0))
        area = float(getattr(mesh, "area", 0.0))
        if area > 0 and volume > 0:
            min_dim = min(dx, dy, dz)
            if min_dim > 0 and (volume / (area * min_dim)) < self.SHELL_VOLUME_RATIO:
                return "shell"

        # 2e. Box enclosure
        if _is_box_like(mesh):
            return "box_enclosure"

        # 2f. Organic (fallback for complex shapes)
        if _is_organic(mesh):
            return "organic"

        return "flat_plate"


# ── Private helpers ────────────────────────────────────────────────────────


def _is_solid_mesh(loaded_mesh: object) -> bool:
    """Return True if the LoadedMesh represents a real 3-D solid."""
    file_type = getattr(loaded_mesh, "file_type", "")
    if file_type in {"dxf", "svg"}:
        return False
    mesh = getattr(loaded_mesh, "mesh", None)
    if mesh is None:
        return False
    vertices = getattr(mesh, "vertices", None)
    return vertices is not None and len(vertices) >= 4


def _are_disjoint(meshes: list) -> bool:
    """Return True if bounding boxes of all meshes do not overlap."""
    boxes = []
    for m in meshes:
        bb = getattr(m, "bounding_box", None)
        if bb is not None:
            boxes.append(bb)
    if len(boxes) < 2:
        return False
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            if _boxes_overlap(boxes[i], boxes[j]):
                return False
    return True


def _boxes_overlap(a, b) -> bool:
    """Return True if two axis-aligned bounding boxes overlap."""
    import numpy as np
    a = np.asarray(a)
    b = np.asarray(b)
    for axis in range(3):
        if a[1][axis] < b[0][axis] or b[1][axis] < a[0][axis]:
            return False
    return True


def _rotational_score(mesh: object) -> float:
    """Estimate rotational symmetry around Z-axis.

    Samples N angular slices and compares cross-sectional areas.
    Returns a score in [0, 1]; 1 = perfect rotational symmetry.
    """
    try:
        import numpy as np

        vertices = np.asarray(mesh.vertices)
        if len(vertices) < 8:
            return 0.0

        # Compute radii from centroid in XY plane
        cx = float(vertices[:, 0].mean())
        cy = float(vertices[:, 1].mean())
        radii = np.sqrt((vertices[:, 0] - cx) ** 2 + (vertices[:, 1] - cy) ** 2)

        N = 16
        angles = np.linspace(0, 2 * math.pi, N, endpoint=False)
        sector_max_r = []
        for a in angles:
            a_next = a + 2 * math.pi / N
            theta = np.arctan2(vertices[:, 1] - cy, vertices[:, 0] - cx)
            # Wrap angles
            in_sector = (theta >= a) & (theta < a_next)
            if in_sector.any():
                sector_max_r.append(float(radii[in_sector].max()))
            else:
                sector_max_r.append(0.0)

        arr = np.array(sector_max_r)
        if arr.max() < 1e-6:
            return 0.0
        # Normalise by max radius
        norm = arr / arr.max()
        # Score = 1 - coefficient of variation
        cv = norm.std() / (norm.mean() + 1e-9)
        return float(max(0.0, 1.0 - cv))
    except Exception:  # noqa: BLE001
        return 0.0


def _is_box_like(mesh: object) -> bool:
    """Return True if the mesh has approximately 6 axis-aligned flat faces."""
    try:
        import numpy as np

        normals = np.asarray(mesh.face_normals)
        if len(normals) == 0:
            return False

        # Round normals to nearest axis
        axis_directions = np.array([
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1],
        ])
        # For each face normal, find the closest axis direction
        dots = normals @ axis_directions.T  # shape (F, 6)
        max_dot = dots.max(axis=1)
        # Fraction of faces that are well-aligned (dot > 0.9)
        aligned_frac = float((max_dot > 0.9).mean())
        return aligned_frac > 0.7
    except Exception:  # noqa: BLE001
        return False


def _is_organic(mesh: object) -> bool:
    """Return True for complex shapes with low rectangularity."""
    try:
        import numpy as np

        vertices = np.asarray(mesh.vertices)
        if len(vertices) < 50:
            return False

        # High vertex count relative to bounding-box volume is a proxy for complexity
        bounds = mesh.bounds
        lo, hi = bounds
        vol_bb = float(max(
            (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]), 1e-6
        ))
        density = len(vertices) / vol_bb
        return density > 5.0
    except Exception:  # noqa: BLE001
        return False
