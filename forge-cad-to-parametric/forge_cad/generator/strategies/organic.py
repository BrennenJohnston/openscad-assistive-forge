"""Organic strategy — hull/minkowski approximation for complex, free-form shapes."""

from __future__ import annotations

from forge_cad.generator.strategies.base import EmitterStrategy


class OrganicStrategy(EmitterStrategy):
    """Generates hull()-based approximation modules for organic shapes."""

    def emit_2d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 2D PROFILE MODULES (organic — convex hull approximation)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            vertices = getattr(comp, "_cached_vertices", None) or []
            if vertices:
                # Emit hull of sampled key points
                pts_str = ", ".join(
                    f"[{round(float(v[0]), 3)}, {round(float(v[1]), 3)}]"
                    for v in vertices[::max(1, len(vertices) // 16)]
                )
                parts.append(
                    f"module {safe}_2d() {{\n"
                    f"    hull() {{\n"
                    f"        for (p = [{pts_str}])\n"
                    f"            translate(p) circle(r=0.1, $fn=6);\n"
                    f"    }}\n"
                    f"}}\n"
                )
        return "\n".join(parts)

    def emit_3d_modules(self, form, builder, safe_name_fn) -> str:
        parts = [
            "\n// ════════════════════════════════════════════════════\n"
            "// 3D MODULES (organic — linear_extrude of hull profile)\n"
            "// ════════════════════════════════════════════════════\n"
        ]
        for comp in form.components:
            if comp.role in {"variant"} or comp.name.startswith("_deleted_"):
                continue
            safe = safe_name_fn(comp.name)
            vertices = getattr(comp, "_cached_vertices", None) or []
            if vertices:
                parts.append(
                    f"module {safe}_3d() {{\n"
                    f"    linear_extrude(height=body_thickness, scale=taper_scale)\n"
                    f"        {safe}_2d();\n"
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
            "// ASSEMBLY (organic)\n"
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
