"""Stage 0: Multi-format file loader supporting STL, OBJ, DXF, and STEP."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

SUPPORTED_MESH_EXTENSIONS = {".stl", ".obj", ".step", ".stp"}
SUPPORTED_DXF_EXTENSIONS = {".dxf"}
SUPPORTED_EXTENSIONS = SUPPORTED_MESH_EXTENSIONS | SUPPORTED_DXF_EXTENSIONS

# Heuristics for auto-role detection from filename patterns
_ROLE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"removed|without|base.plates.removed", re.IGNORECASE), "variant_removed"),
    (re.compile(r"no.holes", re.IGNORECASE), "variant_no_holes"),
    (re.compile(r"layer\s*1|plate.*1|layer1", re.IGNORECASE), "isolated_component"),
    (re.compile(r"layer\s*2|plate.*2|layer2", re.IGNORECASE), "isolated_component"),
    (re.compile(r"clean.overview|full.general|full.assembly|complete", re.IGNORECASE), "full_assembly"),
    (re.compile(r"except|only", re.IGNORECASE), "variant_feature"),
]


@dataclass
class DxfProfile:
    """A 2D profile loaded from a DXF file."""

    path: Path
    layer: str
    vertices: np.ndarray  # shape (N, 2)
    is_closed: bool = True


@dataclass
class LoadedMesh:
    """A loaded 3D mesh with metadata."""

    path: Path
    file_type: str
    mesh: object  # trimesh.Trimesh or trimesh.Scene
    auto_role: str
    z_min: float = 0.0
    z_max: float = 0.0
    vertex_count: int = 0
    volume: float = 0.0
    bounding_box: Optional[np.ndarray] = None  # shape (2, 3): [min, max]
    dxf_profiles: list[DxfProfile] = field(default_factory=list)

    @property
    def name(self) -> str:
        return self.path.stem


class FileLoader:
    """Scans a source directory and loads all supported CAD files."""

    def __init__(self, source_dir: Path) -> None:
        self.source_dir = source_dir

    def load_all(self) -> list[LoadedMesh]:
        """Load every supported file found recursively under source_dir."""
        results: list[LoadedMesh] = []
        found_paths = sorted(
            p for p in self.source_dir.rglob("*")
            if p.suffix.lower() in SUPPORTED_EXTENSIONS
        )

        for path in found_paths:
            try:
                loaded = self._load_file(path)
                if loaded is not None:
                    results.append(loaded)
            except Exception as exc:  # noqa: BLE001
                # Graceful degradation: log and continue
                import warnings
                warnings.warn(f"Could not load {path}: {exc}", stacklevel=2)

        return results

    def _load_file(self, path: Path) -> Optional[LoadedMesh]:
        ext = path.suffix.lower()
        if ext in SUPPORTED_MESH_EXTENSIONS:
            return self._load_mesh(path)
        if ext in SUPPORTED_DXF_EXTENSIONS:
            return self._load_dxf(path)
        return None

    def _load_mesh(self, path: Path) -> LoadedMesh:
        import trimesh

        ext = path.suffix.lower()
        file_type = "step" if ext in {".step", ".stp"} else ext.lstrip(".")

        if ext in {".step", ".stp"}:
            mesh = self._load_step(path)
        else:
            mesh = trimesh.load(str(path), force="mesh")

        # Normalise scene to single mesh
        if hasattr(mesh, "dump"):
            meshes = mesh.dump(concatenate=True)
            mesh = meshes if not hasattr(meshes, "vertices") else meshes

        auto_role = self._detect_role(path)

        z_min = float(mesh.bounds[0][2]) if hasattr(mesh, "bounds") else 0.0
        z_max = float(mesh.bounds[1][2]) if hasattr(mesh, "bounds") else 0.0
        vertex_count = len(mesh.vertices) if hasattr(mesh, "vertices") else 0
        volume = float(mesh.volume) if hasattr(mesh, "volume") else 0.0
        bounding_box = np.array(mesh.bounds) if hasattr(mesh, "bounds") else None

        return LoadedMesh(
            path=path,
            file_type=file_type,
            mesh=mesh,
            auto_role=auto_role,
            z_min=z_min,
            z_max=z_max,
            vertex_count=vertex_count,
            volume=volume,
            bounding_box=bounding_box,
        )

    def _load_step(self, path: Path) -> object:
        """Load STEP file; falls back to trimesh if cadquery unavailable."""
        try:
            import cadquery as cq  # type: ignore[import]
            import trimesh

            result = cq.importers.importStep(str(path))
            # Export to temp STL for trimesh analysis
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            cq.exporters.export(result, str(tmp_path))
            mesh = trimesh.load(str(tmp_path), force="mesh")
            tmp_path.unlink(missing_ok=True)
            return mesh
        except ImportError:
            import trimesh
            # trimesh can attempt STEP loading via cascadio if installed
            return trimesh.load(str(path), force="mesh")

    def _load_dxf(self, path: Path) -> LoadedMesh:
        import ezdxf

        doc = ezdxf.readfile(str(path))
        msp = doc.modelspace()
        profiles: list[DxfProfile] = []

        for entity in msp:
            try:
                profile = self._entity_to_profile(entity, path)
                if profile is not None:
                    profiles.append(profile)
            except Exception:  # noqa: BLE001
                continue

        # Build a stub mesh using a flat dummy for compatibility
        import trimesh
        dummy_mesh = trimesh.creation.box([1, 1, 0.001])

        return LoadedMesh(
            path=path,
            file_type="dxf",
            mesh=dummy_mesh,
            auto_role=self._detect_role(path),
            dxf_profiles=profiles,
        )

    def _entity_to_profile(self, entity: object, source_path: Path) -> Optional[DxfProfile]:
        import ezdxf

        layer = getattr(entity, "dxf", None)
        layer_name = layer.layer if layer else "0"

        if entity.dxftype() == "LWPOLYLINE":
            pts = np.array(list(entity.get_points("xy")), dtype=float)
            if len(pts) < 3:
                return None
            is_closed = entity.closed
            return DxfProfile(
                path=source_path,
                layer=layer_name,
                vertices=pts,
                is_closed=is_closed,
            )

        if entity.dxftype() == "POLYLINE":
            pts = np.array([[v.dxf.location.x, v.dxf.location.y] for v in entity.vertices])
            if len(pts) < 3:
                return None
            return DxfProfile(
                path=source_path,
                layer=layer_name,
                vertices=pts,
                is_closed=True,
            )

        if entity.dxftype() == "SPLINE":
            pts = np.array([[p[0], p[1]] for p in entity.control_points])
            if len(pts) < 3:
                return None
            return DxfProfile(
                path=source_path,
                layer=layer_name,
                vertices=pts,
                is_closed=False,
            )

        return None

    @staticmethod
    def _detect_role(path: Path) -> str:
        """Heuristically determine the role of a file from its name/path."""
        text = " ".join([path.stem, path.parent.name])
        for pattern, role in _ROLE_PATTERNS:
            if pattern.search(text):
                return role
        return "unknown"
