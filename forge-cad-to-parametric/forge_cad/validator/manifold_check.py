"""Manifold (watertightness) verification for generated meshes."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class ManifoldReport:
    """Result of a manifold check."""

    path: Path
    is_watertight: bool
    is_winding_consistent: bool
    open_edges: int
    degenerate_faces: int
    notes: list[str]

    @property
    def is_valid(self) -> bool:
        return self.is_watertight and self.is_winding_consistent and self.degenerate_faces == 0


def check_manifold(stl_path: Path) -> ManifoldReport:
    """Check a mesh STL file for manifold validity.

    Returns a ManifoldReport with watertightness, winding consistency,
    open edge count, and degenerate face count.
    """
    notes: list[str] = []

    try:
        import trimesh

        mesh = trimesh.load(str(stl_path), force="mesh")

        is_watertight = bool(mesh.is_watertight)
        is_winding = bool(mesh.is_winding_consistent)
        open_edges = int(len(mesh.edges_open)) if hasattr(mesh, "edges_open") else 0
        degenerate = int(len(mesh.faces_degenerate)) if hasattr(mesh, "faces_degenerate") else 0

        if not is_watertight:
            notes.append(
                f"Mesh is not watertight ({open_edges} open edges). "
                "OpenSCAD boolean ops may produce artifacts."
            )
        if not is_winding:
            notes.append(
                "Winding is inconsistent. Some face normals may be inverted."
            )
        if degenerate > 0:
            notes.append(f"{degenerate} degenerate (zero-area) faces detected.")
        if is_watertight and is_winding and degenerate == 0:
            notes.append("Mesh passes all manifold checks.")

        return ManifoldReport(
            path=stl_path,
            is_watertight=is_watertight,
            is_winding_consistent=is_winding,
            open_edges=open_edges,
            degenerate_faces=degenerate,
            notes=notes,
        )

    except Exception as e:  # noqa: BLE001
        return ManifoldReport(
            path=stl_path,
            is_watertight=False,
            is_winding_consistent=False,
            open_edges=-1,
            degenerate_faces=-1,
            notes=[f"Error loading mesh: {e}"],
        )
