"""Stage 6: Boundary detection.

Finds shared Y/X/Z boundaries between components and flags coincident faces
that need eps expansion to prevent CGAL manifold artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from forge_cad.analyzer.loader import LoadedMesh
from forge_cad.analyzer.topology import ClassifiedComponent

# Coincidence tolerance in mm
COINCIDENCE_TOLERANCE = 0.05


@dataclass
class CoincidentBoundary:
    """A face boundary shared between two components."""

    component_a: str
    component_b: str
    axis: str  # "X" | "Y" | "Z"
    value: float
    needs_eps: bool = True
    description: str = ""


class BoundaryDetector:
    """Detects shared face boundaries between classified components."""

    def __init__(
        self,
        meshes: list[LoadedMesh],
        components: list[ClassifiedComponent],
    ) -> None:
        self.meshes = {m.name: m for m in meshes}
        self.components = components

    def detect(self) -> list[dict]:
        """Detect boundaries and return a plain list of dicts for serialisation."""
        boundaries = self._detect()
        return [
            {
                "component_a": b.component_a,
                "component_b": b.component_b,
                "axis": b.axis,
                "value": round(b.value, 4),
                "needs_eps": b.needs_eps,
                "description": b.description,
            }
            for b in boundaries
        ]

    def _detect(self) -> list[CoincidentBoundary]:
        boundaries: list[CoincidentBoundary] = []

        # Compare each pair of components
        for i, ca in enumerate(self.components):
            for cb in self.components[i + 1:]:
                boundaries.extend(self._compare_pair(ca, cb))

        return boundaries

    def _compare_pair(
        self, ca: ClassifiedComponent, cb: ClassifiedComponent
    ) -> list[CoincidentBoundary]:
        """Detect coincident faces between two components."""
        results: list[CoincidentBoundary] = []
        mesh_a = self.meshes.get(ca.name)
        mesh_b = self.meshes.get(cb.name)

        if mesh_a is None or mesh_b is None:
            return results

        a_bounds = mesh_a.bounding_box
        b_bounds = mesh_b.bounding_box

        if a_bounds is None or b_bounds is None:
            # Fall back to Z-range comparison
            return self._compare_z_ranges(ca, cb)

        axis_labels = ["X", "Y", "Z"]
        for axis_idx, axis_label in enumerate(axis_labels):
            # Check if max of A coincides with min of B
            if abs(a_bounds[1][axis_idx] - b_bounds[0][axis_idx]) < COINCIDENCE_TOLERANCE:
                results.append(
                    CoincidentBoundary(
                        component_a=ca.name,
                        component_b=cb.name,
                        axis=axis_label,
                        value=a_bounds[1][axis_idx],
                        needs_eps=True,
                        description=(
                            f"{ca.name} {axis_label}-max ({a_bounds[1][axis_idx]:.3f}) "
                            f"coincides with {cb.name} {axis_label}-min"
                        ),
                    )
                )

            # Check if min of A coincides with max of B
            if abs(a_bounds[0][axis_idx] - b_bounds[1][axis_idx]) < COINCIDENCE_TOLERANCE:
                results.append(
                    CoincidentBoundary(
                        component_a=ca.name,
                        component_b=cb.name,
                        axis=axis_label,
                        value=a_bounds[0][axis_idx],
                        needs_eps=True,
                        description=(
                            f"{ca.name} {axis_label}-min ({a_bounds[0][axis_idx]:.3f}) "
                            f"coincides with {cb.name} {axis_label}-max"
                        ),
                    )
                )

        return results

    def _compare_z_ranges(
        self, ca: ClassifiedComponent, cb: ClassifiedComponent
    ) -> list[CoincidentBoundary]:
        """Fallback: compare Z-ranges only."""
        results: list[CoincidentBoundary] = []

        if abs(ca.z_min - cb.z_min) < COINCIDENCE_TOLERANCE:
            results.append(
                CoincidentBoundary(
                    component_a=ca.name,
                    component_b=cb.name,
                    axis="Z",
                    value=ca.z_min,
                    needs_eps=True,
                    description=f"Shared Z=0 bottom face between {ca.name} and {cb.name}",
                )
            )

        if abs(ca.z_max - cb.z_max) < COINCIDENCE_TOLERANCE:
            results.append(
                CoincidentBoundary(
                    component_a=ca.name,
                    component_b=cb.name,
                    axis="Z",
                    value=ca.z_max,
                    needs_eps=True,
                    description=f"Shared Z-max face between {ca.name} and {cb.name}",
                )
            )

        return results
