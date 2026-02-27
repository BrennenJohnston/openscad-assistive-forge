"""Abstract base class for archetype-specific SCAD emitter strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from forge_cad.forms.project_form import ProjectForm


class EmitterStrategy(ABC):
    """Each concrete strategy encapsulates geometry generation for one archetype."""

    @abstractmethod
    def emit_2d_modules(self, form: "ProjectForm", builder: object, safe_name_fn: object) -> str:
        """Emit 2-D profile module definitions."""
        ...

    @abstractmethod
    def emit_3d_modules(self, form: "ProjectForm", builder: object, safe_name_fn: object) -> str:
        """Emit 3-D extrusion / solid module definitions."""
        ...

    @abstractmethod
    def emit_assembly(self, form: "ProjectForm", builder: object, safe_name_fn: object) -> str:
        """Emit the final assembly module."""
        ...
