// Minimal keyguard fixture for fast parser testing
// Contains representative subsets of ALL annotation patterns from keyguard_v75.scad
// Version: 75 (minimal test fixture)
include <openings_and_additions.txt>

/*[Keyguard Basics]*/
type_of_keyguard = "3D-Printed"; // [3D-Printed,Laser-Cut]
//not for use with Laser-Cut keyguards
keyguard_thickness = 4.0; // .1
generate = "keyguard"; //[keyguard,first half of keyguard,second half of keyguard,horizontal clip,vertical clip,horizontal mini clip,vertical mini clip,horizontal micro clip,vertical micro clip,keyguard frame,first half of keyguard frame,second half of keyguard frame,cell insert,first layer for SVG/DXF file,Customizer settings]

/*[Tablet]*/
type_of_tablet = "iPad 9th generation"; //[iPad, iPad2, iPad 3rd generation, iPad 4th generation, iPad 5th generation,iPad 6th generation, iPad 7th generation, iPad 8th generation, iPad 9th generation, iPad 10th generation, iPad 11th generation A16, iPad Pro 9.7-inch, iPad Pro 10.5-inch, iPad Pro 11-inch 1st Generation, iPad Pro 11-inch 2nd Generation, iPad Pro 11-inch 3rd Generation, iPad Pro 11-inch 4th Generation, iPad Pro 11-inch M4, iPad Pro 12.9-inch 1st Generation, iPad Pro 12.9-inch 2nd Generation, iPad Pro 12.9-inch 3rd Generation, iPad Pro 12.9-inch 4th Generation, iPad Pro 12.9-inch 5th Generation, iPad Pro 12.9-inch 6th Generation, iPad Pro 13-inch M4, iPad mini, iPad mini 2, iPad mini 3, iPad mini 4, iPad mini 5, iPad mini 6, iPad mini 7 A17 Pro, iPad Air, iPad Air 2, iPad Air 3, iPad Air 4, iPad Air 5, iPad Air 11-inch M2, iPad Air 13-inch M2, iPad Air 11-inch M3, iPad Air 13-inch M3, Dynavox I-12+, Dynavox Indi, Tobii-Dynavox I-110, Tobii-Dynavox T-15+, Tobii-Dynavox I-13, Tobii-Dynavox I-16, NovaChat 5, NovaChat 5.3, NovaChat 5.4, NovaChat 8.5, NovaChat 12, Chat Fusion 10, Surface 2, Surface 3, Surface Pro 3, Surface Pro 4, Surface Pro 5, Surface Pro 6, Surface Pro 7, Surface Pro 8, Surface Pro 9, Surface Pro X, Surface Go, Surface Go 3, Accent 800-30, Accent 800-40, Accent 1000-20, Accent 1000-30, Accent 1000-40, Accent 1400-20, Accent 1400-30a, Accent 1400-30b, Via Nano, Via Mini, Via Pro, GridPad 10s, GridPad 11, GridPad 12, GridPad 13, GridPad 15, Samsung Galaxy Tab A 8.4, Samsung Galaxy Tab A7 10.4, Samsung Galaxy Tab A7 Lite, Samsung Galaxy Tab A8, Samsung Galaxy Tab A9, Samsung Galaxy Tab A9+, Samsung Galaxy Tab Active 2, Samsung Galaxy Tab Active 3, Samsung Galaxy Tab Active 5, Samsung Galaxy Tab Active 4 Pro, Samsung Galaxy Tab S3, Samsung Galaxy Tab S6, Samsung Galaxy Tab S6 Lite, Samsung Galaxy Tab S7, Samsung Galaxy Tab S7 FE, Samsung Galaxy Tab S7+, Samsung Galaxy Tab S8, Samsung Galaxy Tab S8 Ultra, Samsung Galaxy Tab S8+, Samsung Galaxy Tab S9, Samsung Galaxy Tab S9 FE, Samsung Galaxy Tab S9 FE+, Samsung Galaxy Tab S9 Ultra, Samsung Galaxy Tab S9+, Amazon Fire HD 7, Amazon Fire HD 8, Amazon Fire HD 8 Plus, Amazon Fire HD 10, Amazon Fire HD 10 Plus, Amazon Fire Max 11, blank, other tablet]
orientation = "landscape"; //[portrait,landscape]
expose_home_button = "yes"; //[yes,no]
home_button_edge_slope = 30;

/*[Tablet Case]*/
have_a_case = "yes"; //[yes,no]
height_of_opening_in_case = 170;
width_of_opening_in_case = 245;
case_opening_corner_radius = 5;

/*[App Layout in px]*/
bottom_of_status_bar = 0; //[0:10000]
bottom_of_upper_message_bar = 0; //[0:10000]

