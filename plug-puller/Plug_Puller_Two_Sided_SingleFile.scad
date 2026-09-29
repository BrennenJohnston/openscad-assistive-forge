// =============================================================================
// Plug_Puller_Two_Sided_SingleFile.scad — GENERATED FILE, DO NOT EDIT
// =============================================================================
//
// Plug Puller — two-sided puller: the flattened single-file build of
// src/Plug_Puller_Two_Sided.scad, with fit_sizes.scad inlined. Generated from
// the canonical sources in src/ — edit those files, not this one.
//
// Purpose: web customizers (MakerWorld Parametric Model Maker,
// openscad-playground `?src=` loading) accept only a single .scad file with
// no local include tree. This artifact renders identically to the modular
// build.
//
// Source repository:
//   https://github.com/BrennenJohnston/openscad-plug-puller
//
// License: PolyForm Noncommercial 1.0.0
//   https://polyformproject.org/licenses/noncommercial/1.0.0/
//   Personal, hobby, educational, research, and other noncommercial use is
//   permitted. Contact the maintainer for commercial use.
// =============================================================================

// Plug Puller — two-sided puller: two identical plates that zip-tie face to face around a plug. Print both plates, flip one over.
//
// Coordinate frame (plate; docs/Plug_Puller_Reference.md section 3.2):
//   X = 0 at the mirror line between the two arms (midline), positive right
//   Y = 0 at the cord end, positive along the arms toward the plug / arm tip
//   Z = 0 at the outer face (the print bed), positive toward the
//       plug-contact face at Z = plate_thickness
//
// License: PolyForm Noncommercial 1.0.0

/* [Step 1 - Your Plug] */
// Pick your plug if it is on this list and every number below fills in, including its sides. Otherwise leave Measure my plug and type four numbers.
plug_preset = "Measure my plug"; // [Measure my plug, Heavy-duty extension cord - NEMA 5-15, USB-C laptop tip, Flat 2-prong lamp plug - NEMA 1-15, Standard 3-prong plug - NEMA 5-15]
// How far the plug body sticks out, from the surface it plugs into to the plug's back end where the cord starts. On a laptop or charger, measure from the device's edge. Skip if you picked a plug preset. (mm)
measure_plug_length = 25.5; // [12:0.5:85]
// Plug width at the PRONG END: the size the two plates will close across, measured across the plug body just behind the prongs. On a USB-C or charger tip, just behind the metal tip. (mm)
measure_plug_width_prong_end = 20; // [5:0.5:40]
// Plug width at the CORD END: the same direction, measured where the cord leaves the plug body. Skip the soft rubber strain relief. (mm)
measure_plug_width_cord_end = 20; // [5:0.5:40]
// Measure the cord just behind the plug, across its THIN side (flat lamp cord: the narrow way; round cord: the diameter). Skip if you picked a plug preset. (mm)
measure_cord_thickness = 4; // [1.5:0.5:12]
// Look at the plug body where the plates will grip it. Rounded sides: a round cord plug, a USB-C or charger tip; the plates get a sloped cradle that centers the plug and forgives a small measuring error. Flat sides: a boxy plug; the plates stay straight so the teeth bite along the whole side. Ignored when a plug preset is chosen: presets carry their own tested grip.
plug_sides = "Rounded sides"; // [Rounded sides, Flat sides]
// Show a see-through plug built from these numbers in the preview so you can check the fit. It is never part of the exported file. MakerWorld shows the finished plates only.
show_plug_preview = true;

/* [Step 2 - Size] */
// Pick the hand size. Medium fits most adults. Measure my hand builds the finger holes from the number below.
size = "Medium"; // [Small, Medium, Large, Measure my hand]
// Used only when Size = "Measure my hand". Measure across the WIDEST knuckle of your middle finger - the finger that goes in the pull hole. No caliper? A snugly fitting ring's inner diameter + 1.5 mm works too. (mm)
measure_finger_width = 20; // [14:0.5:32]

/* [Step 3 - Attachment] */
// Zip ties hold the two plates together around the plug; a velcro strap can go through a slot in each arm as well. On a short plug there is no room for the slot and it is left out.
attachment = "Zip ties + Velcro strap"; // [Zip ties + Velcro strap, Zip ties]
// Width of the hook-and-loop strap you will thread through the arm slots; check the packaging. ONE-WRAP comes in 10, 13, 16, 20 and 25 mm. (mm)
strap_width = 15; // [10:1:25]

/* [Step 4 - Print Layout] */
// Both plates puts the two identical plates side by side so one file prints the whole tool. After printing, flip one plate over and zip-tie the pair face to face around the plug.
print_layout = "Both plates"; // [Both plates, One plate]

