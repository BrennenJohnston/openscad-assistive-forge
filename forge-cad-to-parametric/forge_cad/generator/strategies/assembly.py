"""Assembly strategy — multi-body with relative translate() positioning."""

from __future__ import annotations

from forge_cad.generator.strategies.base import EmitterStrategy


class AssemblyStrategy(EmitterStrategy):
    """Generates multi-body assembly with translate() for each body."""

    def emit_2d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 2D PROFILE MODULES (assembly)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            vertices = getattr(comp, "_cached_vertices", None) or []
            if vertices:
                safe = safe_name_fn(comp.name)
                parts.append(builder.body_2d_module(safe, vertices))
        return "\n".join(parts)

    def emit_3d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 3D MODULES (assembly — each body independently)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            vertices = getattr(comp, "_cached_vertices", None) or []
            if vertices:
                thickness = round(comp.z_max - comp.z_min, 3)
                parts.append(
                    f"module {safe}_3d() {{\n"
                    f"    linear_extrude(height={thickness})\n"
                    f"        {safe}_2d();\n"
                    f"}}\n"
                )
        return "\n".join(parts)

    def emit_assembly(self, form, builder, safe_name_fn) -> str:
        active = [
            c for c in form.components
            if c.role not in {"variant"} and not c.name.startswith("_deleted_")
        ]
        asm_name = safe_name_fn(form.name)
        lines = [
            "\n// ════════════════════════════════════════════════════\n"
            "// ASSEMBLY (multi-body)\n"
            "// ════════════════════════════════════════════════════\n"
            f"module {asm_name}() {{\n"
        ]
        for comp in active:
            safe = safe_name_fn(comp.name)
            z_offset = round(comp.z_min, 3)
            lines.append(
                f"    translate([0, 0, {z_offset}])\n"
                f"        {safe}_3d();"
            )
        lines.append("}\n")
        return "\n".join(lines)
