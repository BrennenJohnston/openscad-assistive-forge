"""Strategy registry for archetype-aware SCAD generation."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from forge_cad.generator.strategies.base import EmitterStrategy


def get_strategy(archetype: str) -> "EmitterStrategy":
    """Return the EmitterStrategy for the given archetype."""
    from forge_cad.generator.strategies.flat_plate import FlatPlateStrategy
    from forge_cad.generator.strategies.rotational import RotationalStrategy
    from forge_cad.generator.strategies.shell import ShellStrategy
    from forge_cad.generator.strategies.box_enclosure import BoxEnclosureStrategy
    from forge_cad.generator.strategies.assembly import AssemblyStrategy
    from forge_cad.generator.strategies.organic import OrganicStrategy

    _REGISTRY: dict[str, type[EmitterStrategy]] = {
        "flat_plate": FlatPlateStrategy,
        "rotational": RotationalStrategy,
        "shell": ShellStrategy,
        "box_enclosure": BoxEnclosureStrategy,
        "assembly": AssemblyStrategy,
        "organic": OrganicStrategy,
    }

    strategy_cls = _REGISTRY.get(archetype, FlatPlateStrategy)
    return strategy_cls()