/* [Advanced - Two-Sided Puller] */
// STRENGTH DIAL - the one Advanced dial worth knowing even as a beginner. Adds this many millimeters of plastic to EVERY wall around the plate's inner openings at once (finger-hole walls, cord-channel web, velcro-slot walls, zip-tie webs). The plate outline grows and the openings shift or shrink automatically so nothing collides - one slider makes the whole plate denser and stronger. 0 = the reference walls. (mm)
plate_wall_boost = 0; // [0:0.25:5]
// Thickness of each plate. The two identical plates meet face to face around the plug, so the finished sandwich is twice this. (mm)
plate_thickness = 4; // [2:0.25:8]
// Flat sides and plug presets only. Grip clearance per side against the plug width. NEGATIVE squeezes the plug so the teeth bite (recommended); 0 = exact fit; positive = loose. The gap between the arms follows the plug's width at the prong end and at the cord end, plus 2x this. (mm)
plate_grip_bite = -1; // [-2:0.1:2]
// Rounded sides only. How much narrower the gap is on each side at the outer face of each plate than where the plates meet; deeper = a steeper cradle. 0 = straight edge. (mm)
plate_cradle_depth = 2.5; // [0:0.25:3.5]
// Rounded sides only. Extra room added to the plug width where the plates meet. A small positive value lets a hard plug drop in flat; the cradle does the holding. (mm)
plate_grip_clearance = 0.5; // [0:0.1:2]
// Extra width added to the cord channel beyond the measured cord thickness, so the cord slides in freely. (mm)
plate_cable_clearance = 0.8; // [0:0.1:5]
// Finger-hole fit: bore = your finger width + this. Kept tighter than on the one-sided puller so the pull is secure. (mm)
plate_finger_fit = 1; // [0:0.25:8]
// Wall of plastic around each finger hole out to the plate edge - sets the size of the rounded finger lobes. plate_wall_boost is added on top. (mm)
plate_finger_wall = 5.0; // [3:0.25:12]
// Inner wall between the cord channel and each finger hole. plate_wall_boost is added on top. (mm)
plate_finger_inner_wall = 3.0; // [1:0.25:8]
// Diameter of each gripper tooth along the plug-contact edge. 0 = smooth edge with no teeth. (mm)
plate_tooth_diameter = 2; // [0:0.1:4]
// Center-to-center spacing of the gripper teeth. (mm)
plate_tooth_pitch = 2.8; // [0.5:0.1:5]
// How deep each tooth bites into the arm's gripping edge. Deeper teeth grip soft plug bodies harder. (mm)
plate_tooth_depth = 1; // [0:0.05:1.5]
// Where the toothed zone begins, measured back from the arm tips toward the cord. (mm)
plate_grip_zone_start = 4; // [0:0.5:25]
// Length of the toothed zone along each arm. 0 = auto (recommended): the teeth cover the full plug body span, however long your plug is. Set a value to override the span manually. (mm)
plate_grip_zone_length = 0; // [0:1:60]
// Extra opening of the grip gap right at the arm tips (total, across both arms) so the plug head can enter the V before the teeth bite. (mm)
plate_tip_flare = 0.7; // [0:0.1:4]
// Width of each arm at its rounded tip. (mm)
plate_arm_tip_width = 11; // [5:0.5:16]
// Roundover radius of the plate's outer-face edge for comfort; the plug-contact face stays square. 0 = sharp. (mm)
plate_edge_rounding = 1.2; // [0:0.1:2]
// Thickness of the thin cable strip that bridges the cord channel on the outer face and keeps the two arms tied together. 0 = no strip. (mm)
plate_strip_thickness = 1; // [0:0.25:4]
// Diameter of the zip-tie holes (3 per arm). 0 = no zip holes. (mm)
plate_zip_hole_diameter = 4; // [0:0.1:8]
// Where the 3 zip-tie stations per arm sit. Auto (recommended) spaces them along the arm and keeps them clear of everything else; Manual uses the position dials below.
plate_zip_placement = "Auto"; // [Auto, Manual]
// Manual placement only: zip station 1 distance from the cord end along the arm. (mm)
plate_zip_pos_1 = 4; // [0:0.5:80]
// Manual placement only: zip station 2 distance from the cord end. (mm)
plate_zip_pos_2 = 32; // [0:0.5:80]
// Manual placement only: zip station 3 distance from the cord end. (mm)
plate_zip_pos_3 = 63; // [0:0.5:80]
// Wall of plastic between the toothed gripping edge and the velcro slot beside it, measured from the DEEPEST tooth bite - so enlarging the teeth never silently thins this wall. Raise it to beef up that boundary alone. plate_wall_boost is added on top. (mm)
plate_slot_inner_wall = 2.2; // [1:0.1:8]
// Width of the velcro / material-reduction slot in each arm. 0 = no slot. (mm)
plate_velcro_slot_width = 9.3; // [0:0.25:20]
// Length of the velcro / material-reduction slot along the arm. (mm)
plate_velcro_slot_length = 28; // [5:1:60]

/* [Advanced - Render Quality] */
// How many segments make up each circle. The default 64 is already print-ready; drop to 32 for faster previews, raise to 96+ only for very large exports. Higher = smoother but slower to render.
quality = 64; // [24:8:128]

/* [Hidden] */
render_mode = "Full"; // [Full, One plate]

// Epsilon — tiny overlap added wherever two solid faces would otherwise be
// perfectly coincident (coplanar). Without it, the OpenSCAD CGAL kernel can
// leave paper-thin "ghost walls" at the shared boundary because it cannot
// decide which solid owns the face. Every pocket cutter is expanded by eps
// in each relevant direction, and every through-cut is extended by eps above
// and below the body so the boolean difference cleanly removes material.
// The value is small enough (0.01 mm) that it never produces a visible gap in
// the exported STL — the part always exports as a single joined solid
// suitable for slicing without repair.
eps = 0.01;

// ── ===========================================================================
// ── BEGIN: fit_sizes.scad (inlined by scripts/build_flattened.py)
// ── ===========================================================================
// =============================================================================
// fit_sizes.scad — size table and finger clearance shared by both tool files
// =============================================================================
//
// The Small / Medium / Large hand pairs and the finger-hole clearance, kept in
// one small file so the two-sided puller can use them without including the
// one-sided puller's derivation layer.
//
// Include order: every main file includes this file FIRST (before
// fit_measured.scad), because OpenSCAD evaluates top-level assignments in
// source order and the derivations read these constants.
//
// Keep tests/fit_formulas.py (FIT_SIZE_TABLE, FIT_GRIP_CLEARANCE) in sync.
//
// License: PolyForm Noncommercial 1.0.0

/* [Hidden] */

// Finger-hole bore = knuckle width + this. Reference: 1" bore (25.4) for the
// designer's 20 mm finger -> +5.4. Also absorbs FDM hole undersizing.
FIT_GRIP_CLEARANCE = 5.4;

// Size table: hand pair per size (ANSUR II 2012 hand breadth + Rogers 2008
// PIP-joint breadth). Small ~5th %ile female, Medium = calibration anchor
// (~combined 50th %ile), Large ~95th %ile male.
FIT_SIZE_FINGER_S = 16.5;  FIT_SIZE_HAND_S = 72;
FIT_SIZE_FINGER_M = 20;    FIT_SIZE_HAND_M = 85;
FIT_SIZE_FINGER_L = 23;    FIT_SIZE_HAND_L = 96;
// ── ===========================================================================
// ── END: fit_sizes.scad (inlined by scripts/build_flattened.py)
// ── ===========================================================================

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
// Plug preset -> effective plug measurements. Each preset carries the
// numbers measured on its reference plug: the heavy-duty cord (the same
// numbers as the one-sided file's prefill), the USB-C laptop tip (the
// owner's measured and printed set), and the lamp and standard plugs (their
// one-sided preset numbers; the plates close across the plug's wider face,
// so the two-sided widths are those plugs' widths). "Measure my plug" keeps
// the Step 1 sliders authoritative.
_pp_active = (plug_preset != "Measure my plug");
_eff_plug_length =
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 43.8 :
    plug_preset == "USB-C laptop tip"                        ? 23.0 :
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 37.0 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 46.2 :
    measure_plug_length;
