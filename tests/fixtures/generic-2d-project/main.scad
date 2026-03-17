// Generic 2D Project — Parametric Nameplate
// A community-style project that produces both 2D and 3D output,
// using non-keyguard parameter names. Tests generic render-intent
// resolution (Phase 1 parity harness).

/* [Nameplate] */
plate_width = 80; // [30:200]
plate_height = 25; // [15:80]
text_content = "Hello";
font_size = 12; // [6:36]

/* [Output] */
// This enum uses a generic name ("output_mode"), NOT "generate".
output_mode = "3d"; // [3d, 2d_engrave, 2d_cut]
border_style = "rounded"; // [square, rounded, chamfered]
corner_radius = 3; // [0:10]

/* [Decoration] */
// import the companion SVG as a surface decoration
use_pattern = "no"; // [yes, no]
pattern_file = "pattern.svg";

module nameplate_2d() {
    difference() {
        if (border_style == "rounded") {
            offset(r = corner_radius)
                offset(delta = -corner_radius)
                    square([plate_width, plate_height], center = true);
        } else if (border_style == "chamfered") {
            offset(delta = -corner_radius)
                offset(chamfer = corner_radius)
                    square([plate_width, plate_height], center = true);
        } else {
            square([plate_width, plate_height], center = true);
        }

        text(text_content, size = font_size, halign = "center", valign = "center");
    }
}

module nameplate_3d() {
    linear_extrude(height = 3)
        nameplate_2d();
}

if (output_mode == "3d") {
    nameplate_3d();
} else {
    nameplate_2d();
}
