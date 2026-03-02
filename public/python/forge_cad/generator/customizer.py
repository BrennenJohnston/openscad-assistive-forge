"""Customizer annotation generator.

Produces OpenSCAD Customizer-compatible parameter declarations following the
format parsed by openscad-assistive-forge's parameter parser.

Format:
    /* [Section Name] */
    param_name = value;       // description
    param_name = value;       // [min:max:step] description
    param_name = value;       // ["opt1", "opt2"] description
"""

from __future__ import annotations

from forge_cad.forms.project_form import ParameterSpec


class CustomizerAnnotator:
    """Generates Customizer-compatible parameter declarations."""

    def __init__(self, eps: float = 0.01) -> None:
        self.eps = eps

    def section_header(self, section_name: str) -> str:
        return f"\n/* [{section_name}] */\n"

    def parameter_line(self, spec: ParameterSpec) -> str:
        """Emit one parameter declaration with inline annotation."""
        value_str = self._format_value(spec.value, spec.param_type)
        annotation = self._format_annotation(spec)
        line = f"{spec.name} = {value_str};"
        if annotation or spec.description:
            if annotation:
                comment = f" // {annotation}{spec.description}"
            else:
                comment = f" // {spec.description}"
            line += comment
        return line

    def eps_declaration(self) -> str:
        return f"\neps = {self.eps}; // Boolean subtraction clearance (do not change)\n"

    def render_mode_enum(self, modes: list[str]) -> str:
        """Emit a render_mode dropdown parameter."""
        options_str = ", ".join(f'"{m}"' for m in modes)
        return f'render_mode = "{modes[0]}"; // [{options_str}] Which geometry to show'

    @staticmethod
    def _format_value(value: object, param_type: str) -> str:
        if param_type == "boolean":
            return "true" if value else "false"
        if param_type == "string":
            return f'"{value}"'
        if param_type == "dropdown" and isinstance(value, str):
            return f'"{value}"'
        if isinstance(value, float):
            if value == int(value):
                return str(int(value))
            return str(round(value, 4))
        return str(value)

    @staticmethod
    def _format_annotation(spec: ParameterSpec) -> str:
        # Locked parameters are emitted as plain variables without Customizer annotations
        if getattr(spec, "locked", False):
            return ""
        if spec.param_type == "number" and spec.min_val is not None and spec.max_val is not None:
            if spec.step is not None:
                return f"[{spec.min_val}:{spec.step}:{spec.max_val}] "
            return f"[{spec.min_val}:{spec.max_val}] "
        if spec.param_type == "dropdown" and spec.options:
            opts = ", ".join(f'"{o}"' for o in spec.options)
            return f"[{opts}] "
        return ""
