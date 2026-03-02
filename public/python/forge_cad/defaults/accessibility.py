"""Phase 4B: Accessibility-aware parameter ranges.

Use ``apply_accessibility_ranges(spec, needs)`` to widen or shift
ParameterSpec min/max values based on declared accessibility needs from the
intent questionnaire.

The ranges reflect ergonomic research and assistive-technology guidelines for
common physical and visual needs.
"""

from __future__ import annotations

from typing import Optional


# Maps parameter name fragments → {need: (min, max)} overrides
ACCESSIBILITY_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "grip_diameter": {
        "reduced_grip": (25.0, 50.0),
        "limited_hand_size": (20.0, 40.0),
        "default": (20.0, 40.0),
    },
    "button_size": {
        "visual_impairment": (15.0, 30.0),
        "default": (10.0, 20.0),
    },
    "wall_thickness": {
        "reduced_grip": (3.0, 8.0),
        "default": (2.0, 5.0),
    },
    "fillet_radius": {
        "reduced_grip": (2.0, 5.0),
        "default": (0.5, 3.0),
    },
    "handle_length": {
        "reduced_grip": (80.0, 150.0),
        "limited_hand_size": (60.0, 100.0),
        "default": (60.0, 120.0),
    },
    "text_height": {
        "visual_impairment": (5.0, 15.0),
        "default": (3.0, 8.0),
    },
}

# Canonical need names (accept variants from the questionnaire)
_NEED_ALIASES: dict[str, str] = {
    "reduced_grip": "reduced_grip",
    "reduced_grip_strength": "reduced_grip",
    "limited_hand_size": "limited_hand_size",
    "limited_hand_size_range": "limited_hand_size",
    "visual_impairment": "visual_impairment",
    "none": "",
    "skip": "",
}


def _canonical_needs(raw_needs: list[str]) -> list[str]:
    """Normalise the list of raw need strings from the questionnaire."""
    out: list[str] = []
    for raw in raw_needs:
        canonical = _NEED_ALIASES.get(raw.lower(), raw.lower())
        if canonical:
            out.append(canonical)
    return out


def get_range_override(
    param_name: str, needs: list[str]
) -> Optional[tuple[float, float]]:
    """Return (min, max) override for ``param_name`` given declared ``needs``.

    Returns None if no applicable override is found.
    """
    canonical = _canonical_needs(needs)
    name_lower = param_name.lower()

    for fragment, range_map in ACCESSIBILITY_RANGES.items():
        if fragment not in name_lower:
            continue
        # Try each declared need in priority order
        for need in canonical:
            if need in range_map:
                return range_map[need]
        # Fall back to default range if available
        if "default" in range_map:
            return range_map["default"]

    return None


def apply_accessibility_ranges(spec: object, needs: list[str]) -> None:
    """Adjust a ParameterSpec's min_val/max_val in-place based on accessibility needs.

    Only overrides values that are currently None (i.e. not set by the
    analysis pipeline).
    """
    override = get_range_override(getattr(spec, "name", ""), needs)
    if override is None:
        return

    lo, hi = override
    if getattr(spec, "min_val", None) is None:
        spec.min_val = lo  # type: ignore[attr-defined]
    if getattr(spec, "max_val", None) is None:
        spec.max_val = hi  # type: ignore[attr-defined]
