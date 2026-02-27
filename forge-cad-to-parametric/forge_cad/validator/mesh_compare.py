"""Mesh comparison validator.

Generates an STL from the output .scad (via OpenSCAD CLI), then compares
volume, surface area, and bounding box against source meshes.
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

from forge_cad.forms.project_form import ProjectForm


@dataclass
class ValidationRow:
    """One row in the validation report."""

    metric: str
    source_value: float
    generated_value: float
    deviation: float  # percentage


@dataclass
class ValidationReport:
    """Complete validation report."""

    rows: list[ValidationRow] = field(default_factory=list)
    generated_stl: Optional[Path] = None
    openscad_stderr: str = ""
    success: bool = False

    @property
    def max_deviation(self) -> float:
        if not self.rows:
            return 0.0
        return max(r.deviation for r in self.rows)


class MeshComparator:
    """Compares a generated .scad against source meshes."""

    def __init__(
        self,
        form: ProjectForm,
        scad_path: Path,
        openscad_exe: str = "openscad",
    ) -> None:
        self.form = form
        self.scad_path = scad_path
        self.openscad_exe = openscad_exe

    def compare(self) -> ValidationReport:
        """Run comparison and return a report."""
        report = ValidationReport()

        # Step 1: Render the .scad to STL
        generated_stl = self._render_to_stl(report)
        if generated_stl is None:
            return report

        report.generated_stl = generated_stl

        # Step 2: Load the generated STL
        try:
            import trimesh
            gen_mesh = trimesh.load(str(generated_stl), force="mesh")
        except Exception as e:  # noqa: BLE001
            report.openscad_stderr += f"\nFailed to load generated STL: {e}"
            return report

        # Step 3: Find the source full-assembly mesh
        source_mesh = self._find_source_mesh()
        if source_mesh is None:
            report.openscad_stderr += "\nNo source full-assembly mesh found for comparison."
            return report

        # Step 4: Compare metrics
        self._compare_metrics(report, source_mesh, gen_mesh)
        report.success = True
        return report

    def _render_to_stl(self, report: ValidationReport) -> Optional[Path]:
        """Call OpenSCAD CLI to render the .scad to a temporary STL."""
        tmp_stl = Path(tempfile.mktemp(suffix=".stl"))
        cmd = [
            self.openscad_exe,
            "-o", str(tmp_stl),
            str(self.scad_path),
        ]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            report.openscad_stderr = result.stderr
            if result.returncode != 0:
                report.openscad_stderr += f"\nOpenSCAD exit code: {result.returncode}"
                return None
            if not tmp_stl.exists():
                report.openscad_stderr += "\nOpenSCAD did not produce an STL file."
                return None
            return tmp_stl
        except FileNotFoundError:
            report.openscad_stderr = (
                f"OpenSCAD executable not found: '{self.openscad_exe}'. "
                "Install OpenSCAD and ensure it is on PATH, or use --openscad."
            )
            return None
        except subprocess.TimeoutExpired:
            report.openscad_stderr = "OpenSCAD render timed out (120s)."
            return None

    def _find_source_mesh(self) -> Optional[object]:
        """Load the full-assembly source mesh for comparison."""
        try:
            import trimesh
            from forge_cad.analyzer.loader import LoadedMesh

            source_dir = Path(self.form.source_dir)
            for file_entry in self.form.files:
                if file_entry.role in {"full_assembly", "base_solid"}:
                    path = source_dir / file_entry.path
                    if path.exists():
                        return trimesh.load(str(path), force="mesh")

            # Fallback: load any .obj or .stl in the source dir
            for ext in ("*.obj", "*.stl"):
                candidates = sorted(source_dir.rglob(ext))
                if candidates:
                    return trimesh.load(str(candidates[0]), force="mesh")
        except Exception:  # noqa: BLE001
            pass
        return None

    @staticmethod
    def _compare_metrics(
        report: ValidationReport,
        source: object,
        generated: object,
    ) -> None:
        """Compute volume, area, and bbox metrics."""
        metrics = [
            ("Volume (mm³)", getattr(source, "volume", 0.0), getattr(generated, "volume", 0.0)),
            ("Surface area (mm²)", getattr(source, "area", 0.0), getattr(generated, "area", 0.0)),
        ]

        # Bounding box extents
        src_bounds = getattr(source, "bounds", None)
        gen_bounds = getattr(generated, "bounds", None)
        if src_bounds is not None and gen_bounds is not None:
            for axis, label in enumerate(["X extent", "Y extent", "Z extent"]):
                src_ext = src_bounds[1][axis] - src_bounds[0][axis]
                gen_ext = gen_bounds[1][axis] - gen_bounds[0][axis]
                metrics.append((label, src_ext, gen_ext))

        for metric, src_val, gen_val in metrics:
            if src_val == 0:
                deviation = 0.0
            else:
                deviation = 100.0 * abs(gen_val - src_val) / abs(src_val)
            report.rows.append(
                ValidationRow(
                    metric=metric,
                    source_value=float(src_val),
                    generated_value=float(gen_val),
                    deviation=round(deviation, 2),
                )
            )
