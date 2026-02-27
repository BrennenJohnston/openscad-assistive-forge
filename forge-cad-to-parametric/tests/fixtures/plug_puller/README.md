# Plug Puller v4.0 Test Fixtures

This directory is intended to hold the Plug Puller v4.0 CAD export files for
end-to-end testing of `forge-cad-to-parametric`.

## Setup

Copy the following files from `Plug Puller Test/Plug Puller 4.0/` into
this directory (maintaining subdirectory structure):

```
Full General (Clean Overview)/Full General (Clean Overview).obj
Full (Plug Base Plates Removed)/Full (Plug Base Plates Removed).obj
Plug Base Plate Layer 1/Plug Base Plate Layer 1.obj
Plug Base Plate Layer 2/Plug Base Plate Layer 2.obj
```

These files are not committed to the repository (binary files), but the
test suite expects them to be present for the integration test to run.

## Running the integration test

```bash
# From the forge-cad-to-parametric directory:
pytest tests/test_plug_puller_integration.py -v
```

The test will skip automatically if the fixture files are not present.

## Expected results

The integration test verifies that:
1. `forge-cad init` successfully analyses the Plug Puller v4.0 folder
2. The `project.yaml` correctly identifies:
   - The body as `base_solid` with Z-range [0, 8]
   - Plate Layer 1 as `pocket_fill` with Z-range [0, 3]
   - Plate Layer 2 as `pocket_fill` with Z-range [0, 6]
3. `forge-cad generate` produces a valid `.scad` file
4. The `.scad` file contains the expected Customizer sections
