"""Flat-plate strategy — the original linear_extrude + pocket-and-fill architecture."""

from __future__ import annotations

from forge_cad.generator.strategies.base import EmitterStrategy


class FlatPlateStrategy(EmitterStrategy):
    """2D-first, pocket-and-fill architecture for flat/panel parts."""

    def emit_2d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 2D PROFILE MODULES\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            vertices = _get_vertices(comp)
            if vertices:
                parts.append(builder.body_2d_module(safe_name_fn(comp.name), vertices))
                if comp.role == "pocket_fill":
                    parts.append(builder.pocket_2d_module(safe_name_fn(comp.name), vertices))
        return "\n".join(parts)

    def emit_3d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 3D EXTRUSION MODULES\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            z_max_expr = f"{safe}_thickness" if comp.role == "pocket_fill" else "body_thickness"
            vertices = _get_vertices(comp)
            if vertices:
                parts.append(
                    f"module {safe}_3d() {{\n"
                    f"    linear_extrude(height={z_max_expr})\n"
                    f"        {safe}_2d();\n"
                    f"}}\n"
                )
                if comp.role == "pocket_fill":
                    parts.append(
                        f"module {safe}_pocket_3d() {{\n"
                        f"    translate([0, 0, -eps])\n"
                        f"    linear_extrude(height=body_thickness + 2*eps)\n"
                        f"        {safe}_pocket_2d();\n"
                        f"}}\n"
                    )
        return "\n".join(parts)

    def emit_assembly(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// ASSEMBLY\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        active_components = [
            c for c in form.components
            if c.role not in {"variant"} and not c.name.startswith("_deleted_")
        ]
        active_features = [
            f for f in form.features
            if f.confirmed and not f.name.startswith("_deleted_")
        ]
        parts.append(builder.assembly_module(
            safe_name_fn(form.name), active_components, active_features
        ))
        return "\n".join(parts)


def _get_vertices(comp) -> list:
    """Extract vertices stored on the component (set by ScadEmitter before calling strategy)."""
    return getattr(comp, "_cached_vertices", None) or []
