"""Click-based CLI entry point for forge-cad-to-parametric."""

from __future__ import annotations

import sys
from pathlib import Path

import click
from rich.console import Console

from forge_cad import __version__
from forge_cad.pipeline import Pipeline

console = Console()


@click.group()
@click.version_option(__version__, prog_name="forge-cad")
def main() -> None:
    """forge-cad: Convert CAD exports to parametric OpenSCAD.

    Automates the 8-stage analysis pipeline from CAD files to parametric
    OpenSCAD with Customizer annotations, compatible with openscad-assistive-forge.

    \b
    Typical workflow:
      forge-cad init   ./my-project --source "./CAD Exports/"
      forge-cad review ./my-project
      forge-cad generate ./my-project
      forge-cad validate ./my-project
    """


@main.command()
@click.argument("project_dir", type=click.Path())
@click.option(
    "--source",
    "-s",
    required=True,
    type=click.Path(exists=True, file_okay=False),
    help="Directory containing CAD export files (STL/OBJ/DXF/STEP).",
)
@click.option(
    "--name",
    "-n",
    default=None,
    help="Project name (defaults to source directory name).",
)
@click.option(
    "--output",
    "-o",
    default=None,
    help="Output .scad filename (defaults to <name>_parametric.scad).",
)
@click.option(
    "--overwrite",
    is_flag=True,
    default=False,
    help="Overwrite existing project.yaml if present.",
)
def init(
    project_dir: str,
    source: str,
    name: str | None,
    output: str | None,
    overwrite: bool,
) -> None:
    """Scan CAD folder, run auto-analysis, generate project.yaml.

    PROJECT_DIR is the directory where the project state will be stored.
    """
    project_path = Path(project_dir)
    source_path = Path(source)

    yaml_path = project_path / "project.yaml"
    if yaml_path.exists() and not overwrite:
        console.print(
            f"[yellow]project.yaml already exists at {yaml_path}.[/yellow]\n"
            "Use --overwrite to replace it."
        )
        sys.exit(1)

    project_path.mkdir(parents=True, exist_ok=True)

    resolved_name = name or source_path.name
    resolved_output = output or f"{resolved_name.replace(' ', '_')}_parametric.scad"

    console.print(f"[bold green]forge-cad init[/bold green] — {resolved_name}")
    console.print(f"  Source : {source_path.resolve()}")
    console.print(f"  Project: {project_path.resolve()}")
    console.print(f"  Output : {resolved_output}")
    console.print()

    pipeline = Pipeline(project_path, source_path, resolved_name, resolved_output)
    pipeline.run_init()

    console.print(
        f"\n[green]✓[/green] project.yaml written to [bold]{yaml_path}[/bold]\n"
        "Next step: [bold]forge-cad review {project_dir}[/bold]"
    )


@main.command()
@click.argument("project_dir", type=click.Path(exists=True, file_okay=False))
@click.option(
    "--auto-confirm",
    is_flag=True,
    default=False,
    help="Accept all auto-detected values without prompting (for scripted use).",
)
def review(project_dir: str, auto_confirm: bool) -> None:
    """Interactive CLI walkthrough to confirm/adjust auto-detections.

    PROJECT_DIR must contain a project.yaml created by 'forge-cad init'.
    """
    from forge_cad.forms.prompts import InteractiveReview

    project_path = Path(project_dir)
    _require_yaml(project_path)

    console.print(f"[bold green]forge-cad review[/bold green] — {project_path.resolve()}")
    reviewer = InteractiveReview(project_path, auto_confirm=auto_confirm)
    reviewer.run()

    console.print(
        "\n[green]✓[/green] Review complete. "
        "Next step: [bold]forge-cad generate {project_dir}[/bold]"
    )


@main.command()
@click.argument("project_dir", type=click.Path(exists=True, file_okay=False))
@click.option(
    "--output",
    "-o",
    default=None,
    type=click.Path(),
    help="Override output .scad path from project.yaml.",
)
def generate(project_dir: str, output: str | None) -> None:
    """Emit parametric .scad from confirmed project.yaml.

    PROJECT_DIR must contain a project.yaml that has been reviewed.
    """
    from forge_cad.forms.project_form import ProjectForm
    from forge_cad.generator.scad_emitter import ScadEmitter

    project_path = Path(project_dir)
    _require_yaml(project_path)

    form = ProjectForm.load(project_path / "project.yaml")
    out_path = Path(output) if output else project_path / form.output_file

    console.print(f"[bold green]forge-cad generate[/bold green] — {project_path.resolve()}")
    console.print(f"  Output: {out_path}")

    emitter = ScadEmitter(form)
    scad_code = emitter.emit()
    out_path.write_text(scad_code, encoding="utf-8")

    console.print(
        f"\n[green]✓[/green] Generated [bold]{out_path}[/bold] "
        f"({len(scad_code.splitlines())} lines)\n"
        "Next step: [bold]forge-cad validate {project_dir}[/bold]\n"
        "Or load the .scad into https://openscad-assistive-forge.pages.dev/"
    )