_eff_plug_width_prong_end =
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 27.0 :
    plug_preset == "USB-C laptop tip"                        ? 13.0 :
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 25.0 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 26.6 :
    measure_plug_width_prong_end;
_eff_plug_width_cord_end =
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 27.0 :
    plug_preset == "USB-C laptop tip"                        ? 13.0 :
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 11.2 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 13.4 :
    measure_plug_width_cord_end;
_eff_cord_thickness =
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 8.2 :
    plug_preset == "USB-C laptop tip"                        ? 7.0 :
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 3.6 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 7.0 :
    measure_cord_thickness;

// Zip ties are what hold the two plates together, so every choice keeps them.
_attach_zip    = true;
_attach_velcro = (attachment == "Zip ties + Velcro strap");
strap_width_eff = max(8, min(strap_width, 30));
_is_clamshell = true;
// Each preset carries its own sides: the heavy-duty cord keeps the straight
// edge and the bite (its plate is the golden fixture), the USB-C tip builds
// the cradle the owner printed and tested, and the lamp and standard plugs
// are boxy. "Measure my plug" follows the Step 1 dropdown.
_preset_sides =
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? "Flat sides" :
    plug_preset == "USB-C laptop tip"                        ? "Rounded sides" :
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? "Flat sides" :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? "Flat sides" :
    plug_sides;
_sides_eff = _pp_active ? _preset_sides : plug_sides;

// Size -> finger bore straight from the size table: bore = finger width +
// FIT_GRIP_CLEARANCE, clamped 15-40 mm like the one-sided D-9.
_2s_finger_width = size == "Small"  ? FIT_SIZE_FINGER_S :
                   size == "Medium" ? FIT_SIZE_FINGER_M :
                   size == "Large"  ? FIT_SIZE_FINGER_L :
                   measure_finger_width;
_2s_finger_hole_diameter = max(15, min(_2s_finger_width + FIT_GRIP_CLEARANCE, 40));

echo(str("TOOL: Two-sided puller"));

// ═══════════════════════════════════════════════════════════════════════════════
// CLAMSHELL DERIVED VALUES
// ═══════════════════════════════════════════════════════════════════════════════
// Local plate frame: X mirrored about 0, Y = 0 at the cord end, +Y toward the
// plug/arm tip; extruded +Z to plate_thickness (Z = 0 = the OUTER face,
// Z = thickness = the plug-contact face). Calibrated to the idealized
// heavy-duty plate (66.6 x 73.7 x 4.5, goggle lobes tangent to Y = 0, arms
// tapering to ~9 mm rounded tips); see scripts/measure_clamshell_ideal.py.

// Finger width recovered from the size-table bore (bore = finger width +
// FIT_GRIP_CLEARANCE) so the fit tracks the Size selection.
_clam_finger_width = max(10, _2s_finger_hole_diameter - FIT_GRIP_CLEARANCE);
_clam_finger_dia   = _clam_finger_width + plate_finger_fit;                 // ~21.0

// Effective walls — the plate_wall_boost strength dial is added to EVERY
// wall/web around the inner openings, so one slider densifies the whole
// plate: the outline grows outward while the openings shift or shrink to
// keep their (boosted) webs. The velcro slot's inner wall is additionally
// measured from the deepest tooth bite (the serrations scallop
// plate_tooth_depth into the very edge the slot sits behind), so
// plate_slot_inner_wall is a true tooth-root-to-slot thickness.
_clam_teeth_on        = plate_tooth_diameter > 0 && plate_tooth_depth > 0;
_clam_finger_wall_eff = plate_finger_wall + plate_wall_boost;
_clam_inner_wall_eff  = plate_finger_inner_wall + plate_wall_boost;
_clam_slot_in_wall    = plate_slot_inner_wall + plate_wall_boost
                        + (_clam_teeth_on ? plate_tooth_depth : 0);
_clam_slot_out_wall   = 2.2 + plate_wall_boost;

// Inner-edge gaps. The cord channel hugs the cord; the plug zone hugs the
// plug's OWN two-station width profile with a (usually negative) bite so
// the arms squeeze it: half-gap at the head (arm tips = the prong end of the
// plug) comes from the prong-end width, half-gap at the plug's back end from
// the cord-end width, interpolated linearly in between. Each station is floored
// 1 mm outside the cable channel so the V can never pinch shut on the cord.
_clam_cable_gap = max(2, _eff_cord_thickness + plate_cable_clearance);      // ~9.0
_clam_cable_hw  = _clam_cable_gap / 2;
// Grip per side against the plug's width at the face where the plates meet.
// Rounded sides get a small clearance and the cradle below does the holding;
// Flat sides and presets squeeze the plug with the bite. One name for it, so
// the half-gaps below and the WC-12 check can never disagree.
_grip_term      = (_sides_eff == "Rounded sides") ? plate_grip_clearance / 2
                                                  : plate_grip_bite;
_clam_hw_wall   = max(_clam_cable_hw + 1,
                      _eff_plug_width_prong_end / 2 + _grip_term);           // ~12.5 (HD)
_clam_hw_cable  = max(_clam_cable_hw + 1,
                      _eff_plug_width_cord_end / 2 + _grip_term);
// Cradle (Rounded sides): the gap narrows by this much per side from the
// mating face down to the outer face, so two plates form a diamond channel.
// Guard: the outer-face gap may come down to the cord channel's width but
// never below it, and the step-in never exceeds the plate. 0 = today's
// straight edge.
_cradle_eff     = (_sides_eff == "Rounded sides")
    ? max(0, min(plate_cradle_depth, plate_thickness,
                 min(_clam_hw_wall, _clam_hw_cable) - _clam_cable_hw))
    : 0;

