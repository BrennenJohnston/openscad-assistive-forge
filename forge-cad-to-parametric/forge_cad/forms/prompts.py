"""Interactive CLI review: walks the user through each auto-detection for confirmation."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from forge_cad.forms.project_form import (
    ComponentEntry,
    FeatureEntry,
    ParameterSpec,
    ProjectForm,
)

console = Console()

ROLE_CHOICES = [
    "base_solid",
    "pocket_fill",
    "additive",
    "subtractive",
    "variant",
    "unknown",
]

FEATURE_TYPE_CHOICES = [
    "circular_hole",
    "rectangular_slot",
    "polygon",
    "notch",
    "t_slot",
    "other",
]


class InteractiveReview:
    """Walks the user through each detection in the project form."""

    def __init__(self, project_dir: Path, auto_confirm: bool = False) -> None:
        self.project_dir = project_dir
        self.auto_confirm = auto_confirm
        self.form = ProjectForm.load(project_dir / "project.yaml")

    def run(self) -> None:
        """Run the full review session."""
        self._print_header()
        self._review_z_profile()
        self._review_components()
        self._review_features()
        self._review_global_params()
        self.form.review_complete = True
        self.form.save(self.project_dir / "project.yaml")

    def _print_header(self) -> None:
        console.print(
            Panel(
                f"[bold]Project:[/bold] {self.form.name}\n"
                f"[bold]Source:[/bold]  {self.form.source_dir}\n"
                f"[bold]Z-levels:[/bold] {self.form.z_levels}",
                title="forge-cad review",
                border_style="blue",
            )
        )

    def _review_z_profile(self) -> None:
        console.print("\n[bold blue]── Z-Profile Analysis ──[/bold blue]")
        console.print(f"  Detected Z-levels: {self.form.z_levels}")
        if not self.auto_confirm:
            raw = click.prompt(
                "  Adjust Z-levels? (enter comma-separated values, or press Enter to keep)",
                default="",
                show_default=False,
            )
            if raw.strip():
                try:
                    new_levels = [float(v.strip()) for v in raw.split(",") if v.strip()]
                    self.form.z_levels = sorted(new_levels)
                    console.print(f"  Updated Z-levels: {self.form.z_levels}")
                except ValueError:
                    console.print("  [yellow]Invalid input; keeping original Z-levels.[/yellow]")

    def _review_components(self) -> None:
        console.print(f"\n[bold blue]── Components ({len(self.form.components)}) ──[/bold blue]")

        for i, comp in enumerate(self.form.components):
            self._review_one_component(i, comp)

    def _review_one_component(self, idx: int, comp: ComponentEntry) -> None:
        panel_text = (
            f"[bold]Name:[/bold]   {comp.name}\n"
            f"[bold]Role:[/bold]   [cyan]{comp.role}[/cyan]\n"
            f"[bold]Z-range:[/bold] {comp.z_min:.1f} – {comp.z_max:.1f} mm\n"
        )
        if comp.notes:
            panel_text += "[bold]Notes:[/bold]  " + "; ".join(comp.notes)

        console.print(
            Panel(panel_text, title=f"Component {idx+1}", border_style="cyan")
        )

        if self.auto_confirm:
            comp.confirmed = True
            return

        action = click.prompt(
            "  [c]onfirm / [r]ename / [role] change role / [s]kip",
            default="c",
        ).strip().lower()

        if action in {"c", "confirm", ""}:
            comp.confirmed = True
        elif action in {"r", "rename"}:
            new_name = click.prompt("  New name", default=comp.name)
            comp.human_name = new_name
            comp.name = new_name
            comp.confirmed = True
        elif action in {"role"}:
            new_role = click.prompt(
                "  New role",
                type=click.Choice(ROLE_CHOICES),
                default=comp.role,
            )
            comp.human_role = new_role
            comp.role = new_role
            comp.confirmed = True
        elif action in {"s", "skip"}:
            console.print("  [yellow]Skipped — not confirmed.[/yellow]")
        else:
            # Treat as role if it's a valid role name
            if action in ROLE_CHOICES:
                comp.human_role = action
                comp.role = action
                comp.confirmed = True
            else:
                console.print("  [yellow]Unknown action; skipping.[/yellow]")

    def _review_features(self) -> None:
        console.print(f"\n[bold blue]── Features ({len(self.form.features)}) ──[/bold blue]")

        for i, feat in enumerate(self.form.features):
            self._review_one_feature(i, feat)

    def _review_one_feature(self, idx: int, feat: FeatureEntry) -> None:
        params_text = "\n".join(
            f"  [dim]{k}:[/dim] {v}" for k, v in feat.params.items()
        )
        panel_text = (
            f"[bold]Name:[/bold]         {feat.name}\n"
            f"[bold]Type:[/bold]         [cyan]{feat.feature_type}[/cyan]\n"
            f"[bold]Detected from:[/bold] {feat.detected_from}\n"
            f"[bold]Parameters:[/bold]\n{params_text}"
        )
        console.print(
            Panel(panel_text, title=f"Feature {idx+1}", border_style="magenta")
        )

        if self.auto_confirm:
            feat.confirmed = True
            if not feat.toggle_name:
                feat.toggle_name = f"enable_{feat.name.lower().replace(' ', '_')}"
            return

        action = click.prompt(
            "  [c]onfirm / [r]ename / [t]ype change / [d]isable / [s]kip / [del]ete",
            default="c",
        ).strip().lower()

        if action in {"c", "confirm", ""}:
            feat.confirmed = True
        elif action in {"r", "rename"}:
            new_name = click.prompt("  New name", default=feat.name)
            feat.human_name = new_name
            feat.name = new_name
            feat.confirmed = True
        elif action in {"t", "type"}:
            new_type = click.prompt(
                "  New type",
                type=click.Choice(FEATURE_TYPE_CHOICES),
                default=feat.feature_type,
            )
            feat.feature_type = new_type
            feat.confirmed = True
        elif action in {"d", "disable"}:
            feat.enabled_by_default = False
            feat.confirmed = True
        elif action in {"del", "delete"}:
            feat.confirmed = False
            feat.name = f"_deleted_{feat.name}"
        elif action in {"s", "skip"}:
            console.print("  [yellow]Skipped — not confirmed.[/yellow]")

        if feat.confirmed and not feat.toggle_name:
            feat.toggle_name = f"enable_{feat.name.lower().replace(' ', '_').replace('-', '_')}"

    def _review_global_params(self) -> None:
        if not self.form.global_params:
            return

        console.print(
            f"\n[bold blue]── Global Parameters ({len(self.form.global_params)}) ──[/bold blue]"
        )
        t = Table(show_header=True)
        t.add_column("Name")
        t.add_column("Value")
        t.add_column("Type")
        t.add_column("Range")
        for p in self.form.global_params:
            range_str = ""
            if p.min_val is not None and p.max_val is not None:
                range_str = f"{p.min_val} – {p.max_val}"
                if p.step is not None:
                    range_str += f" step {p.step}"
            t.add_row(p.name, str(p.value), p.param_type, range_str)
        console.print(t)

        if not self.auto_confirm:
            click.prompt(
                "  Press Enter to confirm all global parameters",
                default="",
                show_default=False,
            )

        for p in self.form.global_params:
            p.confirmed = True
