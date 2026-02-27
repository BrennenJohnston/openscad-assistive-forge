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
        brep_face_metadata: Optional[list[dict]] = None,
    ) -> None:
        self.meshes = {m.name: m for m in meshes if m.file_type != "dxf"}
        self.z_profiles = z_profiles
        self.variant_diffs = variant_diffs
        # Optional B-rep face type data from occt-import-js (Phase 3D)
        self.brep_face_metadata = brep_face_metadata or []
        self._feature_counter: dict[str, int] = {}

    def detect(self) -> list[DetectedFeature]:
        """Run feature detection and return all detected features."""
        features: list[DetectedFeature] = []
        all_z_levels = self.z_profiles.get("all_levels", [])

        body_candidate = self.z_profiles.get("body_candidate")
        body_mesh = self.meshes.get(body_candidate) if body_candidate else None

        if body_mesh is None and self.meshes:
            body_mesh = max(self.meshes.values(), key=lambda m: m.volume)

        if body_mesh is None:
            return features

        # Cross-section analysis at each Z-level
        for z in all_z_levels:
            new_features = self._analyse_cross_section(body_mesh, z)
            features.extend(new_features)

        # Enrich with variant diff data (volume-derived features)
        features.extend(self._features_from_variant_diffs())

        # Fillet / chamfer detection via edge dihedral angles (Phase 3A)
        features.extend(self._detect_fillets_chamfers(body_mesh))

        # Enrich from B-rep face metadata if provided (Phase 3D)
        if self.brep_face_metadata:
            features.extend(self._features_from_brep(self.brep_face_metadata))

        # Deduplicate similar features
        features = self._deduplicate(features)

        # Name features
        for i, f in enumerate(features):
            if not f.name:
                f.name = f"{f.feature_type}_{i+1}"

        return features

    def _features_from_variant_diffs(self) -> list[DetectedFeature]:
        """Derive feature hints from variant differencing results."""
        features: list[DetectedFeature] = []
        pairs = self.variant_diffs.get("pairs", [])

        for pair in pairs:
            relationship = pair.get("relationship", "")
            vol_diff = pair.get("volume_diff", 0.0)
            if relationship in {"subtracted", "holes_removed"} and abs(vol_diff) > 0:
                features.append(
                    DetectedFeature(
                        name="",
                        feature_type=(
                            "circular_hole"
                            if relationship == "holes_removed"
                            else "polygon"
                        ),
                        detected_from=(
                            f"variant_diff:"
                            f"{pair.get('base', '')}→{pair.get('variant', '')}"
                        ),
                        params={
                            "volume_diff": round(abs(vol_diff), 3),
                            "relationship": relationship,
                        },
                    )
                )
        return features

    def _analyse_cross_section(
        self, mesh: LoadedMesh, z: float
    ) -> list[DetectedFeature]:
        """Take a cross-section at Z and detect features in the diff cross-section."""
        features: list[DetectedFeature] = []
        try:

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

    def _detect_fillets_chamfers(self, mesh: LoadedMesh) -> list[DetectedFeature]:
        """Detect fillets and chamfers via edge dihedral angle analysis (Phase 3A).

        For each edge shared by exactly 2 faces:
        - angle < 10°  : tangent (skip)
        - 10–80°       : chamfer candidate
        - chain of small angle transitions along connected edges → fillet
        """
        features: list[DetectedFeature] = []
        try:
            import numpy as np

            tm = mesh.mesh
            if not hasattr(tm, "face_adjacency"):
                return features

            adjacency = np.asarray(tm.face_adjacency)       # shape (E, 2) face index pairs
            normals = np.asarray(tm.face_normals)            # shape (F, 3)

            fillet_edges: list[int] = []
            chamfer_edges: list[int] = []

            for i, (f0, f1) in enumerate(adjacency):
                n0 = normals[f0]
                n1 = normals[f1]
                cos_a = float(np.clip(np.dot(n0, n1), -1.0, 1.0))
                angle_deg = math.degrees(math.acos(abs(cos_a)))

                if 10.0 <= angle_deg <= 80.0:
                    chamfer_edges.append(i)
                elif angle_deg < 10.0:
                    fillet_edges.append(i)

            if fillet_edges:
                # Estimate average fillet radius from curvature proxy
                radius = _estimate_fillet_radius(tm, fillet_edges)
                self._feature_counter["fillet"] = self._feature_counter.get("fillet", 0) + 1
                features.append(DetectedFeature(
                    name="",
                    feature_type="fillet",
                    detected_from=f"edge_dihedral_{mesh.name}",
                    params={
                        "radius": round(radius, 3),
                        "edge_count": len(fillet_edges),
                    },
                ))

            if chamfer_edges:
                size = _estimate_chamfer_size(tm, chamfer_edges)
                self._feature_counter["chamfer"] = self._feature_counter.get("chamfer", 0) + 1
                features.append(DetectedFeature(
                    name="",
                    feature_type="chamfer",
                    detected_from=f"edge_dihedral_{mesh.name}",
                    params={
                        "size": round(size, 3),
                        "edge_count": len(chamfer_edges),
                    },
                ))

        except Exception:  # noqa: BLE001
            pass

        return features

    def _features_from_brep(self, metadata: list[dict]) -> list[DetectedFeature]:
        """Enrich features from B-rep face type data (Phase 3D).

        Each metadata entry has:
          face_type: "planar" | "cylindrical" | "conical" | "toroidal" | "spherical"
          radius:    float (for cylindrical/toroidal/spherical)
          area:      float
        """
        features: list[DetectedFeature] = []
        for face in metadata:
            face_type = face.get("face_type", "")
            radius = face.get("radius", 0.0)
            area = face.get("area", 0.0)

            if face_type == "cylindrical" and radius > 0 and area >= MIN_FEATURE_AREA:
                self._feature_counter["circular_hole"] = (
                    self._feature_counter.get("circular_hole", 0) + 1
                )
                features.append(DetectedFeature(
                    name="",
                    feature_type="circular_hole",
                    detected_from="brep_face",
                    params={
                        "diameter": round(radius * 2, 3),
                        "center_x": round(face.get("center_x", 0.0), 3),
                        "center_y": round(face.get("center_y", 0.0), 3),
                        "z_level": round(face.get("z_min", 0.0), 3),
                    },
                ))
            elif face_type == "toroidal" and radius > 0:
                self._feature_counter["fillet"] = self._feature_counter.get("fillet", 0) + 1
                features.append(DetectedFeature(
                    name="",
                    feature_type="fillet",
                    detected_from="brep_face",
                    params={"radius": round(radius, 3), "edge_count": 1},
                ))

        return features

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
                elif f.feature_type in {"fillet", "chamfer"}:
                    # Keep only the first fillet/chamfer detection per mesh
                    if s.detected_from == f.detected_from:
                        is_dup = True
                        break
            if not is_dup:
                seen.append(f)
        return seen


