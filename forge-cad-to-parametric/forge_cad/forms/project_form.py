"""YAML-based project form: serialise/deserialise all analysis results and confirmations."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml


@dataclass
class FileEntry:
    """One detected CAD file."""

    path: str
    file_type: str
    role: str
    z_min: float = 0.0
    z_max: float = 0.0
    vertex_count: int = 0


@dataclass
class ComponentEntry:
    """A classified component (body, pocket_fill, additive, etc.)."""

    name: str
    role: str
    z_min: float
    z_max: float
    source_file: str
    confirmed: bool = False
    notes: list[str] = field(default_factory=list)
    csg_order: int = 0
    # Human-supplied overrides
    human_name: Optional[str] = None
    human_role: Optional[str] = None


@dataclass
class ParameterSpec:
    """One OpenSCAD Customizer parameter."""

    name: str
    value: Any
    param_type: str  # "number" | "boolean" | "dropdown" | "string"
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    step: Optional[float] = None
    options: Optional[list] = None
    description: str = ""
    section: str = "Parameters"
    confirmed: bool = False


@dataclass
class FeatureEntry:
    """A detected geometric feature."""

    name: str
    feature_type: str
    detected_from: str
    params: dict = field(default_factory=dict)
    confirmed: bool = False
    enabled_by_default: bool = True
    toggle_name: Optional[str] = None
    parameter_specs: list[ParameterSpec] = field(default_factory=list)
    human_name: Optional[str] = None


@dataclass
class ProjectForm:
    """Complete project state: analysis results + user confirmations."""

    name: str
    source_dir: str
    output_file: str
    files: list[FileEntry] = field(default_factory=list)
    components: list[ComponentEntry] = field(default_factory=list)
    features: list[FeatureEntry] = field(default_factory=list)
    boundaries: list[dict] = field(default_factory=list)
    z_levels: list[float] = field(default_factory=list)
    global_params: list[ParameterSpec] = field(default_factory=list)
    eps: float = 0.01
    review_complete: bool = False
    notes: str = ""

    @classmethod
    def from_analysis(
        cls,
        name: str,
        source_dir: str,
        output_file: str,
        loaded_meshes: list,
        z_profile_result: dict,
        components: list,
        features: list,
        boundaries: list,
    ) -> "ProjectForm":
        """Build a ProjectForm from analysis pipeline outputs."""
        form = cls(
            name=name,
            source_dir=source_dir,
            output_file=output_file,
            z_levels=z_profile_result.get("all_levels", []),
            boundaries=boundaries,
        )
        for mesh in loaded_meshes:
            form.files.append(FileEntry(
                path=str(mesh.path),
                file_type=mesh.file_type,
                role=mesh.auto_role,
                z_min=mesh.z_min,
                z_max=mesh.z_max,
                vertex_count=mesh.vertex_count,
            ))
        for comp in components:
            form.components.append(ComponentEntry(
                name=comp.name,
                role=comp.role,
                z_min=comp.z_min,
                z_max=comp.z_max,
                source_file=comp.source_file,
                notes=comp.notes,
                csg_order=comp.csg_order,
            ))
        for feat in features:
            form.features.append(FeatureEntry(
                name=feat.name,
                feature_type=feat.feature_type,
                detected_from=feat.detected_from,
                params=feat.params,
            ))
        return form

    def save(self, path: Path) -> None:
        """Serialise to YAML."""
        data = self._to_dict()
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    @classmethod
    def load(cls, path: Path) -> "ProjectForm":
        """Deserialise from YAML."""
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls._from_dict(data)

    def _to_dict(self) -> dict:
        return {
            "project": {
                "name": self.name,
                "source_dir": self.source_dir,
                "output_file": self.output_file,
                "eps": self.eps,
                "review_complete": self.review_complete,
                "notes": self.notes,
            },
            "z_levels": self.z_levels,
            "files_detected": [self._file_entry_to_dict(f) for f in self.files],
            "components": [self._component_to_dict(c) for c in self.components],
            "features": [self._feature_to_dict(f) for f in self.features],
            "boundaries": self.boundaries,
            "global_params": [self._param_to_dict(p) for p in self.global_params],
        }

    @classmethod
    def _from_dict(cls, data: dict) -> "ProjectForm":
        proj = data.get("project", {})
        form = cls(
            name=proj.get("name", ""),
            source_dir=proj.get("source_dir", ""),
            output_file=proj.get("output_file", "output.scad"),
            eps=proj.get("eps", 0.01),
            review_complete=proj.get("review_complete", False),
            notes=proj.get("notes", ""),
            z_levels=data.get("z_levels", []),
            boundaries=data.get("boundaries", []),
        )

        form.files = [
            cls._file_entry_from_dict(d) for d in data.get("files_detected", [])
        ]
        form.components = [
            cls._component_from_dict(d) for d in data.get("components", [])
        ]
        form.features = [
            cls._feature_from_dict(d) for d in data.get("features", [])
        ]
        form.global_params = [
            cls._param_from_dict(d) for d in data.get("global_params", [])
        ]
        return form

    @staticmethod
    def _file_entry_to_dict(f: FileEntry) -> dict:
        return {
            "path": f.path,
            "type": f.file_type,
            "role": f.role,
            "z_range": [f.z_min, f.z_max],
            "vertex_count": f.vertex_count,
        }

    @staticmethod
    def _file_entry_from_dict(d: dict) -> FileEntry:
        z_range = d.get("z_range", [0.0, 0.0])
        return FileEntry(
            path=d.get("path", ""),
            file_type=d.get("type", ""),
            role=d.get("role", "unknown"),
            z_min=z_range[0] if len(z_range) > 0 else 0.0,
            z_max=z_range[1] if len(z_range) > 1 else 0.0,
            vertex_count=d.get("vertex_count", 0),
        )

    @staticmethod
    def _component_to_dict(c: ComponentEntry) -> dict:
        d: dict = {
            "name": c.name,
            "role": c.role,
            "z_range": [c.z_min, c.z_max],
            "source_file": c.source_file,
            "confirmed": c.confirmed,
            "csg_order": c.csg_order,
        }
        if c.notes:
            d["notes"] = c.notes
        if c.human_name:
            d["human_name"] = c.human_name
        if c.human_role:
            d["human_role"] = c.human_role
        return d

    @staticmethod
    def _component_from_dict(d: dict) -> ComponentEntry:
        z_range = d.get("z_range", [0.0, 0.0])
        return ComponentEntry(
            name=d.get("name", ""),
            role=d.get("human_role") or d.get("role", "unknown"),
            z_min=z_range[0] if len(z_range) > 0 else 0.0,
            z_max=z_range[1] if len(z_range) > 1 else 0.0,
            source_file=d.get("source_file", ""),
            confirmed=d.get("confirmed", False),
            notes=d.get("notes", []),
            csg_order=d.get("csg_order", 0),
            human_name=d.get("human_name"),
            human_role=d.get("human_role"),
        )

    @staticmethod
    def _feature_to_dict(f: FeatureEntry) -> dict:
        d: dict = {
            "name": f.name,
            "type": f.feature_type,
            "detected_from": f.detected_from,
            "params": f.params,
            "confirmed": f.confirmed,
            "enabled_by_default": f.enabled_by_default,
        }
        if f.toggle_name:
            d["toggle_name"] = f.toggle_name
        if f.human_name:
            d["human_name"] = f.human_name
        if f.parameter_specs:
            d["parameter_specs"] = [ProjectForm._param_to_dict(p) for p in f.parameter_specs]
        return d

    @staticmethod
    def _feature_from_dict(d: dict) -> FeatureEntry:
        return FeatureEntry(
            name=d.get("human_name") or d.get("name", ""),
            feature_type=d.get("type", ""),
            detected_from=d.get("detected_from", ""),
            params=d.get("params", {}),
            confirmed=d.get("confirmed", False),
            enabled_by_default=d.get("enabled_by_default", True),
            toggle_name=d.get("toggle_name"),
            human_name=d.get("human_name"),
            parameter_specs=[
                ProjectForm._param_from_dict(p) for p in d.get("parameter_specs", [])
            ],
        )

    @staticmethod
    def _param_to_dict(p: ParameterSpec) -> dict:
        d: dict = {
            "name": p.name,
            "value": p.value,
            "type": p.param_type,
            "description": p.description,
            "section": p.section,
            "confirmed": p.confirmed,
        }
        if p.min_val is not None:
            d["min"] = p.min_val
        if p.max_val is not None:
            d["max"] = p.max_val
        if p.step is not None:
            d["step"] = p.step
        if p.options is not None:
            d["options"] = p.options
        return d

    @staticmethod
    def _param_from_dict(d: dict) -> ParameterSpec:
        return ParameterSpec(
            name=d.get("name", ""),
            value=d.get("value"),
            param_type=d.get("type", "number"),
            min_val=d.get("min"),
            max_val=d.get("max"),
            step=d.get("step"),
            options=d.get("options"),
            description=d.get("description", ""),
            section=d.get("section", "Parameters"),
            confirmed=d.get("confirmed", False),
        )
