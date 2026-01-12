# Universal Cuff Utensil/Tool Holder

This example demonstrates parameter extraction from a real-world OpenSCAD project with comprehensive Customizer annotations.

## Source

- **Author**: Volksswitch (www.volksswitch.org)
- **License**: CC0 Public Domain
- **Original**: [Thingiverse #3492411](https://www.thingiverse.com/thing:3492411)

## Files

| File | Description |
|------|-------------|
| `universal_cuff_utensil_holder.scad` | Original OpenSCAD source file |
| `params.schema.json` | Extracted parameter schema (manually created as reference) |

## Parameter Groups

This model has **10 Customizer groups** with **50+ parameters**:

1. **Part to Print** — Select which component to generate
2. **Palm Loop Info** — Dimensions and mount options
3. **Circular Loop Info** — Band dimensions, grips, elastic slots
4. **Utensil Mount Info** — Mounting dimensions and angles
5. **Utensil Holder Info** — Handle type and dimensions
6. **Thumb Rest/Loop Info** — Thumb component dimensions
7. **Tool Interface Info** — Tool interface dimensions
8. **Tool Cup Info** — Cup dimensions
9. **Tool Saddle Info** — Saddle dimensions
10. **Circular Grip Info** — Grip diameter

Plus a `[Hidden]` group for internal constants ($fn, fudge, chamfer_size).

## Parameter Types Demonstrated

- **Enums**: `part`, `utensil_handle_type`, `dove_tail_size`
- **Yes/No toggles**: `include_lower_utensil_mount`, `put_break_in_band`
- **Integer ranges**: `palm_loop_height = 30; // [15:75]`
- **Angle ranges**: `dove_tail_angle = 0; // [-90:90]`
- **Constrained enums**: `internal_grips = 0; // [0,2,4,6]`

## Why This Example?

This file is an **excellent test case** because:

1. ✅ **CC0 license** — No attribution required, ideal for testing
2. ✅ **Comprehensive annotations** — Uses all major Customizer syntax
3. ✅ **Multiple parts** — Tests part-switching UI patterns
4. ✅ **Conditional params** — Some params only apply to certain parts
5. ✅ **Real-world complexity** — ~1000 lines, 50+ parameters
6. ✅ **Assistive tech** — Meaningful, useful project for accessibility

## Validation Checklist

When the extractor is implemented, verify:

- [ ] All 10 groups are detected
- [ ] All 50+ parameters are extracted
- [ ] Default values match exactly
- [ ] Min/max ranges are correct
- [ ] Enum options are in correct order
- [ ] Hidden group parameters are marked hidden
- [ ] Description comments are captured