// Finger ("goggle") lobe at the cord end. The lobe radius is the finger bore
// radius + wall, and the lobe center sits exactly one lobe radius above Y = 0,
// so the lobe is tangent to the cord-end edge — as on the ideal plate.
_clam_lobe_r   = _clam_finger_dia / 2 + _clam_finger_wall_eff;             // ~15.5
_clam_finger_y = _clam_lobe_r;                                             // ~15.5
_clam_finger_x = _clam_cable_hw + _clam_inner_wall_eff + _clam_finger_dia / 2;
_clam_outer_x  = _clam_finger_x + _clam_finger_dia / 2 + _clam_finger_wall_eff; // ~33.5

// Inner-edge V zones (from the cord end): cable channel -> throat ramp ->
// the plug's own thickness profile, with a slight flare at the tip so the
// plug head can enter the V. The plug body spans [_clam_y_back, _clam_length]
// (its wall face rides at the arm tips), so the throat — where the V closes
// down to the cable channel — derives from where the plug actually ends
// instead of sitting at a fixed run from the cord end. The arm length grows
// with the plug: at least a (throat_y0 + 2) cord/mouth run below the plug's
// back end, and at least the room the (manual) serration zone asks for.
_clam_throat_y0 = _clam_finger_y + _clam_finger_dia / 2 + 2;               // ~28.0
_clam_y_back_min = _clam_throat_y0 + 2;                                    // ~30.0
_clam_length    = max(_clam_y_back_min + plate_grip_zone_start
                          + (plate_grip_zone_length > 0
                                 ? plate_grip_zone_length : 0) + 12,
                      _eff_plug_length + 11,
                      _clam_y_back_min + _eff_plug_length);                // ~73.8 (HD)
_clam_y_back    = _clam_length - _eff_plug_length;                         // ~30.0 (HD)
// Serration span: 0 = auto — cover the full plug body span (back end up to
// plate_grip_zone_start behind the tips); a positive slider value overrides.
_clam_grip_len_eff = (plate_grip_zone_length > 0)
    ? plate_grip_zone_length
    : max(0, _clam_length - plate_grip_zone_start - _clam_y_back);
_clam_grip_y0   = max(_clam_y_back,
                      _clam_length - plate_grip_zone_start - _clam_grip_len_eff);
_clam_tip_hw    = _clam_hw_wall + plate_tip_flare / 2;                      // ~12.9

// Plug-profile half-gap at a given Y (valid on [_clam_y_back, _clam_length]):
// the plug's own thickness interpolated between the two Step 1 stations,
// plus the grip bite per side.
function _clam_plug_hw(y) =
    let (f = (y - _clam_y_back) / max(eps, _eff_plug_length))
    _clam_hw_cable + (_clam_hw_wall - _clam_hw_cable) * f;

// Right-half arm inner-edge X at a given Y: cable channel, then the throat
// ramp up to the plug's back end, then the plug profile (+ tip flare from
// the serration-zone start).
function _clam_inner_x(y) =
    (y <= _clam_throat_y0) ? _clam_cable_hw :
    (y <= _clam_y_back)    ? _clam_cable_hw
        + (_clam_plug_hw(_clam_y_back) - _clam_cable_hw)
            * (y - _clam_throat_y0) / max(eps, _clam_y_back - _clam_throat_y0) :
    _clam_plug_hw(y)
        + ((y > _clam_grip_y0)
               ? (plate_tip_flare / 2) * (y - _clam_grip_y0)
                     / max(eps, _clam_length - _clam_grip_y0)
               : 0);

// Arm tip: a rounded tip hugging the flared inner edge at the outer face
// (stepped in by the cradle, so the arm carries the slope to its tip). The
// arm is the 2D hull of the goggle lobe, the mid-arm bulge circle (below),
// and this tip circle, so it tapers like the ideal.
_clam_tip_r  = plate_arm_tip_width / 2;                                     // ~5.5
_clam_tip_cx = _clam_tip_hw - _cradle_eff + _clam_tip_r;                   // ~18.4
_clam_tip_cy = _clam_length - _clam_tip_r;                                 // ~68.3

// Zip stations along the arm (Y from the cord end). Auto: rear beside the
// cable channel, mid just past the plug's back end (where the throat mouth
// ends), tip centered in the arm tip. Manual uses the dials.
// Step 3's `attachment` gates the stations on/off (zip ties are what cinch
// the two plates together); `plate_zip_hole_diameter` stays the sizing dial
// and 0 still disables them.
_clam_zip_r      = plate_zip_hole_diameter / 2;
_clam_zip_on     = _attach_zip && plate_zip_hole_diameter > 0;
// Rear station: beside the cable channel, but never closer than a 1.6 mm
// (+ boost) radial wall to the finger bore (small hands pull the bore down
// toward it).
_clam_zip_rear_x    = _clam_cable_hw + _clam_zip_r + 2.6 + plate_wall_boost;
_clam_zip_rear_keep = _clam_finger_dia / 2 + _clam_zip_r + 1.6 + plate_wall_boost;
_clam_zip_rear_dx   = _clam_finger_x - _clam_zip_rear_x;
_clam_zip_rear_ymax = _clam_finger_y
    - sqrt(max(0, _clam_zip_rear_keep * _clam_zip_rear_keep
                  - _clam_zip_rear_dx * _clam_zip_rear_dx));
_clam_zip_auto   = [
    max(_clam_zip_r + 1.5, min(0.05 * _clam_length, _clam_zip_rear_ymax)),
    _clam_y_back + _clam_zip_r + 0.5,
    _clam_length - _clam_tip_r - _clam_zip_r - 0.6,
];
_clam_zip_manual = [plate_zip_pos_1, plate_zip_pos_2, plate_zip_pos_3];
_clam_zip_y      = (plate_zip_placement == "Manual") ? _clam_zip_manual : _clam_zip_auto;