/*[App Layout in mm]*/
status_bar_height = 0.0; // .1
upper_message_bar_height = 0.0; // .1

/*[Bar Info]*/
expose_status_bar = "no"; //[yes,no]
bar_edge_slope = 90;
bar_corner_radius = 2; // .1

/*[Grid Info]*/
number_of_rows = 3;
number_of_columns = 4;
cell_shape = "rectangular"; // [rectangular,circular]
cell_height_in_mm = 25;
cell_width_in_mm = 25;
cell_corner_radius = 3;

/*[Grid Special Settings]*/
cell_edge_slope = 90;
// example: 3,6,12
cover_these_cells = "";
// example: 5,8 merges cells 5&6 and 8&9
merge_cells_horizontally_starting_at = "";
// example: 3,6,12
add_a_ridge_around_these_cells = "";
height_of_ridge = 2.0; // .1

/*[Mounting Method]*/
mounting_method = "No Mount"; // [No Mount,Suction Cups,Velcro,Screw-on Straps,Clip-on Straps,Posts,Shelf,Slide-in Tabs,Raised Tabs]

/*[Velcro Info]*/
velcro_size = 1; // [1:10mm -3/8 in- Dots, 2:16mm -5/8 in- Dots, 3:20mm -3/4 in- Dots, 4:3/8 in Squares, 5:5/8 in Squares, 6:3/4 in Squares]

/*[Clip-on Straps Info]*/
clip_locations="horizontal only"; //[horizontal only, vertical only, horizontal and vertical]
horizontal_clip_width=20;

/*[Posts Info]*/
post_diameter = 4.0; // .1
post_length = 5;
notch_in_post = "yes"; // [yes,no]

/*[Shelf Info]*/
shelf_thickness = 2.0; // .1
shelf_depth = 3; // .1

/*[Slide-in Tabs Info]*/
slide_in_tab_locations="horizontal only"; //[horizontal only, vertical only, horizontal and vertical]
preferred_slide_in_tab_thickness = 2.0; // .1

/*[Raised Tabs Info]*/
raised_tab_height=6;
raised_tab_length=8;
embed_magnets = "no"; // [yes, no]
magnet_size = "20 x 8 x 1.5"; // [20 x 8 x 1.5, 40 x 10 x 2]

/*[Keyguard Frame Info]*/
have_a_keyguard_frame = "no"; //[yes,no]
keyguard_frame_thickness = 5.0; // .1
mount_keyguard_with = "snap-in tabs"; //[snap-in tabs, posts]

/*[Split Keyguard Info]*/
split_line_location = 0; // [-300:.1:300]
show_split_line = "no"; //[yes,no]
split_line_type = "flat"; //[flat,dovetails]
dovetail_width = 4.0; //[3:.1:6]
tightness_of_dovetail_joint = 5; //[0:.1:10]

/*[Sloped Keyguard Edge Info]*/
add_sloped_keyguard_edge = "no"; //[yes,no]
sloped_edge_starting_height = 1.0; //.1
sloped_edge_width = 10.0; //.1

/*[Engraved/Embossed Text]*/
text = "";
//measured in millimeters
text_height = 5.0; //.1
font_style = "normal"; //[normal,bold,italic,bold italic]
keyguard_location = "top surface"; //[top surface,bottom surface]

/*[Cell Inserts]*/
Braille_location = "above opening"; //[above opening, below opening, above and below opening, left of opening, right of opening, left and right of opening]
Braille_text = "";
Braille_size_multiplier = 10; //[1:30]
add_circular_opening = "yes"; //[yes,no]

/*[Free-form and Hybrid Keyguard Openings]*/
unit_of_measure_for_screen = "px"; //[px,mm]
starting_corner_for_screen_measurements = "upper-left"; //[upper-left, lower-left]

/*[Special Actions and Settings]*/
include_screenshot = "no"; //[yes,no]
keyguard_display_angle = 0; // [0,30,45,60,75,90]
smoothness_of_circles_and_arcs = 40; //[5:360]
screenshot_file = "default.svg";

/*[Hidden]*/
keyguard_designer_version = 75;
MW_version = false;
fudge = 0.001;

// Simple geometry for fast WASM compilation
difference() {
    cube([width_of_opening_in_case, height_of_opening_in_case, keyguard_thickness]);
    // Apply screen_openings from included file
    for (opening = screen_openings) {
        if (len(opening) >= 5 && opening[3] > 0 && opening[4] > 0) {
            translate([opening[1], opening[2], -1])
                cube([opening[3], opening[4], keyguard_thickness + 2]);
        }
    }
}

echo("Keyguard type:", type_of_keyguard);
echo("Generate mode:", generate);
echo("Tablet:", type_of_tablet);
