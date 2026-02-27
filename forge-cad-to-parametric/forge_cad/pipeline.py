"""Orchestrates all analysis stages for the init command."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from forge_cad.analyzer.archetype_detect import ArchetypeDetector
from forge_cad.analyzer.boundary_detect import BoundaryDetector
from forge_cad.analyzer.feature_detect import FeatureDetector
from forge_cad.analyzer.loader import FileLoader, LoadedMesh
from forge_cad.analyzer.topology import TopologyClassifier
from forge_cad.analyzer.variant_diff import VariantDiffer
from forge_cad.analyzer.z_profile import ZProfileExtractor
from forge_cad.forms.project_form import (
    ComponentEntry,
    FeatureEntry,
    FileEntry,
    IntentData,
    ProjectForm,
)

console = Console()


class Pipeline:
    """Runs the auto-analysis pipeline and persists results to project.yaml."""

    def __init__(
        self,
        project_dir: Path,
        source_dir: Path,
        name: str,
        output_file: str,
        intent: Optional[IntentData] = None,
    ) -> None:
        self.project_dir = project_dir
        self.source_dir = source_dir
        self.name = name
        self.output_file = output_file
        self.intent = intent or IntentData()

    def run_init(self) -> ProjectForm:
        """Run all analysis stages and write project.yaml."""
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task("Stage 0: Scanning files...", total=None)

            loader = FileLoader(self.source_dir)
            meshes = loader.load_all()
            progress.update(task, description=f"  Loaded {len(meshes)} mesh(es)")

            progress.update(task, description="Stage 1: Extracting Z-profiles...")
            z_extractor = ZProfileExtractor(meshes)
            z_profiles = z_extractor.extract()

            progress.update(task, description="Stage 2: Differencing variants...")
            differ = VariantDiffer(meshes)
            variant_diffs = differ.compute()

            progress.update(task, description="Stage 3: Classifying topology...")
            classifier = TopologyClassifier(meshes, z_profiles, variant_diffs)
            components = classifier.classify()

            progress.update(task, description="Stage 4: Detecting features...")
            detector = FeatureDetector(meshes, z_profiles, variant_diffs)
            features = detector.detect()

            progress.update(task, description="Stage 5: Detecting archetype...")
            archetype_det = ArchetypeDetector()
            archetype = archetype_det.detect(meshes, z_profiles, self.intent)

            progress.update(task, description="Stage 6: Detecting boundaries...")
            boundary_det = BoundaryDetector(meshes, components)
            boundaries = boundary_det.detect()

            progress.update(task, description="Writing project.yaml...")
            form = self._build_form(meshes, z_profiles, components, features, boundaries, archetype)
            form.save(self.project_dir / "project.yaml")

        self._print_summary(form)
        return form

    def _build_form(
        self,
        meshes: list[LoadedMesh],
        z_profiles: dict,
        components: list,
        features: list,
        boundaries: list,
        archetype: str = "flat_plate",
    ) -> ProjectForm:
        file_entries = [
            FileEntry(
                path=str(m.path.relative_to(self.source_dir)),
                file_type=m.file_type,
                role=m.auto_role,
                z_min=m.z_min,
                z_max=m.z_max,
                vertex_count=m.vertex_count,
            )
            for m in meshes
        ]

        component_entries = [
            ComponentEntry(
                name=c.name,
                role=c.role,
                z_min=c.z_min,
                z_max=c.z_max,
                source_file=c.source_file,
                confirmed=False,
            )
            for c in components
        ]

        feature_entries = [
            FeatureEntry(
                name=f.name,
                feature_type=f.feature_type,
                detected_from=f.detected_from,
                params=f.params,
                confirmed=False,
            )
            for f in features
        ]

        return ProjectForm(
            name=self.name,
            source_dir=str(self.source_dir),
            output_file=self.output_file,
            files=file_entries,
            components=component_entries,
            features=feature_entries,
            boundaries=boundaries,
            z_levels=z_profiles.get("all_levels", []),
            archetype=archetype,
            intent=self.intent,
        )

    def _print_summary(self, form: ProjectForm) -> None:
        console.print(f"\n  Files detected   : {len(form.files)}")
        console.print(f"  Components found : {len(form.components)}")
        console.print(f"  Features found   : {len(form.features)}")
        console.print(f"  Z-levels         : {form.z_levels}")
        unconfirmed = sum(1 for c in form.components if not c.confirmed)
        unconfirmed += sum(1 for f in form.features if not f.confirmed)
        console.print(
            f"\n  [yellow]{unconfirmed} items need human review[/yellow] "
            "— run 'forge-cad review' next."
        )
