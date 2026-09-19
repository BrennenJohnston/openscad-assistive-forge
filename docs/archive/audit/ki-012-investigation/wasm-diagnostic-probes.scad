// wasm-diagnostic-probes.scad
// KI-012 Investigation — Phase C: Targeted WASM Diagnostic Probes
//
// Purpose: Isolate specific WASM platform failure modes that could cause
// Bug A (home-button tab persists) and Bug B (ghost cutouts).
//
// Usage:
//   1. Run each probe in WASM via the app (load this file, set probe_id)
//   2. Run each probe in desktop OpenSCAD CLI:
//        openscad -D "probe_id=1" -o probe_c1.stl wasm-diagnostic-probes.scad
//   3. Compare STL triangle counts and geometry between WASM and desktop.
//      Any difference indicates a WASM-specific computation error.
//
// Each probe targets a ranked root-cause candidate from the WASM Root
// Cause Probe plan. Probes are designed to be maximally sensitive to
// the specific failure mode they test.

/* [Probe Selection] */
// Which probe to run (1-4, or 0 for all)
probe_id = 0; // [0:4]

/* [Hidden] */
$fn = 64;

// ─── Probe C1: Rounding Mode / Predicate Sensitivity ─────────────
//
// Root cause candidate: fesetround(FE_UPWARD) is a no-op in WASM.
// CGAL's interval arithmetic uses directed rounding to compute rigorous
// bounds. Without it, predicates at precision boundaries return wrong
// results, causing difference() to leave stray faces or miss subtractions.
//
// This probe creates geometry where the boolean result depends on
// predicates at float64 precision boundaries. If rounding modes are
// broken, the difference() will produce a different number of triangles
// or leave artifacts.
//
// Expected: Desktop and WASM produce identical triangle counts.
// Failure:  Different triangle counts or visible artifacts in WASM.

module probe_c1_rounding_mode() {
    echo("=== Probe C1: Rounding Mode / Predicate Sensitivity ===");

    // Thin-wall difference at precision boundary.
    // The 0.001mm wall is near the threshold where CGAL's interval
    // arithmetic must fall back to exact computation. If fesetround
    // is broken, the interval bounds won't trigger the fallback.
    difference() {
        cube([50, 50, 2]);
        translate([0.001, 0.001, -0.5])
            cube([49.998, 49.998, 3]);
    }

    // Near-coplanar subtraction — predicates must determine whether
    // faces are coincident or offset by epsilon.
    translate([60, 0, 0])
    difference() {
        cube([30, 30, 10]);
        // Subtrahend is offset by 1e-10 in Z — well below double
        // precision for coordinates of this magnitude (~1e-14 ULP).
        // Correct predicates: the faces are NOT coplanar, producing
        // a thin residual layer.  Wrong predicates: may treat them
        // as coplanar and remove the entire top face.
        translate([5, 5, 10 - 1e-10])
            cube([20, 20, 5]);
    }

    // Chain of differences with accumulating precision loss.
    // Each step's output feeds the next predicate evaluation.
    // Rounding-mode errors compound through the chain.
    translate([0, 60, 0])
    difference() {
        cube([40, 40, 5]);
        for (i = [0:9]) {
            translate([i * 4 + 0.0001 * i, i * 4 + 0.0001 * i, -0.5])
                cube([3.5, 3.5, 6]);
        }
    }

    // Diagnostic echo: report $fn and a calculated value that depends
    // on OpenSCAD's internal arithmetic.
    _c1_test_val = 1/3 * 3;
    echo(str("C1_IDENTITY_TEST: 1/3 * 3 = ", _c1_test_val,
             " (should be 1.0, delta = ", _c1_test_val - 1, ")"));
}


// ─── Probe C2: Clipper2 Integer Coordinate Overflow ──────────────
//
// Root cause candidate: Clipper2's int64 coordinate system overflows
// when offset() scales large floating-point coordinates to integers.
// In wasm32, any code path using `int` or `long` (both 32-bit) instead
// of `int64_t` would silently truncate.
//
// References: openscad#5554, openscad#5565
//
// This probe uses offset() on increasingly large squares. If Clipper's
// integer scaling overflows, the offset polygon will have wrong vertices,
// producing incorrect geometry when linear_extrude'd.
//
// Expected: All four offset squares produce clean rounded rectangles.
// Failure:  Pointy artifacts, missing corners, or degenerate triangles
//           at larger scales (especially scale_3 and scale_4).

module probe_c2_clipper_overflow() {
    echo("=== Probe C2: Clipper2 Integer Coordinate Overflow ===");

    // Scale 1: safe range (small coordinates)
    translate([0, 0, 0])
    linear_extrude(2)
        offset(r = 2)
            square([50, 50], center = true);

    // Scale 2: moderate (coordinates up to ~500)
    translate([0, 0, 5])
    linear_extrude(2)
        offset(r = 5)
            square([500, 500], center = true);

    // Scale 3: large (coordinates push toward Clipper2 scaling limits)
    translate([0, 0, 10])
    linear_extrude(2)
        offset(r = 10)
            square([5000, 5000], center = true);

    // Scale 4: extreme (coordinates where int32 overflow would occur
    // if Clipper's scale factor × coordinate exceeds 2^31)
    translate([0, 0, 15])
    linear_extrude(2)
        offset(r = 0.5)
            square([100000, 100000], center = true);

    // Offset with negative r (inset) — exercises the same Clipper path
    // but with different winding arithmetic
    translate([0, 0, 20])
    linear_extrude(2)
        offset(r = -5)
            square([200, 200], center = true);

