# Grid Printer Presets — Validation Summary

Updated: 2026-03-14

## Ranking Source

**Primary:** [techbaked.com "20 Best 3D Printers in 2026 [Tested] For Every Budget"](https://techbaked.com/best-3d-printers/) — 50+ printers tested over 1,000+ hours of print time. Corroborated by Tom's Hardware, 3DTechValley, CNET, and Alibaba sales data.

## Top 10 FDM Printers — Verified Bed Dimensions

| Rank | Printer                      | Bed (W × D mm) | Verification Sources |
| ---- | ---------------------------- | -------------- | -------------------- |
| 1    | Bambu Lab X1 Carbon          | 256 × 256      | [3DPros](https://3dpros.com/printers/bambu-lab-x1-carbon), [Bambu Lab PDF](https://public-cdn.bambulab.com/store/bambulab-X1-carbon-tech-specs.pdf) |
| 2    | Bambu Lab P1S                | 256 × 256      | [Bambu Lab](https://bambulab.com/en/p1?product=p1s), [3DPros](https://3dpros.com/printers/bambu-lab-p1s) |
| 3    | Original Prusa MK4S          | 250 × 210      | [Prusa3d.com](https://www.prusa3d.com/product/original-prusa-mk4s-3d-printer/), [3DPros](https://3dpros.com/printers/prusa-mk4s) |
| 4    | Creality K1C                 | 220 × 220      | [Creality.com](https://www.creality.com/support/k1c-carbon-3d-printer) |
| 5    | Creality K1 Max              | 300 × 300      | [Creality Store](https://crealitysg.com/products/k1-max), [3DPros](https://3dpros.com/printers/k1-max) |
| 6    | FlashForge Adventurer 5M Pro | 220 × 220      | [FlashForge.com](https://www.flashforge.com/products/adventurer-5m-pro-3d-printer), [Best Buy](https://www.bestbuy.com/product/flashforge-adventurer-5m-pro-3d-printer-auto-leveling-280c-quick-detachable-nozzle-dual-filtration-220220220mm-black/J3R85ZZG6J) |
| 7    | Bambu Lab A1                 | 256 × 256      | [Bambu Lab](https://bambulab.com/en-in/a1/tech-specs), [3DPros](https://3dpros.com/printers/bambu-lab-a1) |
| 8    | Anycubic Kobra 3 Combo       | 250 × 250      | [Anycubic Store](https://store.anycubic.com/collections/fdm-printer/products/kobra-3-combo), [3DPros](https://3dpros.com/printers/anycubic-kobra-3-combo) |
| 9    | Elegoo Neptune 4 Pro         | 225 × 225      | [3DPros](https://3dpros.com/printers/elegoo-neptune-4-pro), [Elegoo.com](https://www.elegoo.com/products/elegoo-neptune-4-pro-fdm-3d-printer) |
| 10   | Sovol SV06 Plus              | 300 × 300      | [3DPros](https://3dpros.com/printers/sovol-sv06-plus), [Sovol.tech](https://www.sovol.tech/products/sovol-sv06plus-3d-printer) |

## Deduplicated Presets (6 unique bed sizes)

| Preset Value | Label in UI                             | Printers                                    |
| ------------ | --------------------------------------- | ------------------------------------------- |
| `220x220`    | 220 × 220 mm (K1C / Adventurer 5M Pro) | Creality K1C, FlashForge Adventurer 5M Pro  |
| `225x225`    | 225 × 225 mm (Neptune 4 Pro)           | Elegoo Neptune 4 Pro                        |
| `250x210`    | 250 × 210 mm (Prusa MK4S)             | Original Prusa MK4S                         |
| `250x250`    | 250 × 250 mm (Kobra 3 Combo)          | Anycubic Kobra 3 Combo                      |
| `256x256`    | 256 × 256 mm (Bambu Lab X1C / P1S / A1) | Bambu Lab X1 Carbon, P1S, A1             |
| `300x300`    | 300 × 300 mm (K1 Max / SV06 Plus)     | Creality K1 Max, Sovol SV06 Plus            |

## Files Modified

- `index.html` — replaced 5 preset `<option>` elements with 6 new ones
- `dist/index.html` — identical changes applied
- `src/js/preview.js` — updated `DEFAULT_GRID_CONFIG` comment (value unchanged at 220×220)