// Velcro / material-reduction slot: a stadium anchored just outboard of the
// serrated inner edge at the slot's TOP end (the arm's narrowest
// cross-section within the slot span), spanning the window BETWEEN the mid
// and tip zip stations (2 mm + boost web to each) so the slot can never
// collide with a zip hole in Auto placement. The requested length is
// honored when the window allows it. The inner offset is the effective
// tooth-root wall (_clam_slot_in_wall).
_clam_slot_y0_raw = _clam_zip_y[1] + _clam_zip_r + 2 + plate_wall_boost;
_clam_slot_y1_raw = _clam_zip_y[2] - _clam_zip_r - 2 - plate_wall_boost;
_clam_slot_window = _clam_slot_y1_raw - _clam_slot_y0_raw;
// The Step 3 strap threads through this slot along its length, so the
// requested slot length is floored at strap_width_eff + 1.5 mm of clearance
// (defaults: 28 >= 16.5, so default geometry is unchanged).
_clam_slot_len    = min(max(plate_velcro_slot_length, strap_width_eff + 1.5),
                        max(6, _clam_slot_window));
_clam_velcro_y    = (_clam_slot_y0_raw + _clam_slot_y1_raw) / 2;
_clam_slot_top_y  = _clam_velcro_y + _clam_slot_len / 2;
// Width capped so the slot plus its inner (tooth-root) and outer walls fits
// inside the plate's half-width at the goggle lobe (the bulge below never
// widens the envelope).
_clam_slot_w      = min(plate_velcro_slot_width, _clam_slot_len,
                        _clam_outer_x - _clam_inner_x(_clam_slot_top_y)
                            - _clam_slot_in_wall - _clam_slot_out_wall);
_clam_velcro_x    = _clam_inner_x(_clam_slot_top_y) + _clam_slot_in_wall
                        + _clam_slot_w / 2;
// Step 3's `attachment` gates the slot; `plate_velcro_slot_width` stays the
// sizing dial (0 still disables it, and the arm slims automatically). In Auto
// placement a window too short for the strap leaves the slot out (a preview
// note says so) instead of cutting a slot that runs into the zip stations;
// Manual placement keeps the slot where the stations put it, and WC-7 / WC-11
// flag any collision.
_clam_slot_fits   = plate_zip_placement == "Manual"
                    || _clam_slot_window >= max(6, strap_width_eff + 1.5);
_clam_slot_on     = _attach_velcro && plate_velcro_slot_width > 0
                        && _clam_slot_w >= 3 && _clam_slot_fits;
_clam_slot_left_out = _attach_velcro && plate_velcro_slot_width > 0
                        && !_clam_slot_fits;

// Mid-arm bulge: a hull control circle wrapped _clam_slot_out_wall outside
// the slot's top cap, so the tapered arm always carries the slot with a
// printable wall. The ideal plate's outer edge has the same convex bulge
// around its slots.
_clam_mid_r  = _clam_slot_w / 2 + _clam_slot_out_wall;
_clam_mid_cx = _clam_velcro_x;
_clam_mid_cy = _clam_slot_top_y - _clam_slot_w / 2;

// Widest point of the plate from the mirror line: the finger lobes, unless a
// very wide plug pushes the arm tips (or the slot bulge) further out. The
// pair layout spaces the two plates by this so they can never touch.
_clam_half_width = max(_clam_outer_x, _clam_tip_cx + _clam_tip_r,
                       _clam_slot_on ? _clam_mid_cx + _clam_mid_r : 0);

// Outer-edge X at a given Y: piecewise chord lobe -> bulge -> tip. The true
// hull boundary lies slightly outboard of these chords, so this is a safe
// (conservative) inner bound for keeping holes inside the tapered arm.
function _clam_outer_x_at(y) =
    let (x1 = _clam_outer_x,               y1 = _clam_finger_y,
         xm = _clam_slot_on ? _clam_mid_cx + _clam_mid_r : x1,
         ym = _clam_slot_on ? _clam_mid_cy : y1,
         x3 = _clam_tip_cx + _clam_tip_r,  y3 = _clam_tip_cy)
    (y <= y1) ? x1 :
    (_clam_slot_on && y <= ym)
        ? x1 + (xm - x1) * (y - y1) / max(eps, ym - y1) :
    (y >= y3) ? x3 :
    xm + (x3 - xm) * (y - max(ym, y1)) / max(eps, y3 - max(ym, y1));

// Station X: rear/mid hug the inner edge with a printable web (+ boost);
// the tip station centers on the arm axis. Every station is capped inside
// the tapered outer edge; if the arm is too narrow, the hole centers in it.
function _clam_zip_x(i, y) =
    let (xin  = _clam_inner_x(y) + _clam_zip_r + 2.6 + plate_wall_boost,
         xout = _clam_outer_x_at(y) - _clam_zip_r - 2.0 - plate_wall_boost,
         xc   = (_clam_inner_x(y) + _clam_outer_x_at(y)) / 2)
    (xout <= xin) ? (xin + xout) / 2 :
    (i == 2)      ? min(max(xc, xin), xout) :
                    min(xin, xout);
_clam_zip_pts = [for (i = [0 : 2]) [_clam_zip_x(i, _clam_zip_y[i]), _clam_zip_y[i]]];

// Signed clearance from a point to the slot's stadium boundary (negative =
// inside). Used by the WC overlap warning for Manual zip placements.
function _clam_slot_zip_clear(p) =
    let (seg = max(0, _clam_slot_len / 2 - _clam_slot_w / 2),
         dx  = p[0] - _clam_velcro_x,
         dy  = max(abs(p[1] - _clam_velcro_y) - seg, 0))
    sqrt(dx * dx + dy * dy) - _clam_slot_w / 2;

echo("=== Two-sided puller derived values (mm) ===");
echo(str("  plate length = ", _clam_length));
echo(str("  grip gap at the prong end = ", 2 * _clam_hw_wall));
echo(str("  grip gap at the cord end = ", 2 * _clam_hw_cable));
echo(str("  cradle depth per side = ", _cradle_eff));
echo(str("  cord channel = ", _clam_cable_gap));
echo(str("  finger hole = ", _clam_finger_dia));
echo(_clam_slot_on ? str("  strap slot = ", _clam_slot_len, " long, ", _clam_slot_w, " wide")
   : _clam_slot_left_out ? "  strap slot = left out, the plug is too short for one"
   : "  strap slot = none");
