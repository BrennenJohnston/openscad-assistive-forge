"""Stage 4: Feature detection.

Performs cross-section analysis at Z-levels, fits circular/rectangular/polygonal
primitives, and extracts dimensions.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from forge_cad.analyzer.loader import LoadedMesh

# Circularity threshold: 1.0 = perfect circle, lower = less circular
CIRCLE_THRESHOLD = 0.80
# Minimum feature area to report (mm²)
MIN_FEATURE_AREA = 4.0


@dataclass
class DetectedFeature:
    """A geometric feature detected in the cross-sections."""

    name: str
    feature_type: str  # "circular_hole" | "rectangular_slot" | "polygon" | "notch"
    detected_from: str
    params: dict = field(default_factory=dict)
    # params keys depend on type:
    # circular_hole: center_x, center_y, diameter, z_level
    # rectangular_slot: x_min, x_max, y_min, y_max, width, height, z_level
    # polygon: vertices (list of [x,y]), z_level
    # notch: x_min, x_max, y_min, y_max, z_level, edge


class FeatureDetector:
    """Detects geometric features by analysing cross-sections at significant Z-levels."""

    def __init__(
        self,
        meshes: list[LoadedMesh],
        z_profiles: dict,
        variant_diffs: dict,
    ) -> None:
        self.meshes = {m.name: m for m in meshes if m.file_type != "dxf"}
        self.z_profiles = z_profiles
        self.variant_diffs = variant_diffs
        self._feature_counter: dict[str, int] = {}

    def detect(self) -> list[DetectedFeature]:
        """Run feature detection and return all detected features."""
        features: list[DetectedFeature] = []
        all_z_levels = self.z_profiles.get("all_levels", [])

        body_candidate = self.z_profiles.get("body_candidate")
        body_mesh = self.meshes.get(body_candidate) if body_candidate else None

        if body_mesh is None and self.meshes:
            # Use the mesh with the largest volume as the body
            body_mesh = max(self.meshes.values(), key=lambda m: m.volume)

        if body_mesh is None:
            return features

        # Cross-section analysis at each Z-level
        for z in all_z_levels:
            new_features = self._analyse_cross_section(body_mesh, z)
            features.extend(new_features)

        # Deduplicate similar features
        features = self._deduplicate(features)

        # Name features
        for i, f in enumerate(features):
            if not f.name:
                f.name = f"{f.feature_type}_{i+1}"

        return features

    def _analyse_cross_section(
        self, mesh: LoadedMesh, z: float
    ) -> list[DetectedFeature]:
        """Take a cross-section at Z and detect features in the diff cross-section."""
        features: list[DetectedFeature] = []
        try:
            import trimesh

            tm = mesh.mesh
            if not hasattr(tm, "section"):
                return features

            # Slice slightly above and below to get the interior cross-section
            z_mid = z + 0.1
            if z_mid > mesh.z_max:
                z_mid = max(mesh.z_min + 0.01, z - 0.1)

            section = tm.section(
                plane_origin=[0, 0, z_mid],
                plane_normal=[0, 0, 1],
            )

            if section is None:
                return features

            paths_2d, _ = section.to_planar()
            if paths_2d is None:
                return features

            for path in paths_2d.discrete():
                if path is None or len(path) < 4:
                    continue
                detected = self._classify_path(path, z_mid, mesh.name)
                if detected is not None:
                    features.append(detected)

        except Exception:  # noqa: BLE001
            pass

        return features

    def _classify_path(
        self, path: np.ndarray, z: float, source_name: str
    ) -> Optional[DetectedFeature]:
        """Classify a 2D path as circular, rectangular, or polygon."""
        if len(path) < 3:
            return None

        area = self._polygon_area(path)
        if area < MIN_FEATURE_AREA:
            return None

        # Test circularity
        circularity = self._compute_circularity(path, area)
        if circularity >= CIRCLE_THRESHOLD:
            cx, cy = np.mean(path, axis=0)
            diameter = 2.0 * math.sqrt(area / math.pi)
            feature_type = "circular_hole"
            self._feature_counter[feature_type] = self._feature_counter.get(feature_type, 0) + 1
            return DetectedFeature(
                name="",
                feature_type=feature_type,
                detected_from=f"cross_section_z{z:.1f}_{source_name}",
                params={
                    "center_x": round(float(cx), 3),
                    "center_y": round(float(cy), 3),
                    "diameter": round(diameter, 3),
                    "z_level": round(z, 3),
                },
            )

        # Test rectangularity
        if self._is_rectangular(path):
            xs = path[:, 0]
            ys = path[:, 1]
            x_min, x_max = float(xs.min()), float(xs.max())
            y_min, y_max = float(ys.min()), float(ys.max())
            feature_type = "rectangular_slot"
            self._feature_counter[feature_type] = self._feature_counter.get(feature_type, 0) + 1
            return DetectedFeature(
                name="",
                feature_type=feature_type,
                detected_from=f"cross_section_z{z:.1f}_{source_name}",
                params={
                    "x_min": round(x_min, 3),
                    "x_max": round(x_max, 3),
                    "y_min": round(y_min, 3),
                    "y_max": round(y_max, 3),
                    "width": round(x_max - x_min, 3),
                    "height": round(y_max - y_min, 3),
                    "z_level": round(z, 3),
                },
            )

        # General polygon
        simplified = self._simplify_polygon(path, tolerance=0.5)
        if len(simplified) >= 3:
            feature_type = "polygon"
            self._feature_counter[feature_type] = self._feature_counter.get(feature_type, 0) + 1
            return DetectedFeature(
                name="",
                feature_type=feature_type,
                detected_from=f"cross_section_z{z:.1f}_{source_name}",
                params={
                    "vertices": [[round(float(x), 3), round(float(y), 3)] for x, y in simplified],
                    "vertex_count": len(simplified),
                    "z_level": round(z, 3),
                    "area": round(area, 3),
                },
            )

        return None

    @staticmethod
    def _polygon_area(path: np.ndarray) -> float:
        """Compute signed polygon area via Shoelace formula."""
        x = path[:, 0]
        y = path[:, 1]
        n = len(path)
        area = 0.5 * abs(
            sum(x[i] * y[(i + 1) % n] - x[(i + 1) % n] * y[i] for i in range(n))
        )
        return float(area)

    @staticmethod
    def _compute_circularity(path: np.ndarray, area: float) -> float:
        """Circularity = 4π·Area / Perimeter²; 1.0 = perfect circle."""
        perimeter = float(np.sum(np.linalg.norm(np.diff(path, axis=0), axis=1)))
        if perimeter <= 0:
            return 0.0
        return min(1.0, 4 * math.pi * area / (perimeter ** 2))

    @staticmethod
    def _is_rectangular(path: np.ndarray, tolerance: float = 0.15) -> bool:
        """True if the path approximates a rectangle (4 near-right-angle corners)."""
        simplified = FeatureDetector._simplify_polygon(path, tolerance=1.0)
        if len(simplified) != 4:
            return False
        # Check angles are close to 90°
        for i in range(4):
            v1 = simplified[(i + 1) % 4] - simplified[i]
            v2 = simplified[(i + 2) % 4] - simplified[(i + 1) % 4]
            norms = np.linalg.norm(v1) * np.linalg.norm(v2)
            if norms == 0:
                return False
            cos_angle = np.dot(v1, v2) / norms
            if abs(cos_angle) > tolerance:
                return False
        return True

    @staticmethod
    def _simplify_polygon(path: np.ndarray, tolerance: float = 0.5) -> np.ndarray:
        """Ramer-Douglas-Peucker simplification."""
        try:
            from shapely.geometry import Polygon  # type: ignore[import]
            poly = Polygon(path)
            simplified = poly.simplify(tolerance, preserve_topology=True)
            coords = np.array(simplified.exterior.coords)[:-1]
            return coords
        except Exception:  # noqa: BLE001
            # Fallback: just return the path as-is reduced by stride
            stride = max(1, len(path) // 20)
            return path[::stride]

    def _deduplicate(self, features: list[DetectedFeature]) -> list[DetectedFeature]:
        """Remove features that are very close duplicates (same type, similar location)."""
        seen: list[DetectedFeature] = []
        for f in features:
            is_dup = False
            for s in seen:
                if s.feature_type != f.feature_type:
                    continue
                if f.feature_type == "circular_hole":
                    dx = f.params.get("center_x", 0) - s.params.get("center_x", 0)
                    dy = f.params.get("center_y", 0) - s.params.get("center_y", 0)
                    if math.sqrt(dx * dx + dy * dy) < 1.0:
                        is_dup = True
                        break
                elif f.feature_type == "rectangular_slot":
                    if (
                        abs(f.params.get("x_min", 0) - s.params.get("x_min", 0)) < 1.0
                        and abs(f.params.get("y_min", 0) - s.params.get("y_min", 0)) < 1.0
                    ):
                        is_dup = True
                        break
            if not is_dup:
                seen.append(f)
        return seen
