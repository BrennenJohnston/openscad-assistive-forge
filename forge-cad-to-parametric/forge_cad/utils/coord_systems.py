"""Coordinate system detection and conversion utilities.

Handles the common DXF/OBJ-to-OpenSCAD coordinate transformations identified
in the Plug Puller v4 reference:
  - DXF to centered: X_centered = X_dxf - offset, Y = Y_dxf
  - OBJ to mm: coord_mm = coord_obj × scale, then center X
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class CoordTransform:
    """Describes the transform from source coordinates to OpenSCAD coordinates."""

    scale: float = 1.0
    x_offset: float = 0.0
    y_offset: float = 0.0
    z_offset: float = 0.0
    source_format: str = "unknown"
    notes: str = ""


def detect_transform(
    vertices: np.ndarray,
    source_format: str,
    expected_scale_mm: Optional[float] = None,
) -> CoordTransform:
    """Detect the coordinate transform needed to bring vertices into mm units.

    Args:
        vertices: (N, 3) array of source vertices
        source_format: "obj", "dxf", "stl", "step"
        expected_scale_mm: If provided, try to detect the scale from bounding box.

    Returns:
        CoordTransform describing the scale and offset to apply.
    """
    if len(vertices) == 0:
        return CoordTransform(source_format=source_format)

    bbox_min = vertices.min(axis=0)
    bbox_max = vertices.max(axis=0)
    extents = bbox_max - bbox_min

    # OBJ files from CAD exports are often in cm (1 unit = 10 mm)
    if source_format == "obj":
        scale = _detect_obj_scale(extents, expected_scale_mm)
        x_center = (bbox_min[0] + bbox_max[0]) / 2 * scale
        return CoordTransform(
            scale=scale,
            x_offset=-x_center,
            y_offset=0.0,
            z_offset=-float(bbox_min[2]) * scale,
            source_format="obj",
            notes=f"OBJ scale: {scale}× (auto-detected from extents {extents[:2]})",
        )

    # DXF files: typically in mm already, but may have a non-zero X origin
    if source_format == "dxf":
        x_center = (bbox_min[0] + bbox_max[0]) / 2
        return CoordTransform(
            scale=1.0,
            x_offset=-x_center,
            y_offset=0.0,
            z_offset=0.0,
            source_format="dxf",
            notes=f"DXF: centering X by -{x_center:.3f}",
        )

    # STL/STEP: assume mm
    return CoordTransform(
        scale=1.0,
        source_format=source_format,
        notes="STL/STEP assumed to be in mm",
    )


def apply_transform(vertices: np.ndarray, transform: CoordTransform) -> np.ndarray:
    """Apply a CoordTransform to a vertex array, returning new coordinates in mm."""
    result = vertices.copy().astype(float)
    result *= transform.scale
    result[:, 0] += transform.x_offset
    result[:, 1] += transform.y_offset
    result[:, 2] += transform.z_offset
    return result


def _detect_obj_scale(
    extents: np.ndarray,
    expected_scale_mm: Optional[float],
) -> float:
    """Detect whether OBJ is in cm (scale=10) or mm (scale=1)."""
    max_extent = float(np.max(extents[:2]))

    if expected_scale_mm is not None:
        if max_extent > 0:
            return expected_scale_mm / max_extent
        return 1.0

    # Heuristic: most 3D-printable objects are 10–500 mm.
    # If max extent is < 10, assume cm (scale by 10).
    if 0 < max_extent < 10:
        return 10.0
    return 1.0