echo(str("  zip stations from the cord end = ", _clam_zip_y));

// ═══════════════════════════════════════════════════════════════════════════════
// WARNINGS
// ═══════════════════════════════════════════════════════════════════════════════
WARNING_TEXT_SIZE  = 4.5;
WARNING_TEXT_DEPTH = 1.0;
WARNING_LINE_GAP   = WARNING_TEXT_SIZE + 2;

// -- WC-1 … WC-11: heavy-duty clamshell checks ---------------------------------
// Cord doesn't fit the cable channel with clearance to spare.
function _vw_clam_cord_channel() =
    _clam_cable_gap - _eff_cord_thickness < 0.5;
// Plug so wide the tapered arm inverts (tip circle outboard of the lobes).
function _vw_clam_arm_thin() =
    _clam_tip_cx + _clam_tip_r > _clam_outer_x - 1;
// No interference bite — a non-negative bite means the plug isn't squeezed.
// Rounded sides ignore the bite (the cradle holds the plug).
function _vw_clam_no_bite() =
    _sides_eff == "Flat sides" && plate_grip_bite >= 0;
// Plate too thin to be stiff / printable as a grip.
function _vw_clam_plate_thin() =
    plate_thickness < 2;
// A zip station sits off the arm (before the cord end or past the tip).
function _vw_clam_zip_off_arm() =
    _clam_zip_on
    && min([for (y = _clam_zip_y) min(y - _clam_zip_r,
                                      _clam_length - y - _clam_zip_r)]) < 0;
// Two zip stations overlap each other (mis-set Manual positions).
function _vw_clam_zip_overlap() =
    _clam_zip_on
    && min([for (i = [0 : 1], j = [i + 1 : 2])
                let (dx = _clam_zip_pts[i][0] - _clam_zip_pts[j][0],
                     dy = _clam_zip_pts[i][1] - _clam_zip_pts[j][1])
                sqrt(dx * dx + dy * dy)])
       < plate_zip_hole_diameter + 0.6;
// A zip station breaks into the velcro slot (Manual placements; Auto derives
// the slot window between the mid and tip stations, so it cannot collide).
function _vw_clam_zip_hits_slot() =
    plate_zip_placement == "Manual" && _clam_zip_on && _clam_slot_on
    && min([for (p = _clam_zip_pts) _clam_slot_zip_clear(p)])
       < _clam_zip_r + 0.5;
// The plug body pushed the derived arm run past a printable plate length
// (the arms always cover the full plug, so a very long plug on big-hand
// finger lobes can outgrow common build plates).
function _vw_clam_plug_too_long() =
    _clam_length > 120;
// The two width stations describe an implausibly steep taper — more
// than ~20 degrees per side is almost certainly a mis-measurement.
function _vw_clam_taper_steep() =
    abs(_eff_plug_width_prong_end - _eff_plug_width_cord_end) / 2
        > tan(20) * max(1, _eff_plug_length);
// WC-10 — Step 3 turned the zip stations off on a clamshell build. Zip ties
// are what cinch the two plates together, so without them nothing holds the
// sandwich closed.
function _vw_clam_no_zip_attachment() =
    _is_clamshell && !_attach_zip;
// WC-11 — the strap is wider than the slot window the arm can offer, so the
// Step 3 strap won't thread through even after the strap-width floor.
function _vw_clam_strap_too_wide() =
    plate_zip_placement == "Manual"
    && _clam_slot_on && _clam_slot_len < strap_width_eff + 1;
// WC-12 — the cord-channel floor, not the plug, set a station's gap, and the
// plug is narrower than that gap, so the arms cannot touch it there.
function _vw_clam_plug_narrow() =
    let (floor_hw = _clam_cable_hw + 1)
    (_eff_plug_width_prong_end / 2 + _grip_term < floor_hw
         && _eff_plug_width_prong_end < 2 * floor_hw)
    || (_eff_plug_width_cord_end / 2 + _grip_term < floor_hw
         && _eff_plug_width_cord_end < 2 * floor_hw);
// WC-13 — the depth guard made the cradle shallower than plate_cradle_depth
// asks for, because the plug is narrow next to its cord channel.
function _vw_clam_cradle_clamped() =
    _sides_eff == "Rounded sides" && _cradle_eff < plate_cradle_depth - 0.01;

// Heavy-duty clamshell warnings, in the clamshell's own local frame. Same
// red-coupon + console-mirror convention as validation_warnings().
module clamshell_warnings() {
    _messages = [
        for (entry = [
            [_vw_clam_cord_channel(),
             "CORD TOO THICK FOR CABLE CHANNEL"],
            [_vw_clam_arm_thin(),
             "PLUG TOO WIDE - ARMS BULGE PAST FINGER LOBES"],
            [_vw_clam_no_bite(),
             "NO GRIP BITE - PLUG WONT BE HELD"],
            [_vw_clam_plate_thin(),
             "PLATE THINNER THAN 2MM - TOO FLIMSY"],
            [_vw_clam_zip_off_arm(),
             "ZIP STATION OFF THE ARM"],
            [_vw_clam_zip_overlap(),
             "ZIP STATIONS OVERLAP EACH OTHER"],
            [_vw_clam_zip_hits_slot(),
             "ZIP STATION HITS VELCRO SLOT"],
            [_vw_clam_plug_too_long(),
             "PLUG TOO LONG - PLATE OVER 120MM, CHECK PLUG LENGTH"],
            [_vw_clam_taper_steep(),
             "PLUG WIDTH TAPER LOOKS WRONG - RECHECK BOTH ENDS"],
            [_vw_clam_no_zip_attachment(),
             "STEP 3 DISABLED ZIP HOLES - NOTHING SECURES THE TWO PLATES TOGETHER"],
            [_vw_clam_strap_too_wide(),
             "STRAP WIDER THAN ARM SLOT WINDOW - NARROW THE STRAP"],
            [_vw_clam_plug_narrow(),
             "PLUG NARROWER THAN THE CORD CHANNEL - ARMS CANNOT TOUCH IT"],
            [_vw_clam_cradle_clamped(),
             "CRADLE SHALLOWER THAN ASKED - PLUG NARROW"],
        ]) if (entry[0]) entry[1]
    ];

