"""Stage 1: Z-profile extraction.

Extracts unique Z-values per file, cross-references to detect pocket vs protrusion,
and generates staircase analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from forge_cad.analyzer.loader import LoadedMesh

# Tolerance for clustering Z-levels that are numerically close
Z_CLUSTER_TOLERANCE = 0.1  # mm


@dataclass
class ZProfile:
    """Z-profile for a single mesh."""

    mesh_name: str
    z_min: float
    z_max: float
    z_thickness: float
    significant_levels: list[float] = field(default_factory=list)
    is_flat_slab: bool = False


@dataclass
class ZProfileResult:
    """Aggregated Z-profile across all meshes."""

    profiles: dict[str, ZProfile]
    all_levels: list[float]
    body_z_min: float
    body_z_max: float
    body_candidate: Optional[str] = None


class ZProfileExtractor:
    """Extracts and analyses Z-profiles from a set of loaded meshes."""

    def __init__(self, meshes: list[LoadedMesh]) -> None:
        self.meshes = [m for m in meshes if m.file_type != "dxf"]

    def extract(self) -> dict:
        """Run extraction and return a plain dict (for ProjectForm serialisation)."""
        result = self._extract_profiles()
        return {
            "profiles": {
                name: {
                    "z_min": p.z_min,
                    "z_max": p.z_max,
                    "z_thickness": p.z_thickness,
                    "significant_levels": p.significant_levels,
                    "is_flat_slab": p.is_flat_slab,
                }
                for name, p in result.profiles.items()
            },
            "all_levels": result.all_levels,
            "body_z_min": result.body_z_min,
            "body_z_max": result.body_z_max,
            "body_candidate": result.body_candidate,
        }

    def _extract_profiles(self) -> ZProfileResult:
        profiles: dict[str, ZProfile] = {}

        for mesh in self.meshes:
            profile = self._profile_one(mesh)
            profiles[mesh.name] = profile

        all_levels = self._cluster_levels(profiles)
        body_candidate, body_z_min, body_z_max = self._find_body(profiles)

        return ZProfileResult(
            profiles=profiles,
            all_levels=all_levels,
            body_z_min=body_z_min,
            body_z_max=body_z_max,
            body_candidate=body_candidate,
        )

    def _profile_one(self, mesh: LoadedMesh) -> ZProfile:
        """Extract the Z-profile of a single mesh."""
        try:

            tm = mesh.mesh
            if not hasattr(tm, "vertices"):
                return ZProfile(
                    mesh_name=mesh.name,
                    z_min=mesh.z_min,
                    z_max=mesh.z_max,
                    z_thickness=mesh.z_max - mesh.z_min,
                )

            z_vals = tm.vertices[:, 2]
            z_min = float(np.min(z_vals))
            z_max = float(np.max(z_vals))
            z_thickness = z_max - z_min

            # Detect significant Z-levels by finding vertex-dense clusters
            significant = self._find_significant_levels(z_vals, z_min, z_max)

            # A mesh is a "flat slab" if there are only 2 significant Z-levels
            is_flat_slab = len(significant) <= 2 and z_thickness > 0

            return ZProfile(
                mesh_name=mesh.name,
                z_min=z_min,
                z_max=z_max,
                z_thickness=z_thickness,
                significant_levels=significant,
                is_flat_slab=is_flat_slab,
            )
        except Exception:  # noqa: BLE001
            return ZProfile(
                mesh_name=mesh.name,
                z_min=mesh.z_min,
                z_max=mesh.z_max,
                z_thickness=mesh.z_max - mesh.z_min,
            )

    @staticmethod
    def _find_significant_levels(
        z_vals: np.ndarray,
        z_min: float,
        z_max: float,
        n_bins: int = 200,
        min_vertex_fraction: float = 0.01,
    ) -> list[float]:
        """Find Z levels with high vertex density (likely face planes)."""
        if z_max <= z_min:
            return [round(z_min, 3)]

        hist, edges = np.histogram(z_vals, bins=n_bins, range=(z_min, z_max))
        threshold = max(1, int(len(z_vals) * min_vertex_fraction))

        candidate_levels: list[float] = []
        for i, count in enumerate(hist):
            if count >= threshold:
                level = float((edges[i] + edges[i + 1]) / 2)
                candidate_levels.append(level)

        # Cluster nearby levels
        clustered: list[float] = []
        for level in candidate_levels:
            if not clustered or abs(level - clustered[-1]) > Z_CLUSTER_TOLERANCE:
                clustered.append(round(level, 3))

        # Ensure z_min and z_max are represented, then re-cluster the merged set
        raw = sorted({round(z_min, 3), round(z_max, 3)} | set(clustered))
        result: list[float] = []
        for level in raw:
            if not result or abs(level - result[-1]) > Z_CLUSTER_TOLERANCE:
                result.append(level)
        return result

    def _cluster_levels(self, profiles: dict[str, ZProfile]) -> list[float]:
        """Merge all significant Z-levels across all profiles."""
        all_raw: list[float] = []
        for p in profiles.values():
            all_raw.extend(p.significant_levels)
            all_raw.extend([p.z_min, p.z_max])

        if not all_raw:
            return [0.0]

        sorted_levels = sorted(set(all_raw))
        merged: list[float] = []
        for level in sorted_levels:
            if not merged or abs(level - merged[-1]) > Z_CLUSTER_TOLERANCE:
                merged.append(round(level, 3))

        return merged

    def _find_body(
        self, profiles: dict[str, ZProfile]
    ) -> tuple[Optional[str], float, float]:
        """Find the mesh that is most likely the body (tallest Z-range)."""
        if not profiles:
            return None, 0.0, 0.0

        body_name = max(profiles, key=lambda n: profiles[n].z_thickness)
        body = profiles[body_name]
        return body_name, body.z_min, body.z_max
