"""Stage 2: Variant differencing.

Detects variant relationships from filenames, computes bounding box and volume
differences, and classifies boolean roles.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from forge_cad.analyzer.loader import LoadedMesh

# Variant name keywords ordered by priority
_VARIANT_KEYWORDS = [
    ("removed", "subtracted"),
    ("no holes", "holes_removed"),
    ("without", "subtracted"),
    ("except", "feature_present"),
    ("only", "feature_isolated"),
]


@dataclass
class VariantPair:
    """Two mesh files that appear to be variants of each other."""

    base_name: str
    variant_name: str
    relationship: str  # e.g. "subtracted", "holes_removed", "feature_present"
    volume_diff: float = 0.0
    volume_diff_pct: float = 0.0
    bbox_diff: Optional[np.ndarray] = None


@dataclass
class VariantDiffResult:
    """All detected variant pairs and differences."""

    pairs: list[VariantPair] = field(default_factory=list)
    feature_volumes: dict[str, float] = field(default_factory=dict)


class VariantDiffer:
    """Computes variant relationships and volumetric differences."""

    def __init__(self, meshes: list[LoadedMesh]) -> None:
        self.meshes = {m.name: m for m in meshes if m.file_type != "dxf"}

    def compute(self) -> dict:
        """Run differencing and return a plain dict for serialisation."""
        result = self._compute()
        return {
            "pairs": [
                {
                    "base": p.base_name,
                    "variant": p.variant_name,
                    "relationship": p.relationship,
                    "volume_diff": round(p.volume_diff, 4),
                    "volume_diff_pct": round(p.volume_diff_pct, 2),
                    "bbox_diff": p.bbox_diff.tolist() if p.bbox_diff is not None else None,
                }
                for p in result.pairs
            ],
            "feature_volumes": {
                k: round(v, 4) for k, v in result.feature_volumes.items()
            },
        }

    def _compute(self) -> VariantDiffResult:
        pairs = self._detect_pairs()
        feature_volumes = self._compute_volume_diffs(pairs)
        return VariantDiffResult(pairs=pairs, feature_volumes=feature_volumes)

    def _detect_pairs(self) -> list[VariantPair]:
        """Detect variant pairs using filename heuristics."""
        names = list(self.meshes.keys())
        pairs: list[VariantPair] = []
        used: set[str] = set()

        for name in names:
            if name in used:
                continue
            relationship = self._classify_variant_name(name)
            if relationship is None:
                continue

            # Find the most likely base: longest common prefix with a non-variant name
            base = self._find_base(name, names)
            if base and base != name:
                pairs.append(
                    VariantPair(
                        base_name=base,
                        variant_name=name,
                        relationship=relationship,
                    )
                )
                used.add(name)

        return pairs

    @staticmethod
    def _classify_variant_name(name: str) -> Optional[str]:
        lower = name.lower()
        for keyword, relationship in _VARIANT_KEYWORDS:
            if keyword in lower:
                return relationship
        return None

    @staticmethod
    def _find_base(variant_name: str, all_names: list[str]) -> Optional[str]:
        """Find the best base mesh for a variant by common token overlap."""
        variant_tokens = set(re.findall(r"\w+", variant_name.lower()))
        best_score = 0
        best_name: Optional[str] = None

        for candidate in all_names:
            if candidate == variant_name:
                continue
            if VariantDiffer._classify_variant_name(candidate) is not None:
                continue
            candidate_tokens = set(re.findall(r"\w+", candidate.lower()))
            overlap = len(variant_tokens & candidate_tokens)
            if overlap > best_score:
                best_score = overlap
                best_name = candidate

        return best_name

    def _compute_volume_diffs(
        self, pairs: list[VariantPair]
    ) -> dict[str, float]:
        """Compute volume and bounding box differences for each pair."""
        feature_volumes: dict[str, float] = {}

        for pair in pairs:
            base_mesh = self.meshes.get(pair.base_name)
            variant_mesh = self.meshes.get(pair.variant_name)

            if base_mesh is None or variant_mesh is None:
                continue

            try:
                base_vol = base_mesh.volume
                variant_vol = variant_mesh.volume

                pair.volume_diff = base_vol - variant_vol
                if base_vol > 0:
                    pair.volume_diff_pct = 100.0 * abs(pair.volume_diff) / base_vol

                # Bounding box differencing (per-axis extent differences)
                if base_mesh.bounding_box is not None and variant_mesh.bounding_box is not None:
                    base_extents = base_mesh.bounding_box[1] - base_mesh.bounding_box[0]
                    var_extents = variant_mesh.bounding_box[1] - variant_mesh.bounding_box[0]
                    pair.bbox_diff = base_extents - var_extents

                if pair.relationship in {"subtracted", "holes_removed"}:
                    key = f"{pair.base_name}_vs_{pair.variant_name}"
                    feature_volumes[key] = abs(pair.volume_diff)
            except Exception:  # noqa: BLE001
                pass

        return feature_volumes
