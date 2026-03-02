"""Rotational strategy — rotate_extrude based generation for cylindrical parts."""

from __future__ import annotations

from forge_cad.generator.strategies.base import EmitterStrategy


class RotationalStrategy(EmitterStrategy):
    """Generates rotate_extrude modules for rotationally symmetric parts."""

    def emit_2d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 2D PROFILE MODULES (rotational — half-profile)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            bb = getattr(comp, "_bbox", None)
            r = round((bb[1][0] - bb[0][0]) / 2, 3) if bb else 10.0
            h = round(getattr(comp, "z_max", 10.0) - getattr(comp, "z_min", 0.0), 3)
            wall = round(r * 0.15, 2)
            parts.append(
                f"module {safe}_profile_2d() {{\n"
                f"    // Half-profile for rotate_extrude\n"
                f"    translate([wall_thickness / 2, 0, 0])\n"
                f"    square([{safe}_radius - wall_thickness / 2, {safe}_height]);\n"
                f"}}\n"
            )
        return "\n".join(parts)

    def emit_3d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 3D MODULES (rotate_extrude)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            parts.append(
                f"module {safe}_3d() {{\n"
                f"    rotate_extrude(angle=360, $fn=64)\n"
                f"        {safe}_profile_2d();\n"
                f"}}\n"
            )
        return "\n".join(parts)

    def emit_assembly(self, form, builder, safe_name_fn) -> str:
        active = [
            c for c in form.components
            if c.role not in {"variant"} and not c.name.startswith("_deleted_")
        ]
        active_features = [
            f for f in form.features
            if f.confirmed and not f.name.startswith("_deleted_")
        ]
        lines = [
            "\n// ════════════════════════════════════════════════════\n"
            "// ASSEMBLY (rotational)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        asm_name = safe_name_fn(form.name)
        body_calls = "\n".join(
            f"        {safe_name_fn(c.name)}_3d();" for c in active
        )
        feat_calls = "\n".join(
            f"        if ({f.toggle_name or ('enable_' + safe_name_fn(f.name))})\n"
            f"            {safe_name_fn(f.name)}_3d();"
            for f in active_features
        )
        lines.append(
            f"module {asm_name}() {{\n"
            f"    difference() {{\n"
            f"        union() {{\n"
            f"{body_calls}\n"
            f"        }}\n"
            f"{feat_calls}\n"
            f"    }}\n"
            f"}}\n"
        )
        return "\n".join(lines)
