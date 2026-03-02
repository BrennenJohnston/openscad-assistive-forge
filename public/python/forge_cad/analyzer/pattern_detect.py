"""Phase 3B: Linear and circular pattern recognition for repeated features.

After feature detection, groups identical features and tests whether their
centres form a linear sequence (constant spacing) or a circular arc (constant
radius + angular spacing).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class DetectedPattern:
    """A linear or circular pattern found among repeated features."""

    pattern_type: str          # "linear" | "circular"
    feature_type: str          # The feature_type shared by the members
    count: int                 # Number of instances
    # Linear pattern fields
    spacing: Optional[float] = None       # mm between centres
    direction: Optional[list[float]] = None  # unit vector [dx, dy]
    start: Optional[list[float]] = None   # [x, y] of first centre
    # Circular pattern fields
    radius: Optional[float] = None        # mm from arc centre
    angular_spacing_deg: Optional[float] = None
    arc_center: Optional[list[float]] = None   # [x, y]
    member_names: list[str] = field(default_factory=list)


# Tolerances
_SPACING_TOL = 0.5   # mm
_ANGULAR_TOL = 1.0   # degrees
_MIN_PATTERN = 3     # minimum members to call it a pattern


class PatternDetector:
    """Detect repeating patterns in a list of DetectedFeature objects."""

    def detect(self, features: list) -> list[DetectedPattern]:
        """Return detected patterns from the feature list."""
        patterns: list[DetectedPattern] = []

        # Group features by (feature_type, ~dimensions)
        groups = self._group_by_type_and_size(features)

        for key, group in groups.items():
            if len(group) < _MIN_PATTERN:
                continue
            feat_type = key[0]
            # Extract 2D centres
            centres = _extract_centres(group)
            if len(centres) < _MIN_PATTERN:
                continue

            # Try linear pattern
            lin = self._test_linear(centres)
            if lin is not None:
                spacing, direction, start = lin
                pat = DetectedPattern(
                    pattern_type="linear",
                    feature_type=feat_type,
                    count=len(group),
                    spacing=round(spacing, 3),
                    direction=[round(float(d), 4) for d in direction],
                    start=[round(float(s), 3) for s in start],
                    member_names=[f.name for f in group],
                )
                patterns.append(pat)
                continue

            # Try circular pattern
            circ = self._test_circular(centres)
            if circ is not None:
                cx, cy, radius, ang_spacing = circ
                pat = DetectedPattern(
                    pattern_type="circular",
                    feature_type=feat_type,
                    count=len(group),
                    radius=round(radius, 3),
                    angular_spacing_deg=round(ang_spacing, 2),
                    arc_center=[round(cx, 3), round(cy, 3)],
                    member_names=[f.name for f in group],
                )
                patterns.append(pat)

        return patterns

    # ── Private ────────────────────────────────────────────────────────────

    @staticmethod
    def _group_by_type_and_size(features: list) -> dict[tuple, list]:
        """Group features that share the same type and approximate dimensions."""
        groups: dict[tuple, list] = {}
        for f in features:
            key = _feature_size_key(f)
            groups.setdefault(key, []).append(f)
        return groups

    @staticmethod
    def _test_linear(centres: list[list[float]]) -> Optional[tuple]:
        """Return (spacing, direction, start) if centres form a linear array."""
        pts = np.array(centres)
        if len(pts) < _MIN_PATTERN:
            return None

        # Sort by X then Y
        order = np.lexsort((pts[:, 1], pts[:, 0]))
        pts = pts[order]

        # Vector from first to last
        v = pts[-1] - pts[0]
        total_dist = float(np.linalg.norm(v))
        if total_dist < 1e-6:
            return None
        direction = v / total_dist
        expected_spacing = total_dist / (len(pts) - 1)

        # Check each consecutive gap
        for i in range(len(pts) - 1):
            delta = pts[i + 1] - pts[i]
            # Must be roughly collinear
            along = float(np.dot(delta, direction))
            perp = float(np.linalg.norm(delta - along * direction))
            if perp > _SPACING_TOL:
                return None
            if abs(along - expected_spacing) > _SPACING_TOL:
                return None

        return expected_spacing, direction, pts[0].tolist()

    @staticmethod
    def _test_circular(centres: list[list[float]]) -> Optional[tuple]:
        """Return (cx, cy, radius, angular_spacing_deg) if centres lie on a circle."""
        pts = np.array(centres)
        if len(pts) < _MIN_PATTERN:
            return None

        # Estimate circumcircle of first 3 points
        cx, cy, r = _circumcircle(pts[0], pts[1], pts[2])
        if r is None or r < 1e-3:
            return None

        # Verify all points lie on the circle
        for p in pts:
            dist = math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2)
            if abs(dist - r) > _SPACING_TOL:
                return None

        # Compute angular spacing
        angles = sorted(
            math.degrees(math.atan2(p[1] - cy, p[0] - cx)) % 360
            for p in pts
        )
        spacings = [
            (angles[i + 1] - angles[i]) % 360 for i in range(len(angles) - 1)
        ]
        spacings.append((360 - angles[-1] + angles[0]) % 360)
        mean_spacing = float(np.mean(spacings))
        max_dev = float(max(abs(s - mean_spacing) for s in spacings))
        if max_dev > _ANGULAR_TOL:
            return None

        return cx, cy, r, mean_spacing


# ── Helpers ────────────────────────────────────────────────────────────────


def _extract_centres(features: list) -> list[list[float]]:
    """Extract (cx, cy) or (x_min+width/2, y_min+height/2) from features."""
    centres = []
    for f in features:
        p = f.params
        if "center_x" in p and "center_y" in p:
            centres.append([p["center_x"], p["center_y"]])
        elif "x_min" in p and "x_max" in p and "y_min" in p and "y_max" in p:
            cx = (p["x_min"] + p["x_max"]) / 2
            cy = (p["y_min"] + p["y_max"]) / 2
            centres.append([cx, cy])
    return centres


def _feature_size_key(f: object) -> tuple:
    """Return a hashable key encoding the feature type and approximate size."""
    ftype = getattr(f, "feature_type", "")
    p = getattr(f, "params", {})
    if ftype == "circular_hole":
        return (ftype, round(p.get("diameter", 0.0), 1))
    if ftype in {"rectangular_slot", "notch"}:
        return (ftype, round(p.get("width", 0.0), 1), round(p.get("height", 0.0), 1))
    return (ftype,)


def _circumcircle(
    a: np.ndarray, b: np.ndarray, c: np.ndarray
) -> tuple[float, float, Optional[float]]:
    """Compute the circumcircle of 3 points. Returns (cx, cy, radius)."""
    ax, ay = float(a[0]), float(a[1])
    bx, by = float(b[0]), float(b[1])
    cx, cy = float(c[0]), float(c[1])
    d = 2.0 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-10:
        return 0.0, 0.0, None
    ux = ((ax**2 + ay**2) * (by - cy) + (bx**2 + by**2) * (cy - ay)
          + (cx**2 + cy**2) * (ay - by)) / d
    uy = ((ax**2 + ay**2) * (cx - bx) + (bx**2 + by**2) * (ax - cx)
          + (cx**2 + cy**2) * (bx - ax)) / d
    r = math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2)
    return ux, uy, r
