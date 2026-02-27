"""OpenSCAD code emitter.

Generates parametric .scad files from a confirmed ProjectForm using an
archetype-aware strategy pattern.

Shared sections (header, render mode, params, features) are emitted here.
Geometry sections (2D modules, 3D modules, assembly) delegate to the
archetype strategy returned by ``get_strategy(form.archetype)``.

Available archetypes: flat_plate, rotational, shell, box_enclosure,
assembly, organic.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np

from forge_cad.forms.project_form import (
    ComponentEntry,
    FeatureEntry,
    ParameterSpec,
    ProjectForm,
)
from forge_cad.generator.customizer import CustomizerAnnotator
from forge_cad.generator.module_builder import ModuleBuilder
from forge_cad.generator.strategies import get_strategy
from forge_cad.generator.templates.scad_header import render_header


class ScadEmitter:
    """Emits a complete parametric .scad file from a ProjectForm."""

    RENDER_MODES = ["assembly", "body_only", "exploded"]

    def __init__(self, form: ProjectForm) -> None:
        self.form = form
        self.annotator = CustomizerAnnotator(eps=form.eps)
        self.builder = ModuleBuilder(eps=form.eps)
        self.strategy = get_strategy(getattr(form, "archetype", "flat_plate"))

    def emit(self) -> str:
        """Build and return the complete .scad file as a string."""
        # Pre-populate component vertex cache so strategies can access it
        for comp in self.form.components:
            if not comp.name.startswith("_deleted_"):
                comp._cached_vertices = self._get_component_vertices(comp)  # type: ignore[attr-defined]
                comp._bbox = comp.bounding_box if hasattr(comp, "bounding_box") else None  # type: ignore[attr-defined]

        sections: list[str] = []

        sections.append(render_header(self.form.name, self.form.source_dir))
        sections.append(self._emit_render_mode_section())
        sections.append(self._emit_global_params_section())
        sections.append(self._emit_component_param_sections())
        sections.append(self._emit_feature_param_sections())
        sections.append(self._emit_derived_values())
        # Geometry sections delegate to the archetype strategy
        sections.append(self.strategy.emit_2d_modules(self.form, self.builder, _safe_name))
        sections.append(self.strategy.emit_3d_modules(self.form, self.builder, _safe_name))
        sections.append(self._emit_feature_modules())
        sections.append(self.strategy.emit_assembly(self.form, self.builder, _safe_name))
        sections.append(self._emit_render_dispatcher())

        return "\n".join(s for s in sections if s)

    def _emit_render_mode_section(self) -> str:
        lines = [self.annotator.section_header("Render Mode")]
        lines.append(self.annotator.render_mode_enum(self.RENDER_MODES))
        return "\n".join(lines)

    def _emit_global_params_section(self) -> str:
        lines = [self.annotator.section_header("Global Parameters")]
        lines.append(self.annotator.eps_declaration())

        # Emit any global params from the form
        by_section: dict[str, list[ParameterSpec]] = {}
        for p in self.form.global_params:
            by_section.setdefault(p.section, []).append(p)

        for section, params in by_section.items():
            if section != "Global Parameters":
                lines.append(self.annotator.section_header(section))
            for p in params:
                lines.append(self.annotator.parameter_line(p))

        # Auto-generate body dimension params from the body component
        body = self._get_body_component()
        if body and not any(p.name == "body_thickness" for p in self.form.global_params):
            thickness = round(body.z_max - body.z_min, 3)
            lines.append(
                f"\nbody_thickness = {thickness}; "
                f"// [1:0.5:30] Total body thickness (Z height mm)"
            )

        return "\n".join(lines)

    def _emit_component_param_sections(self) -> str:
        parts: list[str] = []
        for comp in self.form.components:
            if comp.role in {"variant", "unknown"} or comp.name.startswith("_deleted_"):
                continue
            section = self.annotator.section_header(
                f"{comp.human_name or comp.name} — {comp.role}"
            )
            thickness = round(comp.z_max - comp.z_min, 3)
            param_name = f"{_safe_name(comp.name)}_thickness"
            line = (
                f"{param_name} = {thickness}; "
                f"// [0.5:0.5:{round(comp.z_max + 5, 1)}] "
                f"Thickness of {comp.human_name or comp.name} (mm)"
            )
            parts.append(section + line)
        return "\n".join(parts)

    def _emit_feature_param_sections(self) -> str:
        parts: list[str] = []
        confirmed = [
            f for f in self.form.features
            if f.confirmed and not f.name.startswith("_deleted_")
        ]
        if not confirmed:
            return ""

        parts.append(self.annotator.section_header("Feature Toggles"))
        for feat in confirmed:
            toggle = feat.toggle_name or f"enable_{_safe_name(feat.name)}"
            enabled = "true" if feat.enabled_by_default else "false"
            parts.append(f"{toggle} = {enabled}; // Enable {feat.human_name or feat.name}")

        # Per-feature parameter sections
        for feat in confirmed:
            if not feat.parameter_specs:
                # Auto-generate from detected params
                auto_specs = self._auto_param_specs(feat)
                if auto_specs:
                    parts.append(
                        self.annotator.section_header(feat.human_name or feat.name)
                    )
                    for spec in auto_specs:
                        parts.append(self.annotator.parameter_line(spec))
            else:
                parts.append(
                    self.annotator.section_header(feat.human_name or feat.name)
                )
                for spec in feat.parameter_specs:
                    parts.append(self.annotator.parameter_line(spec))

        return "\n".join(parts)

    def _emit_derived_values(self) -> str:
        lines = ["\n// ── Derived values (computed from parameters above) ──\n"]

        body = self._get_body_component()
        if body:
            lines.append(
                "// body_z_min and body_z_max are computed from body_thickness:\n"
                "body_z_min = 0;\n"
                "body_z_max = body_thickness;\n"
            )

        for comp in self.form.components:
            if comp.role == "pocket_fill":
                safe = _safe_name(comp.name)
                lines.append(
                    f"// {comp.name} Z-range (pocket fills from bottom):\n"
                    f"{safe}_z_min = 0;\n"
                    f"{safe}_z_max = {safe}_thickness;\n"
                )

        return "\n".join(lines)


    def _emit_feature_modules(self) -> str:
        parts = ["\n// ════════════════════════════════════════════════════\n"
                 "// FEATURE MODULES\n"
                 "// ════════════════════════════════════════════════════\n"]

        body = self._get_body_component()
        body_z_min = body.z_min if body else 0.0
        body_z_max = body.z_max if body else 8.0

        confirmed = [
            f for f in self.form.features
            if f.confirmed and not f.name.startswith("_deleted_")
        ]

        for feat in confirmed:
            safe = _safe_name(feat.name)
            module_str = self._emit_one_feature_module(feat, safe, body_z_min, body_z_max)
            if module_str:
                parts.append(module_str)

        return "\n".join(parts)

    def _emit_one_feature_module(
        self,
        feat: FeatureEntry,
        safe_name: str,
        body_z_min: float,
        body_z_max: float,
    ) -> str:
        p = feat.params
        ftype = feat.feature_type

        if ftype == "circular_hole":
            cx = p.get("center_x", 0.0)
            cy = p.get("center_y", 0.0)
            r_param = f"{safe_name}_diameter / 2"
            return (
                f"module {safe_name}_3d() {{\n"
                f"    translate([{cx}, {cy}, -eps])\n"
                f"    cylinder(h=body_thickness + 2*eps, r={r_param}, $fn=64);\n"
                f"}}\n"
            )

        if ftype == "rectangular_slot":
            x_min = p.get("x_min", -5.0)
            x_max = p.get("x_max", 5.0)
            y_min = p.get("y_min", -5.0)
            y_max = p.get("y_max", 5.0)
            cx = (x_min + x_max) / 2
            cy = (y_min + y_max) / 2
            return (
                f"module {safe_name}_3d() {{\n"
                f"    translate([{cx}, {cy}, -eps])\n"
                f"    cube([{safe_name}_width + 2*eps, {safe_name}_height + 2*eps, "
                f"body_thickness + 2*eps], center=true);\n"
                f"}}\n"
            )

        if ftype == "polygon":
            vertices = p.get("vertices", [])
            if vertices:
                return self.builder.polygon_feature_module(
                    safe_name, vertices, body_z_min, body_z_max
                )

        if ftype == "notch":
            x_min = p.get("x_min", -5.0)
            y_min = p.get("y_min", -5.0)
            return (
                f"module {safe_name}_3d() {{\n"
                f"    // Notch: open-ended rectangular cutout along one edge\n"
                f"    translate([{x_min}, {y_min}, -eps])\n"
                f"    cube([{safe_name}_width + 2*eps, {safe_name}_depth + 2*eps, "
                f"body_thickness + 2*eps]);\n"
                f"}}\n"
            )

        if ftype == "t_slot":
            cx = p.get("center_x", 0.0)
            cy = p.get("center_y", 0.0)
            return (
                f"module {safe_name}_3d() {{\n"
                f"    // T-slot: narrow slot + wider head cavity\n"
                f"    translate([{cx}, {cy}, -eps]) {{\n"
                f"        // Narrow slot\n"
                f"        cube([{safe_name}_slot_width, {safe_name}_slot_depth, "
                f"body_thickness + 2*eps], center=true);\n"
                f"        // Head cavity\n"
                f"        translate([0, 0, body_thickness/2])\n"
                f"        cube([{safe_name}_head_width, {safe_name}_head_depth, "
                f"body_thickness/2 + eps], center=true);\n"
                f"    }}\n"
                f"}}\n"
            )

        return f"// TODO: implement {safe_name}_3d() for feature type '{ftype}'\n"


    def _emit_render_dispatcher(self) -> str:
        assembly_name = _safe_name(self.form.name)
        body = self._get_body_component()
        body_name = _safe_name(body.name) if body else assembly_name

        return (
            f"\n// ── Render dispatcher ──\n"
            f"if (render_mode == \"assembly\") {{\n"
            f"    {assembly_name}();\n"
            f"}} else if (render_mode == \"body_only\") {{\n"
            f"    {body_name}_3d();\n"
            f"}} else if (render_mode == \"exploded\") {{\n"
            f"    // Exploded view: offset each layer by 5mm for inspection\n"
        ) + self._emit_exploded_view() + "}\n"

    def _emit_exploded_view(self) -> str:
        lines: list[str] = []
        body = self._get_body_component()
        pocket_fills = [c for c in self.form.components if c.role == "pocket_fill"]

        if body:
            lines.append(f"    {_safe_name(body.name)}_3d();")
        for i, pf in enumerate(pocket_fills):
            offset = (i + 1) * 5
            lines.append(
                f"    translate([0, 0, {offset}])\n"
                f"        {_safe_name(pf.name)}_3d();"
            )
        return "\n".join(lines) + "\n"

    def _auto_param_specs(self, feat: FeatureEntry) -> list[ParameterSpec]:
        """Auto-generate ParameterSpec objects from detected feature params."""
        specs: list[ParameterSpec] = []
        safe = _safe_name(feat.name)
        p = feat.params
        ftype = feat.feature_type

        if ftype == "circular_hole":
            diameter = p.get("diameter", 10.0)
            specs.append(ParameterSpec(
                name=f"{safe}_diameter",
                value=round(diameter, 2),
                param_type="number",
                min_val=1.0,
                max_val=round(diameter * 2, 1),
                step=0.5,
                description=f"Diameter of {feat.human_name or feat.name}",
                section=feat.human_name or feat.name,
            ))

        elif ftype == "rectangular_slot":
            w = p.get("width", 10.0)
            h = p.get("height", 10.0)
            specs.append(ParameterSpec(
                name=f"{safe}_width",
                value=round(w, 2),
                param_type="number",
                min_val=1.0,
                max_val=round(w * 2, 1),
                step=0.5,
                description=f"Width of {feat.human_name or feat.name}",
                section=feat.human_name or feat.name,
            ))
            specs.append(ParameterSpec(
                name=f"{safe}_height",
                value=round(h, 2),
                param_type="number",
                min_val=1.0,
                max_val=round(h * 2, 1),
                step=0.5,
                description=f"Height of {feat.human_name or feat.name}",
                section=feat.human_name or feat.name,
            ))

        return specs

    def _get_body_component(self) -> Optional[ComponentEntry]:
        for c in self.form.components:
            if c.role == "base_solid":
                return c
        return None

    def _get_component_vertices(
        self, comp: ComponentEntry
    ) -> Optional[list[list[float]]]:
        """Extract 2D vertices for a component from its source mesh."""
        try:
            import trimesh


            source_path = Path(comp.source_file)
            if not source_path.exists():
                return self._fallback_vertices(comp)

            # Try to get a cross-section at mid-height
            mesh = trimesh.load(str(source_path), force="mesh")
            if not hasattr(mesh, "section"):
                return self._fallback_vertices(comp)

            z_mid = (comp.z_min + comp.z_max) / 2
            section = mesh.section(
                plane_origin=[0, 0, z_mid],
                plane_normal=[0, 0, 1],
            )
            if section is None:
                return self._fallback_vertices(comp)

            paths_2d, _ = section.to_planar()
            if paths_2d is None:
                return self._fallback_vertices(comp)

            # Pick the largest path by area
            largest = max(paths_2d.discrete(), key=lambda p: len(p), default=None)
            if largest is None:
                return self._fallback_vertices(comp)

            # Simplify
            simplified = _simplify_path(largest, tolerance=0.3)
            return [[round(float(x), 3), round(float(y), 3)] for x, y in simplified]

        except Exception:  # noqa: BLE001
            return self._fallback_vertices(comp)

    @staticmethod
    def _fallback_vertices(comp: ComponentEntry) -> list[list[float]]:
        """Return a rectangular bounding-box as fallback vertices."""
        return [[-10.0, 0.0], [10.0, 0.0], [10.0, 20.0], [-10.0, 20.0]]


def _safe_name(name: str) -> str:
    """Convert a display name to a valid OpenSCAD identifier."""
    import re
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip())
    safe = re.sub(r"_+", "_", safe).strip("_").lower()
    if not safe:
        return "component"
    if safe[0].isdigit():
        safe = "c_" + safe
    return safe


def _simplify_path(path: np.ndarray, tolerance: float = 0.3) -> np.ndarray:
    """Simplify a polygon path using Shapely if available, else stride sample."""
    try:
        from shapely.geometry import Polygon
        poly = Polygon(path)
        simplified = poly.simplify(tolerance, preserve_topology=True)
        coords = np.array(simplified.exterior.coords)[:-1]
        return coords
    except Exception:  # noqa: BLE001
        stride = max(1, len(path) // 32)
        return path[::stride]