    for (m = _messages)
        echo(str("WARNING: ", m));

    if (len(_messages) > 0)
        color("red")
            translate([0, _clam_length + 8, 0]) {
                linear_extrude(height = WARNING_TEXT_DEPTH)
                    text("WARNING", size = WARNING_TEXT_SIZE,
                         halign = "center", valign = "baseline", $fn = quality);
                for (i = [0 : len(_messages) - 1])
                    translate([0, (i + 1) * WARNING_LINE_GAP, 0])
                        linear_extrude(height = WARNING_TEXT_DEPTH)
                            text(_messages[i], size = WARNING_TEXT_SIZE,
                                 halign = "center", valign = "baseline", $fn = quality);
            }

    _notes = _clam_slot_left_out
        ? ["STRAP SLOT LEFT OUT - PLUG TOO SHORT FOR ONE"] : [];
    if ($preview && len(_notes) > 0)
        color("orange")
            translate([0, _clam_length + 8
                          + (len(_messages) > 0 ? (len(_messages) + 1) * WARNING_LINE_GAP : 0), 0])
                for (i = [0 : len(_notes) - 1])
                    translate([0, i * WARNING_LINE_GAP, 0])
                        linear_extrude(height = WARNING_TEXT_DEPTH)
                            text(_notes[i], size = WARNING_TEXT_SIZE,
                                 halign = "center", valign = "baseline", $fn = quality);
}