# ── Module-level helpers ────────────────────────────────────────────────────


def _estimate_fillet_radius(mesh: object, edge_indices: list[int]) -> float:
    """Estimate average fillet radius from curvature proxy on smooth edges."""
    try:
        import numpy as np

        adjacency = np.asarray(mesh.face_adjacency)
        normals = np.asarray(mesh.face_normals)
        radii = []
        for i in edge_indices[:20]:  # sample first 20 for speed
            f0, f1 = adjacency[i]
            n0, n1 = normals[f0], normals[f1]
            cos_a = float(np.clip(np.dot(n0, n1), -1.0, 1.0))
            angle = math.acos(abs(cos_a))
            if angle > 1e-6:
                # Very rough: r ≈ edge_length / (2 * sin(angle/2))
                edge_verts = mesh.face_adjacency_edges
                if hasattr(edge_verts, "__len__") and i < len(edge_verts):
                    verts = np.asarray(mesh.vertices)
                    v0, v1 = edge_verts[i]
                    edge_len = float(np.linalg.norm(verts[v0] - verts[v1]))
                    if edge_len > 0:
                        r = edge_len / (2.0 * math.sin(angle / 2.0))
                        radii.append(r)
        return float(np.median(radii)) if radii else 1.0
    except Exception:  # noqa: BLE001
        return 1.0


def _estimate_chamfer_size(mesh: object, edge_indices: list[int]) -> float:
    """Estimate average chamfer size (width of chamfer face) from edge geometry."""
    try:
        import numpy as np

        edge_verts = mesh.face_adjacency_edges
        verts = np.asarray(mesh.vertices)
        lengths = []
        for i in edge_indices[:20]:
            if i < len(edge_verts):
                v0, v1 = edge_verts[i]
                lengths.append(float(np.linalg.norm(verts[v0] - verts[v1])))
        return float(np.median(lengths)) if lengths else 1.0
    except Exception:  # noqa: BLE001
        return 1.0
