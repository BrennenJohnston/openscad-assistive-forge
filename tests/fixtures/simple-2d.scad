// Simple 2D model for SVG/DXF export testing
// This produces valid 2D output without complex projection

/*[Dimensions]*/
width = 50; // [10:100]
height = 50; // [10:100]

/*[Shape]*/
shape_type = "square"; // [square, circle, rounded_rect]
corner_radius = 5; // [0:20]

if (shape_type == "square") {
    square([width, height], center = true);
} else if (shape_type == "circle") {
    circle(d = min(width, height));
} else if (shape_type == "rounded_rect") {
    offset(r = corner_radius)
        offset(delta = -corner_radius)
            square([width, height], center = true);
}