@main.command()
@click.argument("project_dir", type=click.Path(exists=True, file_okay=False))
@click.option(
    "--openscad",
    default="openscad",
    help="Path to OpenSCAD executable (default: 'openscad' from PATH).",
)
@click.option(
    "--tolerance",
    default=5.0,
    show_default=True,
    help="Maximum allowed volume deviation percentage.",
)
def validate(project_dir: str, openscad: str, tolerance: float) -> None:
    """Compare generated STL against source meshes.

    PROJECT_DIR must contain a project.yaml and a generated .scad file.
    Requires OpenSCAD to be installed and accessible.
    """
    from forge_cad.forms.project_form import ProjectForm
    from forge_cad.validator.mesh_compare import MeshComparator

    project_path = Path(project_dir)
    _require_yaml(project_path)

    form = ProjectForm.load(project_path / "project.yaml")
    scad_path = project_path / form.output_file

    if not scad_path.exists():
        console.print(
            f"[red]Error:[/red] {scad_path} does not exist. "
            "Run 'forge-cad generate' first."
        )
        sys.exit(1)

    console.print(f"[bold green]forge-cad validate[/bold green] — {project_path.resolve()}")
    comparator = MeshComparator(form, scad_path, openscad_exe=openscad)
    report = comparator.compare()

    _print_validation_report(report, tolerance)

    # Manifold check on the generated STL
    if report.generated_stl and report.generated_stl.exists():
        from forge_cad.validator.manifold_check import check_manifold

        manifold = check_manifold(report.generated_stl)
        if manifold.is_valid:
            console.print("[green]✓[/green] Manifold check passed (watertight, consistent winding)")
        else:
            notes = "; ".join(manifold.notes) if manifold.notes else "see details above"
            console.print(f"[yellow]⚠[/yellow] Manifold issues: {notes}")
            if manifold.open_edges > 0:
                console.print(f"  Open edges: {manifold.open_edges}")
            if manifold.degenerate_faces > 0:
                console.print(f"  Degenerate faces: {manifold.degenerate_faces}")

    if report.max_deviation > tolerance:
        console.print(
            f"\n[red]✗[/red] Validation FAILED: max deviation "
            f"{report.max_deviation:.1f}% exceeds tolerance {tolerance:.1f}%"
        )
        sys.exit(1)
    else:
        console.print(
            f"\n[green]✓[/green] Validation PASSED "
            f"(max deviation {report.max_deviation:.1f}%)"
        )


@main.command()
@click.argument("project_dir", type=click.Path(exists=True, file_okay=False))
def status(project_dir: str) -> None:
    """Show current project state summary.

    PROJECT_DIR must contain a project.yaml.
    """
    from rich.table import Table

    from forge_cad.forms.project_form import ProjectForm

    project_path = Path(project_dir)
    _require_yaml(project_path)

    form = ProjectForm.load(project_path / "project.yaml")

    console.print(f"\n[bold]Project:[/bold] {form.name}")
    console.print(f"[bold]Source:[/bold]  {form.source_dir}")
    console.print(f"[bold]Output:[/bold]  {form.output_file}\n")

    t = Table(title="Components", show_header=True)
    t.add_column("Name")
    t.add_column("Role")
    t.add_column("Z-range")
    t.add_column("Confirmed")
    for c in form.components:
        confirmed = "[green]✓[/green]" if c.confirmed else "[yellow]?[/yellow]"
        t.add_row(c.name, c.role, f"{c.z_min:.1f}–{c.z_max:.1f}", confirmed)
    console.print(t)

    t2 = Table(title="Features", show_header=True)
    t2.add_column("Name")
    t2.add_column("Type")
    t2.add_column("Detected from")
    t2.add_column("Confirmed")
    for f in form.features:
        confirmed = "[green]✓[/green]" if f.confirmed else "[yellow]?[/yellow]"
        t2.add_row(f.name, f.feature_type, f.detected_from, confirmed)
    console.print(t2)


def _require_yaml(project_path: Path) -> None:
    yaml_path = project_path / "project.yaml"
    if not yaml_path.exists():
        console.print(
            f"[red]Error:[/red] No project.yaml found at {project_path}.\n"
            "Run 'forge-cad init' first."
        )
        sys.exit(1)


def _print_validation_report(report: object, tolerance: float) -> None:
    from rich.table import Table

    t = Table(title="Validation Report")
    t.add_column("Metric")
    t.add_column("Source")
    t.add_column("Generated")
    t.add_column("Deviation")

    for row in report.rows:
        color = "green" if row.deviation <= tolerance else "red"
        t.add_row(
            row.metric,
            f"{row.source_value:.3f}",
            f"{row.generated_value:.3f}",
            f"[{color}]{row.deviation:.1f}%[/{color}]",
        )
    console.print(t)


if __name__ == "__main__":
    main()