    // Diagnostic: offset a complex polygon (star shape)
    // More vertices = more Clipper integer operations = more overflow risk
    translate([0, 0, 25])
    linear_extrude(2)
        offset(r = 3) {
            polygon(points = [
                for (i = [0:9])
                    let(a = i * 36, r = i % 2 == 0 ? 40 : 20)
                    [r * cos(a), r * sin(a)]
            ]);
        }

    echo("C2_SCALE_TEST: offset at 4 coordinate magnitudes");
}


// ─── Probe C3: 2D Offset Precision for linear_extrude ────────────
//
// Root cause candidate: The keyguard model uses offset() + difference()
// + linear_extrude() extensively. If 2D offset produces slightly wrong
// polygon outlines, the extruded 3D geometry will have wrong faces,
// causing boolean operations to fail.
//
// This probe recreates the pattern used in keyguard construction:
// offset(r=+N) followed by offset(r=-N) followed by difference().
// The double-offset should return (approximately) the original shape
// with rounded corners; any precision loss accumulates and manifests
// as geometry errors.
//
// Expected: Clean hollow square frame, identical on WASM and desktop.
// Failure:  Ghost faces, missing walls, or different triangle counts.

module probe_c3_offset_precision() {
    echo("=== Probe C3: 2D Offset Precision (linear_extrude pattern) ===");

    // Pattern 1: Simple offset frame (matches keyguard rail construction)
    linear_extrude(3)
    difference() {
        offset(r = 2) square([50, 50], center = true);
        offset(r = -2) square([50, 50], center = true);
    }

    // Pattern 2: Double-offset round-trip (expand then contract)
    // Should approximate original shape with rounded corners
    translate([70, 0, 0])
    linear_extrude(3)
    difference() {
        offset(r = 5) offset(r = -5) square([40, 40], center = true);
        offset(r = 3) offset(r = -3) square([30, 30], center = true);
    }

    // Pattern 3: Nested difference with offsets — the exact pattern
    // that triggers Bug B (ghost cutouts) in the keyguard model
    translate([0, 70, 0])
    difference() {
        linear_extrude(5)
            offset(r = 3) square([60, 30], center = true);

        // Cutout that should completely remove interior
        translate([0, 0, -0.5])
        linear_extrude(6)
            offset(r = 1) square([54, 24], center = true);
    }

    // Pattern 4: Multiple cutouts in a single difference()
    // Mirrors the keyguard's multi-button cutout pattern
    translate([70, 70, 0])
    difference() {
        linear_extrude(4)
            offset(r = 2) square([80, 40], center = true);

        for (col = [0:3]) {
            translate([-30 + col * 20, 0, -0.5])
            linear_extrude(5)
                offset(r = 1) square([15, 30], center = true);
        }
    }

    echo("C3_OFFSET_FRAME: 4 offset+extrude patterns tested");
}


// ─── Probe C4: Coordinate System Extremes / 32-bit Truncation ────
//
// Root cause candidate: wasm32 uses 32-bit size_t and long. If any
// geometry code uses these types for coordinate calculations or buffer
// indices, values exceeding 2^31 (~2.1 billion) silently wrap around.
//
// Desktop x64 has 64-bit size_t, so the same code works correctly.
//
// This probe creates geometry at coordinates that stress 32-bit
// arithmetic: large translations, large scale factors, and vertex
// counts approaching 32-bit index limits.
//
// Expected: Identical geometry regardless of coordinate magnitude.
// Failure:  Corrupted geometry at large coordinates, or different
//           triangle counts between WASM and desktop.

module probe_c4_coordinate_extremes() {
    echo("=== Probe C4: Coordinate Extremes / 32-bit Truncation ===");

    // Pattern 1: Geometry at the origin (baseline)
    difference() {
        cube([10, 10, 10], center = true);
        cube([6, 6, 12], center = true);
    }

    // Pattern 2: Same geometry at moderate coordinates
    translate([1000, 1000, 0])
    difference() {
        cube([10, 10, 10], center = true);
        cube([6, 6, 12], center = true);
    }

    // Pattern 3: Same geometry at large coordinates
    // 1e6 * internal scale factor could approach 32-bit limits
    translate([1e6, 1e6, 0])
    difference() {
        cube([10, 10, 10], center = true);
        cube([6, 6, 12], center = true);
    }

    // Pattern 4: Geometry with high vertex count
    // Tests whether vertex buffer indexing overflows at wasm32 limits
    translate([0, 30, 0])
    difference() {
        sphere(r = 15, $fn = 128);
        sphere(r = 13, $fn = 128);
    }

    // Pattern 5: Very small geometry (sub-millimeter)
    // Tests precision at the other extreme
    translate([0, -20, 0])
    scale([0.01, 0.01, 0.01])
    difference() {
        cube([10, 10, 10], center = true);
        cube([6, 6, 12], center = true);
    }

    // Diagnostic: echo coordinate range info
    echo("C4_COORD_RANGE: origin, 1e3, 1e6, high-$fn sphere, sub-mm scale");
}


// ─── Probe dispatcher ────────────────────────────────────────────

if (probe_id == 0) {
    echo("=== Running ALL probes ===");
    probe_c1_rounding_mode();
    translate([200, 0, 0]) probe_c2_clipper_overflow();
    translate([0, 200, 0]) probe_c3_offset_precision();
    translate([200, 200, 0]) probe_c4_coordinate_extremes();
} else if (probe_id == 1) {
    probe_c1_rounding_mode();
} else if (probe_id == 2) {
    probe_c2_clipper_overflow();
} else if (probe_id == 3) {
    probe_c3_offset_precision();
} else if (probe_id == 4) {
    probe_c4_coordinate_extremes();
}

echo(str("=== Probe run complete. probe_id=", probe_id,
         " $fn=", $fn, " ==="));
