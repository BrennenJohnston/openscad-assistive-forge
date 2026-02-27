"""Boolean epsilon utilities.

The eps convention (0.01 mm by default) is used to prevent coincident-face
CGAL artifacts in OpenSCAD boolean operations. This module provides helpers
for expanding/shrinking polygons by eps for pocket cutter generation.

Reference: Plug Puller v4 reference, Section 4.4 - Pocket Expansion.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

DEFAULT_EPS = 0.01  # mm


def eps_expand_polygon(
    vertices: list[list[float]],
    eps: float = DEFAULT_EPS,
) -> list[list[float]]:
    """Expand a 2D polygon outward by eps on all edges.

    Uses the inward-normal offset method: each vertex is moved along the
    bisector of its two adjacent edge normals by eps.

    This is the 2D equivalent of OpenSCAD's offset(delta=eps).

    Args:
        vertices: List of [x, y] coordinates (counterclockwise assumed)
        eps: Expansion distance in mm

    Returns:
        Expanded polygon vertices as list of [x, y]
    """
    pts = np.array(vertices, dtype=float)
    n = len(pts)
    if n < 3:
        return vertices

    result = np.zeros_like(pts)
    for i in range(n):
        prev_pt = pts[(i - 1) % n]
        curr_pt = pts[i]
        next_pt = pts[(i + 1) % n]

        # Outward normals of the two edges meeting at this vertex
        e1 = curr_pt - prev_pt
        e2 = next_pt - curr_pt

        n1 = _outward_normal_2d(e1)
        n2 = _outward_normal_2d(e2)

        # Bisector direction
        bisector = n1 + n2
        bisector_len = np.linalg.norm(bisector)
        if bisector_len < 1e-10:
            bisector = n1
            bisector_len = np.linalg.norm(bisector)
        if bisector_len < 1e-10:
            result[i] = curr_pt
            continue

        bisector /= bisector_len

        # Scale the offset to account for the miter angle
        cos_half_angle = np.dot(bisector, n1)
        if abs(cos_half_angle) < 1e-6:
            scale = 1.0
        else:
            scale = 1.0 / cos_half_angle

        # Clamp miter to avoid extreme expansion at sharp concavities
        scale = min(abs(scale), 5.0) * np.sign(scale)
        result[i] = curr_pt + bisector * eps * scale

    return [[round(float(x), 6), round(float(y), 6)] for x, y in result]


def eps_shrink_polygon(
    vertices: list[list[float]],
    eps: float = DEFAULT_EPS,
) -> list[list[float]]:
    """Shrink a 2D polygon inward by eps on all edges (inverse of expand)."""
    return eps_expand_polygon(vertices, -eps)


def _outward_normal_2d(edge: np.ndarray) -> np.ndarray:
    """Return the unit outward normal of a 2D edge vector (rotated 90° CCW)."""
    normal = np.array([-edge[1], edge[0]], dtype=float)
    length = np.linalg.norm(normal)
    if length < 1e-10:
        return np.array([0.0, 1.0])
    return normal / length


def pocket_cutter_vertices(
    fill_vertices: list[list[float]],
    eps: float = DEFAULT_EPS,
) -> list[list[float]]:
    """Produce the pocket cutter polygon for a given fill polygon.

    The cutter is the fill polygon expanded by eps on all edges.
    This ensures no coincident faces between the pocket wall and the fill surface.

    Args:
        fill_vertices: The fill polygon's 2D vertices
        eps: The expansion distance (default 0.01 mm)

    Returns:
        Expanded polygon suitable for use as a boolean subtraction cutter
    """
    return eps_expand_polygon(fill_vertices, eps)
