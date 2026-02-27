"""Phase 4A: Manufacturing-method-aware tolerance and parameter defaults.

Use ``get_profile(method)`` to retrieve the tolerance profile dict for a
manufacturing method string.  The profile is applied to auto-generated
ParameterSpec min/max/step values and the eps clearance value.
"""

from __future__ import annotations

from typing import Optional


TOLERANCE_PROFILES: dict[str, dict[str, object]] = {
    "fdm": {
        "hole_clearance": 0.4,    # extra diameter to add to nominal hole
        "min_wall": 1.2,          # minimum printable wall thickness (mm)
        "layer_height": 0.2,      # default layer height (mm)
        "min_feature": 0.8,       # smallest printable feature (mm)
        "eps": 0.04,              # boolean subtraction clearance
        "param_step": 0.5,        # default parameter step size
        "fillet_min": 0.4,        # minimum useful fillet radius
    },
    "sla": {
        "hole_clearance": 0.15,
        "min_wall": 0.8,
        "layer_height": 0.05,
        "min_feature": 0.3,
        "eps": 0.02,
        "param_step": 0.1,
        "fillet_min": 0.2,
    },
    "cnc": {
        "hole_clearance": 0.05,
        "min_wall": 1.0,
        "layer_height": None,
        "min_feature": 0.5,
        "eps": 0.01,
        "param_step": 0.1,
        "fillet_min": 0.1,
    },
    "laser_cut": {
        "hole_clearance": 0.1,
        "min_wall": 1.0,
        "layer_height": None,
        "min_feature": 0.5,
        "eps": 0.05,
        "param_step": 0.5,
        "fillet_min": 0.0,
    },
    "unknown": {
        "hole_clearance": 0.3,
        "min_wall": 1.2,
        "layer_height": 0.2,
        "min_feature": 0.8,
        "eps": 0.04,
        "param_step": 0.5,
        "fillet_min": 0.4,
    },
}

# Canonical method names (accept variants)
_METHOD_ALIASES: dict[str, str] = {
    "fdm": "fdm",
    "fff": "fdm",
    "sla": "sla",
    "resin": "sla",
    "msla": "sla",
    "cnc": "cnc",
    "milling": "cnc",
    "laser_cut": "laser_cut",
    "laser": "laser_cut",
    "unknown": "unknown",
}


def get_profile(method: str) -> dict[str, object]:
    """Return the tolerance profile dict for ``method``.

    Falls back to the ``"unknown"`` profile for unrecognised method strings.
    """
    canonical = _METHOD_ALIASES.get(method.lower(), "unknown")
    return dict(TOLERANCE_PROFILES.get(canonical, TOLERANCE_PROFILES["unknown"]))


def apply_to_param_spec(spec: object, method: str) -> None:
    """Adjust a ParameterSpec's min/step in-place based on the manufacturing method.

    This is a best-effort heuristic; it only overrides values that have not been
    explicitly set to non-None by the analysis pipeline.
    """
    profile = get_profile(method)
    step = profile.get("param_step")
    if step is not None and getattr(spec, "step", None) is None:
        spec.step = float(step)  # type: ignore[attr-defined]

    # Widen hole diameters by the hole clearance
    name = getattr(spec, "name", "")
    if "diameter" in name or "hole" in name:
        clearance = float(profile.get("hole_clearance", 0.0))
        current_val = getattr(spec, "value", None)
        if isinstance(current_val, (int, float)):
            spec.value = round(float(current_val) + clearance, 3)  # type: ignore[attr-defined]