// Quarter-torus fillet for rounding a through-hole rim.
// Place at Z=0 of the face to fillet; mirror in Z for the opposite face.
module fillet_ring(hole_r, fillet_r) {
    rotate_extrude($fn = quality)
        translate([hole_r, 0])
            difference() {
                square([fillet_r, fillet_r]);
                translate([fillet_r, fillet_r])
                    circle(r = fillet_r, $fn = quality);
            }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEAVY-DUTY CLAMSHELL
// ═══════════════════════════════════════════════════════════════════════════════
// One flat plate; the "top" of the sandwich is the same plate flipped over.
// Two plates zip-tied together grip a fat plug between their serrated inner
// arms while the cord exits the narrow channel. All 2D work in the plate's
// local frame (see CLAMSHELL DERIVED VALUES).

// Right-half V gap: everything inboard of the inner-edge profile. The knots
// follow _clam_inner_x(): cable channel to the throat, the plug's back end,
// the serration-zone start (where the tip flare kicks in — emitted only when
// it sits above the back end), and the flared tip. From the throat on, the
// edge steps in by c: the cradle at one height (0 = the mating face).
module clamshell_v_gap_2d(c = 0) {
    polygon(concat(
        [
            [-1, -1],
            [_clam_cable_hw, -1],
            [_clam_cable_hw, _clam_throat_y0],
            [_clam_inner_x(_clam_y_back) - c, _clam_y_back],
        ],
        (_clam_grip_y0 > _clam_y_back + 0.01)
            ? [[_clam_inner_x(_clam_grip_y0) - c, _clam_grip_y0]]
            : [],
        [
            [_clam_tip_hw - c, _clam_length],
            [_clam_tip_hw - c, _clam_length + 1],
            [-1, _clam_length + 1],
        ]
    ));
}

// Right-half plate outline: a goggle lobe around the finger hole (tangent to
// Y = 0) hulled with the rounded arm tip — a tapered arm like the ideal —
// plus a straight channel wall beside the cable strip, minus the V gap at
// the outer face (narrowed by the cradle). A small morphological opening
// rounds the V-knee and cord-end corners.
module clamshell_half_outline_2d() {
    _r = 1.8;
    offset(r = _r) offset(delta = -_r)
        difference() {
            union() {
                hull() {
                    translate([_clam_finger_x, _clam_finger_y])
                        circle(r = _clam_lobe_r, $fn = quality);
                    // Mid-arm bulge: concentric with the velcro slot's top
                    // cap, guaranteeing the slot's outer wall
                    // (_clam_slot_out_wall) all around it.
                    if (_clam_slot_on)
                        translate([_clam_mid_cx, _clam_mid_cy])
                            circle(r = _clam_mid_r, $fn = quality);
                    translate([_clam_tip_cx, _clam_tip_cy])
                        circle(r = _clam_tip_r, $fn = quality);
                }
                // Channel wall: keeps the inner edge straight beside the
                // strip down to Y = 0 (the lobe circle alone would arc away).
                translate([_clam_cable_hw, 0])
                    square([_clam_finger_x - _clam_cable_hw, _clam_finger_y]);
            }
            clamshell_v_gap_2d(_cradle_eff);
        }
}

// Both arms (the full plate footprint).
module clamshell_outline_2d() {
    clamshell_half_outline_2d();
    mirror([1, 0, 0]) clamshell_half_outline_2d();
}

// Gripper teeth cut into the inner edge over the serration zone, measured back
// from the plug face (the tip). The span is _clam_grip_len_eff (auto = the
// full plug body span); the teeth ride _clam_inner_x() so they follow the
// plug's own taper, stepped in by c with the cradle. Empty when teeth are
// disabled.
module clamshell_serrations_2d(c = 0) {
    if (_clam_teeth_on) {
        _n = floor(_clam_grip_len_eff / plate_tooth_pitch);
        for (i = [0 : _n]) {
            _y = _clam_length - plate_grip_zone_start - i * plate_tooth_pitch;
            // Tooth circle center sits INBOARD of the edge so the scallop
            // bites exactly plate_tooth_depth into the arm (center at
            // inner - r + depth ⇒ material removed from inner to inner+depth).
            // Never below the plug's back end — the throat ramp stays smooth.
            if (_y > _clam_y_back - eps)
                translate([_clam_inner_x(_y) - c - plate_tooth_diameter / 2 + plate_tooth_depth, _y])
                    circle(d = plate_tooth_diameter, $fn = quality);
        }
    }
}

// Rounded material-reduction / velcro slot footprint (a stadium: full
// half-circle ends so the erode/dilate idiom can't collapse the width).
// Sized by the derived _clam_slot_w / _clam_slot_len (zip-safe window).
module clamshell_slot_2d() {
    _r  = _clam_slot_w / 2;
    _dy = max(0, _clam_slot_len / 2 - _r);
    hull()
        for (s = [-1, 1])
            translate([0, s * _dy]) circle(r = _r, $fn = quality);
}

// The cradle: the plug zone's gap and teeth cut in thin slices, each stepped
// in by the cradle at its mid-height, so the gap is widest at the mating face
// (Z = plate_thickness) and narrowest at the outer face, and the teeth ride
// the slope. The cable channel and strip below the throat are left alone.
module two_sided_gap_cutter_3d() {
    _t = plate_thickness;
    _n = max(6, floor(quality / 6));
    for (i = [0 : _n - 1]) {
        _z0 = _t * i / _n;
        _z1 = _t * (i + 1) / _n;
        _c  = _cradle_eff * (1 - ((_z0 + _z1) / 2) / _t);
        translate([0, 0, _z0 - eps])
            linear_extrude(height = (_z1 - _z0) + 2 * eps)
                for (s = [-1, 1])
                    scale([s, 1]) {
                        intersection() {
                            clamshell_v_gap_2d(_c);
                            translate([-1, _clam_throat_y0 + eps])
                                square([_clam_hw_wall + _clam_hw_cable + plate_tip_flare + 2,
                                        _clam_length + 2]);
                        }
                        clamshell_serrations_2d(_c);
                    }
    }
}

// One full plate (both arms + cable strip), holes and slots subtracted.
// The tool is two copies of this same plate, one flipped over — print twice.
module clamshell_plate_3d() {
    _t  = plate_thickness;
    _rb = min(plate_edge_rounding, _t / 3);
    _fr = min(1.2, _clam_finger_dia / 4, _t / 3);
    $fn = quality;
    difference() {
        union() {
            // Plate body. The outer-face (Z = 0) perimeter edge gets a ball
            // roundover — same minkowski technique as the flat tool's body —
            // while the plug-contact face (Z = _t) stays square.
            intersection() {
                linear_extrude(height = _t) clamshell_outline_2d();
                if (_rb > 0)
                    union() {
                        translate([0, 0, _rb])
                            linear_extrude(height = _t - _rb)
                                clamshell_outline_2d();
                        translate([0, 0, _rb])
                            minkowski() {
                                linear_extrude(height = max(eps, _t - _rb))
                                    offset(delta = -_rb) clamshell_outline_2d();
                                sphere(r = _rb, $fn = quality);
                            }
                    }
            }
            // Cable strip: thin bridge across the cord channel, flush with the
            // OUTER face (z = 0), overlapping 1.5 mm into each arm.
            if (plate_strip_thickness > 0)
                translate([-_clam_cable_hw - 1.5, 0, 0])
                    cube([_clam_cable_gap + 3, _clam_throat_y0,
                          min(plate_strip_thickness, _t)]);
        }
        // Finger holes (one per arm), rim-filleted on the outer face only.
        for (s = [-1, 1])
            translate([s * _clam_finger_x, _clam_finger_y, 0]) {
                translate([0, 0, -eps])
                    cylinder(d = _clam_finger_dia, h = _t + 2 * eps);
                if (_fr > 0)
                    fillet_ring(_clam_finger_dia / 2, _fr);
            }
        // Zip stations (3 per arm), gated by Step 3's attachment choice.
        if (_clam_zip_on)
            for (s = [-1, 1])
                for (p = _clam_zip_pts)
                    translate([s * p[0], p[1], -eps])
                        cylinder(d = plate_zip_hole_diameter, h = _t + 2 * eps);
        // Velcro / material-reduction slots (one per arm).
        if (_clam_slot_on)
            for (s = [-1, 1])
                translate([s * _clam_velcro_x, _clam_velcro_y, -eps])
                    linear_extrude(height = _t + 2 * eps)
                        clamshell_slot_2d();
        // Gripper serrations (both arms): the cradle cutter with Rounded
        // sides, otherwise straight through-cuts.
        if (_cradle_eff > 0)
            two_sided_gap_cutter_3d();
        else
            for (s = [-1, 1])
                translate([0, 0, -eps])
                    linear_extrude(height = _t + 2 * eps)
                        scale([s, 1]) clamshell_serrations_2d();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER MODE DISPATCH
// ═══════════════════════════════════════════════════════════════════════════════

// See-through plug for the preview only: the % background modifier keeps it
// out of every render and export. Its width follows the two Step 1 widths and
// it sits on the mating face (Z = plate_thickness), where the plug's middle
// lies once the two plates meet. Its height is 0.55 x its width, a stand-in
// for the plug's other side, which the two-sided puller never needs.
module plug_preview_2s() {
    _ratio = 0.55;
    module slice(y, w) {
        translate([0, y, plate_thickness])
            rotate([90, 0, 0])
                linear_extrude(height = 0.01, center = true)
                    if (_sides_eff == "Rounded sides")
                        scale([w / 2, _ratio * w / 2]) circle(r = 1, $fn = quality);
                    else
                        offset(r = 0.15 * _ratio * w) offset(delta = -0.15 * _ratio * w)
                            square([w, _ratio * w], center = true);
    }
    if (show_plug_preview)
        %color("SkyBlue", 0.35)
            hull() {
                slice(_clam_y_back, _eff_plug_width_cord_end);
                slice(_clam_length + 2, _eff_plug_width_prong_end);
            }
}

// Both identical plates side by side, outer face down, 8 mm apart, so one
// file prints the whole tool; one plate is flipped over when assembling.
module two_sided_pair() {
    for (s = [-1, 1])
        translate([s * (_clam_half_width + 4), 0, 0])
            clamshell_plate_3d();
}

$fn = quality;

if (render_mode == "One plate") {
    clamshell_plate_3d();
    plug_preview_2s();
    clamshell_warnings();
} else if (render_mode == "Full") {
    if (print_layout == "Both plates") {
        echo("PRINT LAYOUT: both plates side by side - flip one after printing");
        two_sided_pair();
        translate([-(_clam_half_width + 4), 0, 0]) plug_preview_2s();
    } else {
        clamshell_plate_3d();
        plug_preview_2s();
    }
    clamshell_warnings();
}
