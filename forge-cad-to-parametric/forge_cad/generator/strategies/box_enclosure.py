"""Box-enclosure strategy — parametric cube + difference for box/enclosure parts."""

from __future__ import annotations

from forge_cad.generator.strategies.base import EmitterStrategy


class BoxEnclosureStrategy(EmitterStrategy):
    """Generates parametric cube-based enclosure modules."""

    def emit_2d_modules(self, form, builder, safe_name_fn) -> str:
        return (
            "\n// ════════════════════════════════════════════════════\n"
            "// 2D PROFILE MODULES (box enclosure — N/A, using cube primitives)\n"
            "// ════════════════════════════════════════════════════\n"
        )

    def emit_3d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 3D MODULES (box enclosure)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            parts.append(
                f"module {safe}_3d() {{\n"
                f"    difference() {{\n"
                f"        // Outer box\n"
                f"        cube([box_width, box_depth, box_height], center=true);\n"
                f"        // Inner cavity\n"
                f"        translate([0, 0, wall_thickness / 2])\n"
                f"        cube([\n"
                f"            box_width  - 2 * wall_thickness,\n"
                f"            box_depth  - 2 * wall_thickness,\n"
                f"            box_height - wall_thickness + eps\n"
                f"        ], center=true);\n"
                f"    }}\n"
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
        asm_name = safe_name_fn(form.name)
        body_calls = "\n".join(f"        {safe_name_fn(c.name)}_3d();" for c in active)
        feat_calls = "\n".join(
            f"        if ({f.toggle_name or ('enable_' + safe_name_fn(f.name))})\n"
            f"            {safe_name_fn(f.name)}_3d();"
            for f in active_features
        )
        return (
            "\n// ════════════════════════════════════════════════════\n"
            "// ASSEMBLY (box enclosure)\n"
            "// ════════════════════════════════════════════════════\n"
            f"module {asm_name}() {{\n"
            f"    difference() {{\n"
            f"        union() {{\n"
            f"{body_calls}\n"
            f"        }}\n"
            f"{feat_calls}\n"
            f"    }}\n"
            f"}}\n"
        )
