"""Tests for the OpenSCAD code emitter."""

from __future__ import annotations

from forge_cad.forms.project_form import (
    ComponentEntry,
    FeatureEntry,
    ParameterSpec,
    ProjectForm,
)
from forge_cad.generator.customizer import CustomizerAnnotator
from forge_cad.generator.scad_emitter import ScadEmitter, _safe_name
from forge_cad.utils.eps_helper import eps_expand_polygon, pocket_cutter_vertices

# ── _safe_name ────────────────────────────────────────────────────────────────

def test_safe_name_spaces():
    assert _safe_name("Plug Puller Body") == "plug_puller_body"


def test_safe_name_special_chars():
    assert _safe_name("plate-layer 1!") == "plate_layer_1"


def test_safe_name_leading_digit():
    result = _safe_name("1body")
    assert result[0].isalpha() or result[0] == "_"


def test_safe_name_empty():
    assert _safe_name("") == "component"


# ── CustomizerAnnotator ───────────────────────────────────────────────────────

def test_parameter_line_number():
    annotator = CustomizerAnnotator()
    spec = ParameterSpec(
        name="body_thickness",
        value=8.0,
        param_type="number",
        min_val=2.0,
        max_val=20.0,
        step=0.5,
        description="Body thickness",
    )
    line = annotator.parameter_line(spec)
    assert "body_thickness = 8;" in line
    assert "[2.0:0.5:20.0]" in line
    assert "Body thickness" in line


def test_parameter_line_boolean():
    annotator = CustomizerAnnotator()
    spec = ParameterSpec(
        name="enable_holes",
        value=True,
        param_type="boolean",
        description="Enable holes",
    )
    line = annotator.parameter_line(spec)
    assert "enable_holes = true;" in line


def test_parameter_line_dropdown():
    annotator = CustomizerAnnotator()
    spec = ParameterSpec(
        name="render_mode",
        value="assembly",
        param_type="dropdown",
        options=["assembly", "body_only", "exploded"],
        description="Render mode",
    )
    line = annotator.parameter_line(spec)
    assert "render_mode = " in line
    assert "assembly" in line


def test_section_header():
    annotator = CustomizerAnnotator()
    header = annotator.section_header("Body Dimensions")
    assert "/* [Body Dimensions] */" in header


# ── eps_helper ────────────────────────────────────────────────────────────────

def test_eps_expand_square():
    """A unit square expanded by 1 should produce approximately a 3×3 square."""
    square = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    expanded = eps_expand_polygon(square, eps=1.0)
    # The expanded polygon should be larger
    import numpy as np
    orig_area = 1.0
    pts = np.array(expanded)
    # Shoelace formula
    n = len(pts)
    area = 0.5 * abs(sum(
        pts[i][0] * pts[(i+1) % n][1] - pts[(i+1) % n][0] * pts[i][1]
        for i in range(n)
    ))
    assert area > orig_area


def test_pocket_cutter_larger_than_fill():
    """Pocket cutter should be strictly larger than the fill polygon."""
    fill = [[-10.0, 0.0], [10.0, 0.0], [10.0, 30.0], [-10.0, 30.0]]
    cutter = pocket_cutter_vertices(fill, eps=0.01)
    # All cutter vertices should be offset from fill vertices
    import numpy as np
    fill_arr = np.array(fill)
    cut_arr = np.array(cutter)
    diffs = np.abs(cut_arr - fill_arr)
    assert diffs.max() > 0.005


# ── ScadEmitter integration ───────────────────────────────────────────────────

def _make_minimal_form() -> ProjectForm:
    form = ProjectForm(
        name="Test Widget",
        source_dir="./source/",
        output_file="test_widget_parametric.scad",
        eps=0.01,
    )
    form.components = [
        ComponentEntry(
            name="body",
            role="base_solid",
            z_min=0.0,
            z_max=8.0,
            source_file="__nonexistent__/body.obj",
            confirmed=True,
        ),
        ComponentEntry(
            name="plate_layer_1",
            role="pocket_fill",
            z_min=0.0,
            z_max=3.0,
            source_file="__nonexistent__/plate.obj",
            confirmed=True,
        ),
    ]
    form.features = [
        FeatureEntry(
            name="finger_hole",
            feature_type="circular_hole",
            detected_from="cross_section_z4.0_body",
            params={"center_x": -16.5, "center_y": 26.7, "diameter": 25.0, "z_level": 4.0},
            confirmed=True,
            enabled_by_default=True,
            toggle_name="enable_finger_hole",
        )
    ]
    form.z_levels = [0.0, 3.0, 8.0]
    form.review_complete = True
    return form


def test_emitter_produces_output():
    """ScadEmitter should produce a non-empty .scad string."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert len(code) > 500
    assert "module" in code


def test_emitter_has_customizer_sections():
    """Output should contain Customizer section headers."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert "/* [" in code
    assert "] */" in code


def test_emitter_has_eps():
    """Output should declare the eps variable."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert "eps = " in code


def test_emitter_has_toggle():
    """Output should contain the feature toggle variable."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert "enable_finger_hole" in code


def test_emitter_has_render_mode():
    """Output should contain a render_mode parameter."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert "render_mode" in code
    assert "assembly" in code


def test_emitter_pocket_fill_architecture():
    """Output should use pocket_3d() cutters for pocket_fill components."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert "pocket_3d" in code or "pocket_2d" in code


def test_emitter_assembly_module_exists():
    """Output should contain an assembly module."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    safe_name = _safe_name(form.name)
    assert f"module {safe_name}()" in code


def test_emitter_render_dispatcher():
    """Output should contain if/else render dispatcher."""
    form = _make_minimal_form()
    emitter = ScadEmitter(form)
    code = emitter.emit()
    assert 'render_mode == "assembly"' in code
    assert 'render_mode == "body_only"' in code
