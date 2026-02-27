"""2D/3D module hierarchy builder.

Generates the OpenSCAD module bodies for each classified component and feature,
following the 2D-first architecture from the Plug Puller v4 reference:
  - All geometry is defined as 2D profiles via polygon()
  - 3D modules extrude via linear_extrude()
  - Pocket-fill pairs use _pocket_2d() variants expanded by eps
"""

from __future__ import annotations

import re

from forge_cad.forms.project_form import ComponentEntry, FeatureEntry


class ModuleBuilder:
    """Builds OpenSCAD module strings for components and features."""

    def __init__(self, eps: float = 0.01) -> None:
        self.eps = eps

    def body_2d_module(self, name: str, vertices: list[list[float]]) -> str:
        """Emit a 2D polygon module for a body outline."""
        pts = self._format_points(vertices)
        return (
            f"module {name}_2d() {{\n"
            f"    polygon(points={pts});\n"
            f"}}\n"
        )

    def pocket_2d_module(self, name: str, vertices: list[list[float]]) -> str:
        """Emit an eps-expanded pocket cutter 2D module."""
        pts = self._format_points(vertices)
        return (
            f"module {name}_pocket_2d() {{\n"
            f"    offset(delta=eps)\n"
            f"        polygon(points={pts});\n"
            f"}}\n"
        )

    def body_3d_module(self, name: str, z_min: float, z_max: float) -> str:
        """Emit a 3D module that extrudes a 2D module."""
        thickness = z_max - z_min
        translate = f"translate([0, 0, {z_min}])" if z_min != 0.0 else ""
        body = f"    linear_extrude(height={thickness})\n        {name}_2d();"
        if translate:
            body = f"    {translate}\n    {body}"
        return (
            f"module {name}_3d() {{\n"
            f"{body}\n"
            f"}}\n"
        )

    def pocket_3d_module(self, name: str, body_z_min: float, body_z_max: float) -> str:
        """Emit a full-body-height pocket cutter 3D module."""
        thickness = body_z_max - body_z_min
        eps = self.eps
        if body_z_min != 0.0:
            translate = f"translate([0, 0, {body_z_min - eps}])"
        else:
            translate = f"translate([0, 0, {-eps}])"
        return (
            f"module {name}_pocket_3d() {{\n"
            f"    {translate}\n"
            f"    linear_extrude(height={thickness + 2 * eps})\n"
            f"        {name}_pocket_2d();\n"
            f"}}\n"
        )

    def circular_hole_module(
        self,
        name: str,
        diameter: float,
        z_min: float,
        z_max: float,
        chamfer: float = 0.0,
    ) -> str:
        """Emit a circular hole module (with optional chamfer)."""
        eps = self.eps
        thickness = z_max - z_min + 2 * eps
        translate_z = z_min - eps
        r = diameter / 2.0
        lines = [
            f"module {name}_3d() {{",
            f"    translate([0, 0, {translate_z}])",
            f"    cylinder(h={thickness}, r={r}, $fn=64);",
        ]
        if chamfer > 0:
            lines[-1] = lines[-1].rstrip(";")
            lines.append("    // chamfer top")
            lines.append(
                f"    translate([0, 0, {z_max - chamfer}])\n"
                f"    cylinder(h={chamfer + eps}, r1={r}, r2={r + chamfer}, $fn=64);"
            )
            lines.append("    // chamfer bottom")
            lines.append(
                f"    translate([0, 0, {z_min - eps}])\n"
                f"    cylinder(h={chamfer + eps}, r1={r + chamfer}, r2={r}, $fn=64);"
            )
        lines.append("}\n")
        return "\n".join(lines)

    def rectangular_slot_module(
        self,
        name: str,
        width: float,
        height: float,
        z_min: float,
        z_max: float,
        center: bool = True,
    ) -> str:
        """Emit a rectangular slot module."""
        eps = self.eps
        thickness = z_max - z_min + 2 * eps
        translate_z = z_min - eps
        center_str = "true" if center else "false"
        return (
            f"module {name}_3d() {{\n"
            f"    translate([0, 0, {translate_z}])\n"
            f"    cube([{width + 2 * eps}, {height + 2 * eps}, "
            f"{thickness}], center={center_str});\n"
            f"}}\n"
        )

    def polygon_feature_module(
        self,
        name: str,
        vertices: list[list[float]],
        z_min: float,
        z_max: float,
    ) -> str:
        """Emit a generic polygon feature module."""
        eps = self.eps
        thickness = z_max - z_min + 2 * eps
        pts = self._format_points(vertices)
        return (
            f"module {name}_2d() {{\n"
            f"    polygon(points={pts});\n"
            f"}}\n\n"
            f"module {name}_3d() {{\n"
            f"    translate([0, 0, {z_min - eps}])\n"
            f"    linear_extrude(height={thickness})\n"
            f"        {name}_2d();\n"
            f"}}\n"
        )

    def assembly_module(
        self,
        name: str,
        components: list[ComponentEntry],
        features: list[FeatureEntry],
    ) -> str:
        """Emit the final assembly module combining all components with boolean ops."""
        lines = [f"module {name}() {{"]

        base_solids = [c for c in components if c.role == "base_solid"]
        pocket_fills = [c for c in components if c.role == "pocket_fill"]
        additive = [c for c in components if c.role == "additive"]
        subtractives = [c for c in components if c.role == "subtractive"]
        confirmed_features = [
            f for f in features if f.confirmed and not f.name.startswith("_deleted_")
        ]

        if not base_solids:
            lines.append("    // No base solid found; assembly is empty")
            lines.append("}\n")
            return "\n".join(lines)

        indent = "    "

        if confirmed_features or subtractives or pocket_fills:
            lines.append(f"{indent}difference() {{")
            inner_indent = indent * 2

            if pocket_fills or additive:
                lines.append(f"{inner_indent}union() {{")
                deep_indent = indent * 3

                if pocket_fills:
                    lines.append(f"{deep_indent}difference() {{")
                    for bs in base_solids:
                        lines.append(f"{deep_indent}    {_safe_name(bs.name)}_3d();")
                    for pf in pocket_fills:
                        lines.append(f"{deep_indent}    {_safe_name(pf.name)}_pocket_3d();")
                    lines.append(f"{deep_indent}}}")
                else:
                    for bs in base_solids:
                        lines.append(f"{deep_indent}{_safe_name(bs.name)}_3d();")

                for pf in pocket_fills:
                    lines.append(f"{deep_indent}{_safe_name(pf.name)}_3d();")

                for ad in additive:
                    lines.append(f"{deep_indent}{_safe_name(ad.name)}_3d();")

                lines.append(f"{inner_indent}}}")
            else:
                for bs in base_solids:
                    lines.append(f"{inner_indent}{_safe_name(bs.name)}_3d();")

            for feat in confirmed_features:
                toggle = feat.toggle_name or f"enable_{_safe_name(feat.name)}"
                lines.append(f"{inner_indent}if ({toggle})")
                lines.append(f"{inner_indent}    {_safe_name(feat.name)}_3d();")

            for sub in subtractives:
                lines.append(f"{inner_indent}{_safe_name(sub.name)}_3d();")

            lines.append(f"{indent}}}")
        else:
            for bs in base_solids:
                lines.append(f"{indent}{_safe_name(bs.name)}_3d();")

        lines.append("}\n")
        return "\n".join(lines)

    @staticmethod
    def _format_points(vertices: list[list[float]]) -> str:
        pts = ", ".join(f"[{v[0]}, {v[1]}]" for v in vertices)
        return f"[{pts}]"


def _safe_name(name: str) -> str:
    """Convert a display name to a valid OpenSCAD identifier."""
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip())
    safe = re.sub(r"_+", "_", safe).strip("_").lower()
    if not safe:
        return "component"
    if safe[0].isdigit():
        safe = "c_" + safe
    return safe
