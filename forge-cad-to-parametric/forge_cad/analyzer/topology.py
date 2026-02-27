"""Stage 3: Assembly topology classification.

Uses the Z-range subset rule and component role classification to build a CSG tree proposal.

Core heuristic: if a component's Z-range is a strict subset of the body's Z-range,
it is classified as pocket_fill (not additive). This single rule prevents the most
common staircase misclassification error.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from forge_cad.analyzer.loader import LoadedMesh

# Tolerance for Z-range comparison (mm)
Z_SUBSET_TOLERANCE = 0.5


@dataclass
class ClassifiedComponent:
    """A mesh with a topology role assigned."""

    name: str
    role: str  # "base_solid" | "pocket_fill" | "additive" | "subtractive" | "unknown"
    z_min: float
    z_max: float
    source_file: str
    csg_order: int = 0
    notes: list[str] = field(default_factory=list)


class TopologyClassifier:
    """Classifies components using Z-range subset and variant-diff heuristics."""

    def __init__(
        self,
        meshes: list[LoadedMesh],
        z_profiles: dict,
        variant_diffs: dict,
    ) -> None:
        self.meshes = {m.name: m for m in meshes if m.file_type != "dxf"}
        self.z_profiles = z_profiles
        self.variant_diffs = variant_diffs

    def classify(self) -> list[ClassifiedComponent]:
        """Return a list of classified components, ordered for CSG construction."""
        body_candidate = self.z_profiles.get("body_candidate")
        body_z_min = self.z_profiles.get("body_z_min", 0.0)
        body_z_max = self.z_profiles.get("body_z_max", 0.0)

        components: list[ClassifiedComponent] = []
        csg_order = 0

        for name, mesh in self.meshes.items():
            profile = self.z_profiles.get("profiles", {}).get(name, {})
            z_min = profile.get("z_min", mesh.z_min)
            z_max = profile.get("z_max", mesh.z_max)

            role, notes = self._classify_role(
                name=name,
                z_min=z_min,
                z_max=z_max,
                is_body_candidate=(name == body_candidate),
                body_z_min=body_z_min,
                body_z_max=body_z_max,
                auto_role=mesh.auto_role,
            )

            components.append(
                ClassifiedComponent(
                    name=name,
                    role=role,
                    z_min=z_min,
                    z_max=z_max,
                    source_file=str(mesh.path),
                    csg_order=csg_order,
                    notes=notes,
                )
            )
            csg_order += 1

        # Sort: base_solid first, then pocket_fill by Z height ascending, then others
        components.sort(key=self._sort_key)
        for i, c in enumerate(components):
            c.csg_order = i

        return components

    @staticmethod
    def _classify_role(
        name: str,
        z_min: float,
        z_max: float,
        is_body_candidate: bool,
        body_z_min: float,
        body_z_max: float,
        auto_role: str,
    ) -> tuple[str, list[str]]:
        notes: list[str] = []

        if is_body_candidate or auto_role == "full_assembly":
            return "base_solid", ["tallest Z-range → base solid"]

        if auto_role == "variant_removed":
            notes.append("filename suggests removed/variant → skipping as variant")
            return "variant", notes

        # Z-range subset rule: if this component is entirely within the body Z-range
        # AND it is shorter than the body, it is recessed (pocket_fill), not additive.
        z_thickness = z_max - z_min
        body_thickness = body_z_max - body_z_min

        if (
            body_thickness > 0
            and z_min >= body_z_min - Z_SUBSET_TOLERANCE
            and z_max <= body_z_max - Z_SUBSET_TOLERANCE
            and z_thickness < body_thickness - Z_SUBSET_TOLERANCE
        ):
            notes.append(
                f"Z-range [{z_min:.1f}, {z_max:.1f}] ⊂ body [{body_z_min:.1f}, {body_z_max:.1f}]"
                " → pocket_fill (recessed, not additive)"
            )
            return "pocket_fill", notes

        if auto_role == "isolated_component":
            notes.append("isolated component with matching body Z-range → additive")
            return "additive", notes

        notes.append("could not auto-classify; needs manual review")
        return "unknown", notes

    @staticmethod
    def _sort_key(c: ClassifiedComponent) -> tuple:
        order = {"base_solid": 0, "pocket_fill": 1, "additive": 2, "subtractive": 3, "variant": 4, "unknown": 5}
        return (order.get(c.role, 99), c.z_max)
