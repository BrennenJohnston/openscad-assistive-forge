// =============================================================================
// Plug_Puller_SingleFile.scad — GENERATED FILE, DO NOT EDIT
// =============================================================================
//
// Plug Puller — one-sided puller: the flattened single-file build of
// src/Plug_Puller_Parametric.scad, with fit_sizes.scad, fit_measured.scad and
// presets.scad inlined. Generated from the canonical sources in src/ — edit
// those files, not this one.
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

// Plug Puller 0.13.0 — Parametric Generator for the one-sided puller
// The one-sided puller is the reworked v6 flat puller: a slab with a
// two-level plug pocket whose side walls follow a parametric "plug side
// rail", plus rail-placed zip-tie holes and velcro slots, finger bores, and a
// chiral J-hook cord catch. Its Medium defaults descend from the v6 Plug
// Puller ("Plug Puller 3.1 - B") but are no longer a sub-mm mesh clone.
// The two-sided puller (two plates that zip-tie around a plug) is its own file: src/Plug_Puller_Two_Sided.scad.
//
// ── Quick Start (the numbered Steps are all a beginner needs) ───────────────
//   1. Open this file in OpenSCAD (v2021.01 or later recommended)
//   2. Show the Customizer panel: View ▸ Hide Customizer — make sure it is
//      UNCHECKED (older builds: Window ▸ Customizer)
//   3. Fill in the numbered Steps top to bottom:
//        Step 1: Your plug — pick a plug preset, or measure your plug
//                (docs/guides/measuring-guide.md shows every measurement).
//        Step 2: Size — Medium is the reference; Small / Large for other
//                hands; "Measure my hand" to type two hand numbers.
//        Step 3: Attachment — how the tool straps onto the plug.
//        Step 4: Cord hook — right- or left-handed cord catch.
//   4. Press F6 to render, then File ▸ Export ▸ STL to save your print file
//
//   The Customizer is organized in three tiers:
//     "Step 1" … "Step 4"       the guided path — beginners stop here
//     "Advanced - …" sections   power dials: manual zip/velcro placement and
//                               render quality
//                               (see docs/guides/power-user-guide.md)
//     "… (Custom size only)"    expert geometry sliders, active only when
//                               Size = Custom (all measurements are ignored)
// ─────────────────────────────────────────────────────────────────────────────
//
// Coordinate frame:
//   X = 0 at horizontal midline (symmetric)
//   Y = 0 at cord/T-hook end (narrow end), positive toward plug end
//   Z = 0 at print bed, positive upward
//
// Plug side rail (the "few dials, max agency" concept):
//   A 2D line describing the plug's side edge inside the tool, defined by the
//   pocket half-width at the plug face and one `pocket_side_angle` taper.
//   Zip stations and velcro slots are positioned as (t, d) = (mm along the
//   rail from the plug face,
//   mm outward-normal offset) so one slider slides a feature coherently along
//   the plug's side. See rail_point()/rail_feature_center() below.
//
// Architecture:
//   1. Body slab: octagonal control polygon; when `body_round_bottom_only`
//      is set, the cord half is opened (offset-rounded) into the organic
//      blob of the original while the plug end stays crisp
//   2. Plug pocket: a taper-aware recess (side walls follow the plug rail,
//      rounded nose) plus a deeper circular seat disc centered on the top
//      edge (partial-depth cuts; no fill pieces needed)
//   3. Subtract feature cutouts (holes, notches, slots)

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMIZER PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════════
// UI tiers (file order = Customizer order):
//   Steps 1-4                    the guided beginner path
//   "Advanced - …"               power dials for experienced users
//   [Hidden]                     programmatic switches, not shown in the UI
//   "… (Custom size only)"       expert sliders, active only in Size = Custom

// MAINTAINER NOTE: dropdown option labels must not contain parentheses — the
// OpenSCAD Customizer fails to parse such enum values and silently reverts
// the selection to the default (MakerWorld PMM inherits this behaviour).

/* [Step 1 - Your Plug] */
// The fastest start: pick your plug from this list and every measurement below fills in automatically. Pick "Measure my plug" to type your own numbers instead - docs/guides/measuring-guide.md walks you through each one in about 5 minutes.
plug_preset = "Measure my plug"; // [Measure my plug, Flat 2-prong lamp plug - NEMA 1-15, Standard 3-prong plug - NEMA 5-15, Heavy-duty extension cord - NEMA 5-15, Wide 2-prong appliance plug - NEMA 1-15]
// How far the plug body sticks out, from the surface it plugs into to the plug's back end where the cord starts. On a wall outlet, measure from the wall plate; on a laptop or charger, from the device's edge. The tool's pocket runs this full length. Skip if you picked a plug preset. (mm)
measure_plug_length = 25.5; // [12:0.5:85]
// Plug width at the PRONG END: straight across the plastic body just behind the prongs (not the metal prongs), the WIDE way, holding the ruler parallel to the wall. On a USB-C or charger tip, just behind the metal tip. Skip if you picked a plug preset. (mm)
measure_plug_width_prong_end = 25; // [8:0.5:38]
// Plug width at the CORD END: the same wide direction, measured where the cord leaves the plug body. Skip the soft rubber strain relief. Together the two widths tell the tool which end of the plug is wider. Skip if you picked a plug preset. (mm)
measure_plug_width_cord_end = 25; // [8:0.5:38]
// Plug thickness at the PRONG END: across the plug's THIN direction (usually top to bottom on a flat plug), just behind the prongs. The thicker end sets how deep the pocket is; a plug 24 mm or thicker needs the two-sided puller file. Skip if you picked a plug preset. (mm)
measure_plug_thickness_prong_end = 20; // [4:0.5:40]
// Plug thickness at the CORD END: the same thin direction, measured where the cord leaves the plug body. Skip the soft rubber strain relief. Skip if you picked a plug preset. (mm)
measure_plug_thickness_cord_end = 20; // [4:0.5:40]
// Measure the cord just behind the plug, across its THIN side (flat lamp cord: the narrow way; round cord: the diameter). Skip if you picked a plug preset. (mm)
measure_cord_thickness = 4; // [1.5:0.5:9]
// Look at your outlet's cover plate: "Standard flat plate" = two small oval openings, "Rocker / Decora" = one big rectangle per outlet. This sets how deep the tool's end notch is so it can sit flat against the wall.
measure_wall_plate_style = "Standard flat plate"; // [Standard flat plate, Rocker / Decora, Oversized / Jumbo, No plate / flush]
// Show a see-through plug built from these numbers in the pocket in the preview so you can check the fit. It is never part of the exported file. MakerWorld shows the finished tool only.
show_plug_preview = true;

/* [Step 2 - Size] */
// Pick the hand size. Medium = the original Plug Puller and fits most adults. Small / Large cover smaller and bigger hands. "Measure my hand" builds the grip from the two numbers below. "Custom" is for experts: it ignores ALL measurements and unlocks every "(Custom size only)" slider further down.
size = "Medium"; // [Small, Medium, Large, Measure my hand, Custom]
// Used only when Size = "Measure my hand". Measure across the WIDEST knuckle of your middle finger - the finger that goes in the pull hole. No caliper? A snugly fitting ring's inner diameter + 1.5 mm works too. (mm)
measure_finger_width = 20; // [14:0.5:32]
// Used only when Size = "Measure my hand". Measure straight across the four knuckles of your flat hand, fingers together, no thumb. (mm)
measure_hand_width = 85; // [60:1:110]

/* [Step 3 - Attachment] */
// How the tool attaches to the plug. Zip ties = the 4-hole grid, Velcro strap = the angled wing slots. The original device uses both, so both is the default.
attachment = "Zip ties + Velcro"; // [Zip ties, Velcro strap, Zip ties + Velcro, None]
// Shape of the velcro strap opening. Wing = the curved openings of the original (bigger opening, less plastic). Classic slot = a simple rectangular slot.
velcro_style = "Wing"; // [Wing, Classic slot]
// Width of the hook-and-loop strap you'll thread through the openings - check the strap's packaging (ONE-WRAP comes in 10/13/16/20/25 mm). The wing opening does not change with this number; it is only compared against the strap, so a wing too narrow for it prints the W-14 tag. (mm)
strap_width = 15; // [10:1:25]

/* [Step 4 - Cord Hook] */
// Which way the tool's cord catch faces. Right = the original device. Pick whichever lets you hook the cord with your preferred hand - the hook is mirrored, nothing else changes.
hook_hand = "Right"; // [Right, Left]

/* [Advanced - Zip Tie Placement] */
// POWER USERS from here down - beginners can stop after Step 4. Where the tool's zip-tie holes sit. Auto (recommended) spaces them along the plug's side rail just outside the pocket wall and keeps them clear of every other feature. Manual places each pair with the position dials below.
zip_placement = "Auto"; // [Auto, Manual]
// How many pairs of zip-tie holes (one hole per side of the plug pocket).
zip_row_count = 2; // [1:1:3]
// Manual placement only: pair 1 distance along the plug side rail, measured from the plug face toward the cord. (mm)
zip_pos_1 = 6; // [0:0.5:55]
// Manual placement only: pair 2 distance along the rail from the plug face. (mm)
zip_pos_2 = 18; // [0:0.5:55]
// Manual placement only: pair 3 distance along the rail from the plug face. (mm)
zip_pos_3 = 30; // [0:0.5:55]
// How far outward from the pocket wall each zip-hole center sits. Raise it to pull the holes away from the pocket; the tie then threads beside the plug seat. (mm)
zip_edge_offset = 4; // [2.5:0.25:12]

/* [Advanced - Velcro Placement] */
// Where the tool's velcro strap openings sit. Auto (recommended) derives the wing region / classic-slot placement from the body. Manual slides a pair of classic slots along the plug side rail with the dial below (the Wing style always uses Auto).
velcro_placement = "Auto"; // [Auto, Manual]
// Manual placement only: slot distance along the plug side rail, measured from the plug face toward the cord. (mm)
velcro_pos = 12; // [0:0.5:55]

/* [Advanced - Render Quality] */
// How many segments make up each circle. The default 64 is already print-ready; drop to 32 for faster previews, raise to 96+ only for very large exports. Higher = smoother but slower to render.
quality = 64; // [24:8:128]

/* [Hidden] */
render_mode = "Full"; // [Full, Body Only, Body No Cutouts, Only Finger Holes, Only T Hook, Only Plug Wall Notch, Only Zip Tie Holes, Only Velcro Strap Holes, Cutouts Only 2D]

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

// Height of one layer in the stacked edge roundovers (roundover_layers_3d):
// half a typical 0.2 mm print layer, so the printed edge matches a smooth one.
ROUNDOVER_STEP = 0.1;

/* [Custom Mode] */
// EXPERT TIER. Every section below is marked "(Custom size only)" and is ignored unless Step 2's Size = Custom - in Custom, all plug/hand measurements are ignored and these sliders control the geometry directly. This switch: render once with everything reset to the Medium reference geometry (a clean baseline to diverge from), then turn it back off.
reset_custom_to_medium = false;
// Auto-fit clamps every Custom slider so features stay inside the body and keep printable walls to their neighbours; each adjustment is reported in the console. Turn OFF only when you deliberately need features past the body edge - the red warning tags will tell you what broke. The measured sizes always auto-fit.
custom_enable_auto_fit = true;

/* [Body Shape (Custom size only)] */
// Total body length along Y axis (mm) [default: 63.5]
custom_puller_length = 63.5;           // [50:0.5:120]
// Octagon width at the widest control point, BEFORE side rounding (mm) [default: 77.6]
custom_puller_bottom_width = 77.6;     // [50:0.05:120]
// Octagon corner width at the cord end, Y=0, BEFORE side rounding (mm) [default: 3]
custom_puller_bottom_corners = 3;      // [3:0.25:80]
// Width at the plug end, Y=length (mm) [default: 31.75]
custom_puller_top_width = 31.75;       // [25:0.25:80]
// Width at the midpoint between widest and plug end (mm) [default: 57.35]
custom_puller_middle_width = 57.35;    // [25:0.05:120]
// Y position of the side corners (mm) [default: 4.65]
custom_puller_side_corner = 4.65;      // [3:0.05:35]
// Slab thickness / Z extent (mm) [default: 6.35]
custom_body_thickness = 6.35;          // [4:0.05:15]
// Apply side rounding only below the middle waypoint (the original's organic cord end with a crisp plug end). Off = round the whole outline.
custom_body_round_bottom_only = true;

/* [Plug Pocket (Custom size only)] */
// Diameter of the deep circular seat centered on the top edge (mm) [default: 31.75]
custom_pocket_seat_diameter = 31.75;   // [10:0.05:45]
// Width of the plug-shaped recess (mm) [default: 28.85]
custom_pocket_width = 28.85;           // [10:0.05:45]
// How far the recess reaches from the top edge toward the finger holes (mm) [default: 24.5]
custom_pocket_depth = 24.5;            // [5:0.5:60]
// Pocket reference drop — changes no shape of the pocket: the recess is built from the plug width at the plug end and the side taper, and this reference point cancels out (mm) [default: 2.15]
custom_pocket_dome_drop = 2.15;        // [0:0.05:8]
// Floor thickness left under the deep seat; recess depth = body thickness minus this. 0 = cuts through. (mm) [default: 3.175]
custom_pocket_seat_floor = 3.175;      // [0:0.025:8]
// Floor thickness left under the plug recess; recess depth = body thickness minus this. 0 = cuts through. (mm) [default: 3.81]
custom_pocket_floor = 3.81;            // [0:0.025:12]
// Taper of the pocket side walls: degrees they slope inward from the plug face toward the cord. 0 = straight walls. Also sets the plug side rail the zip/velcro placement follows. (degrees) [default: 0]
custom_pocket_side_angle = 0;          // [-15:0.5:25]

/* [Finger Holes (Custom size only)] */
// Enable circular finger-grip holes
custom_enable_finger_holes = true;
// Diameter of each hole (mm) [default: 25.4]
custom_finger_hole_diameter = 25.4;    // [15:0.1:40]
// X-axis center-to-center distance between the two holes (mm) [default: 33]
custom_finger_hole_spacing = 33;       // [20:0.5:50]
// Y position of hole centers from the cord end (mm) [default: 19.8]
custom_finger_hole_y_position = 19.8;  // [10:0.1:50]

/* [T Hook (Custom size only)] */
// Enable T-shaped cord-wrap cutout at the narrow end
custom_enable_t_hook = true;
// Stem (narrow slot) width (mm) [default: 4.7625 = 3/16in]
custom_t_hook_base_gap = 4.7625;       // [3:0.05:10]
// Total T-hook length along Y from Y=0 (mm) [default: 10.16]
custom_t_hook_length = 10.16;          // [6:0.05:20]
// Holder crossbar width along X axis (mm) [default: 11.1125 = 7/16in]
custom_t_hook_holder_width = 11.1125;  // [8:0.05:25]
// Holder crossbar length along Y axis (mm) [default: 5.08]
custom_t_hook_holder_length = 5.08;    // [2:0.05:15]
// Hook slot inset — changes no shape of the printed tool: the J-hook cord catch is drawn without this dial; it only appears in the Cutouts Only 2D debug overlay (mm) [default: 0]
custom_t_hook_gap_offset = 0;          // [0:0.5:8]
// Hook stem side offset — moves nothing on the hook itself; it only pushes the finger holes up when the auto-fit keep-out around the hook grows with it (mm) [default: 0]
custom_t_hook_leg_offset = 0;          // [-5:0.5:5]
// J-hook stem X offset from the crossbar center — the offset stem the cord enters (mm) [default: 4.5]
custom_t_hook_stem_offset = 4.5;       // [0:0.05:8]
// J-hook catch reach — how far the crossbar extends past center on the catch side, forming the lip the cord hooks under (mm) [default: 4.55]
custom_t_hook_catch_reach = 4.55;      // [0:0.05:10]
// Hook tip drop — changes no shape: the hook slot's mouth already opens through the cord end (the body ends at Y = 0), so sagging it farther below that edge cuts only air (mm) [default: 1.98]
custom_t_hook_tip_drop = 1.98;         // [0:0.05:5]

/* [Plug Wall Notch (Custom size only)] */
// Enable rectangular notch at the plug end for outlet wall plate clearance
custom_enable_plug_wall_notch = true;
// Notch width (mm) [default: 26.67 = 1.05in]
custom_plug_wall_notch_width = 26.67;  // [5:0.01:40]
// Notch depth from the top edge (mm) [default: 3.81]
custom_plug_wall_notch_height = 3.81;  // [0:0.05:10]
// Notch bottom-corner rounding radius; 0 = sharp (mm) [default: 2.54]
custom_plug_wall_notch_rounding = 2.54; // [0:0.01:5]

/* [Zip Tie Holes (Custom size only)] */
// Diameter of each hole (mm) [default: 5.08]
custom_zip_tie_hole_diameter = 5.08;       // [2:0.02:8]
// Vertical spacing between rows (mm) [default: 17.78]
custom_zip_tie_height_spacing = 17.78;     // [5:0.02:30]
// Zip-tie column spacing — moves no zip-tie hole: the two columns follow the pocket wall; this number only feeds the auto-fit finger keep-out, which can trim the row spacing by a hair (mm) [default: 17.7]
custom_zip_tie_width_spacing = 17.7;       // [10:0.02:50]
// Distance from wall notch bottom to top row (mm) [default: 5.1]
custom_zip_tie_distance_from_notch = 5.1;  // [1:0.05:15]
// Top-face countersink flare on the exposed (lower-row) zip holes; 0 = none (mm) [default: 0.9]
custom_zip_tie_countersink = 0.9;          // [0:0.05:3]

/* [Velcro / Wing Strap Holes (Custom size only)] */
// Classic slot length along the long axis — the v4/v5 12x7 slot (mm) [default: 12]
custom_velcro_hole_length = 12;        // [6:0.5:20]
// Classic slot width along the short axis (mm) [default: 7]
custom_velcro_hole_width = 7;          // [3:0.5:14]
// X distance from centerline to each Classic slot center (wings ignore this) (mm) [default: 19.4]
custom_velcro_hole_x_center = 19.4;    // [5:0.05:35]
// Y position of Classic slot centers (wings ignore this) (mm) [default: 46]
custom_velcro_hole_y_center = 46;      // [30:0.5:80]
// Lean angle from vertical; the slots/wings lean parallel to the body's side edges (left slot CW, right slot CCW) (degrees) [default: 23.5]
custom_velcro_hole_rotation = 23.5;    // [0:0.5:180]

/* [Edge Rounding (Custom size only)] */
// Body side rounding (2D profile); 0 = straight/no rounding (mm) [default: 15.85]
custom_body_side_rounding = 15.85;     // [0:0.05:30]
// Body top rounding along Z; 0 = sharp/no rounding (mm) [default: 2.54]
custom_body_top_rounding = 2.54;       // [0:0.01:5]
// Body bottom rounding along Z; 0 = sharp/no rounding (mm) [default: 0]
custom_body_bottom_rounding = 0;       // [0:0.1:5]
// Velcro slot side rounding (2D profile); 0 = sharp/no rounding (mm) [default: 0]
custom_velcro_side_rounding = 0;       // [0:0.5:3]
// Velcro slot top/bottom Z-edge rounding; 0 = sharp/no rounding (mm) [default: 0]
custom_velcro_top_bottom_rounding = 0; // [0:0.1:3]
// Finger hole rim fillet radius; 0 = sharp/no rounding (mm) [default: 2.5]
custom_finger_hole_rounding = 2.5;     // [0:0.1:5]
// T-hook holder crossbar corner rounding; 0 = sharp/no rounding (mm) [default: 1.27]
custom_t_hook_holder_side_rounding = 1.27; // [0:0.01:3]
// Hook slot corner rounding — changes no shape of the printed tool: the J-hook cord catch draws its own corners without this dial; it only appears in the Cutouts Only 2D debug overlay (mm) [default: 0]
custom_t_hook_gap_side_rounding = 0;   // [0:0.1:3]
// T-hook top/bottom Z-edge rounding; 0 = sharp/no rounding (mm) [default: 0]
custom_t_hook_top_bottom_rounding = 0; // [0:0.1:3]

// ═══════════════════════════════════════════════════════════════════════════════
// SIZE ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
// Every non-Custom size routes through the FIT_MEASURED table computed in
// fit_measured.scad from the Step 1 plug measurements plus the hand pair
// selected by `size` (Small / Medium / Large are built-in pairs;
// "Measure my hand" uses the Step 2 sliders). "Custom" falls through to the
// `custom_*` slider values declared above. When `reset_custom_to_medium` is
// true, "Custom" is rewritten to the internal "Medium Defaults" name, which
// routes to the static PRESET_MEDIUM reference table (the measured original
// device) for one render.
//
// Include order matters (top-level assignments evaluate in source order):
// fit_sizes.scad (sizes) → fit_measured.scad, which consumes the size table,
// the effective plug measurements and the `size` inputs, and must build
// FIT_MEASURED before presets.scad's `preset_value()` can route to it.

// --- Step 1 plug preset -> effective plug measurements ---------------------
// A chosen plug preset overrides the Step 1 sliders (except when Size =
// Custom, which ignores measurements entirely). "Measure my plug" (default)
// keeps the sliders authoritative, so Medium parity holds. Preset values are
// two-station measurements taken from the reference plug STLs in
// `plug references/` by scripts/measure_plug_references.py: the plug LENGTH
// is the molded body only (wall plate to back face — the prongs live inside
// the wall), the WALL station is measured just behind the prong face, and the
// CABLE station at the cord end of the gripped body (the heavy-duty plug's
// narrower molded strain-relief boot is skipped, exactly as the Step 1
// description tells a user to). length / width wall-cable / thickness
// wall-cable / cord:
//   lamp       = 37.0 / 25.0-11.2 / 18.6-8.6  / 3.6
//   standard   = 46.2 / 26.6-13.4 / 18.9-15.0 / 7.0
//   heavy-duty = 43.8 / 25.8-21.9 / 27.0-27.0 / 8.2
// The wide 2-prong appliance plug (the owner's US vacuum plug, measured with
// a ruler) is straight-sided:
//   wide 2-prong appliance = 38.0 / 34.0-34.0 / 16.0-16.0 / 5.0
// The heavy-duty plug is 27.0 mm thick, past W-20's 24 mm limit: it belongs
// to the two-sided puller file.

/* [Hidden] */
_pp_active = (plug_preset != "Measure my plug");
_eff_plug_length =
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 37.0 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 46.2 :
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 43.8 :
    plug_preset == "Wide 2-prong appliance plug - NEMA 1-15"  ? 38.0 :
    measure_plug_length;
_eff_plug_width_wall =
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 25.0 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 26.6 :
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 25.8 :
    plug_preset == "Wide 2-prong appliance plug - NEMA 1-15"  ? 34.0 :
    measure_plug_width_prong_end;
_eff_plug_width_cable =
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 11.2 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 13.4 :
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 21.9 :
    plug_preset == "Wide 2-prong appliance plug - NEMA 1-15"  ? 34.0 :
    measure_plug_width_cord_end;
_eff_plug_thickness_wall =
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 18.6 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 18.9 :
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 27.0 :
    plug_preset == "Wide 2-prong appliance plug - NEMA 1-15"  ? 16.0 :
    measure_plug_thickness_prong_end;
_eff_plug_thickness_cable =
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 8.6 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 15.0 :
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 27.0 :
    plug_preset == "Wide 2-prong appliance plug - NEMA 1-15"  ? 16.0 :
    measure_plug_thickness_cord_end;
_eff_cord_thickness =
    plug_preset == "Flat 2-prong lamp plug - NEMA 1-15"      ? 3.6 :
    plug_preset == "Standard 3-prong plug - NEMA 5-15"       ? 7.0 :
    plug_preset == "Heavy-duty extension cord - NEMA 5-15"   ? 8.2 :
    plug_preset == "Wide 2-prong appliance plug - NEMA 1-15"  ? 5.0 :
    measure_cord_thickness;
// Plug side taper (degrees), DERIVED from the two width stations over the
// plug length — the sign automatically encodes which end of the plug is
// wider (positive = narrows toward the cord, negative = widens toward it).
// 0 at the default equal-width stations (Medium parity). Custom ignores it
// (uses custom_pocket_side_angle).
_eff_plug_side_angle =
    atan(((_eff_plug_width_wall - _eff_plug_width_cable) / 2)
         / max(1, _eff_plug_length));
// Overall plug thickness: the fatter of the two stations. Drives the pocket
// floor recesses and W-20 (a plug 24 mm or thicker belongs to the two-sided
// puller file).
_eff_plug_thickness = max(_eff_plug_thickness_wall, _eff_plug_thickness_cable);
// Plug presets don't change the wall-plate style (that's an outlet property).
_eff_wall_plate_style = measure_wall_plate_style;

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
// ── ===========================================================================
// ── BEGIN: fit_measured.scad (inlined by scripts/build_flattened.py)
// ── ===========================================================================
// =============================================================================
// fit_measured.scad — measurement → parameter derivation layer (v6.0)
// =============================================================================
//
// This file is `include`d by Plug_Puller_v6_Parametric.scad, directly ABOVE
// `include <presets.scad>`. Include order matters: OpenSCAD evaluates
// top-level assignments in source order, so
//
//   1. the `measure_*` / `size` / preset Customizer inputs (declared in the
//      main SCAD, above the include lines) must exist before the `_fit_*`
//      derivations here, and
//   2. the `FIT_MEASURED` table built here must exist before `preset_value()`
//      in presets.scad resolves any non-Custom size against it.
//
// What lives here
// ---------------
//   - Clearance / design constants calibrated against the v6.0 CAD reference
//     (`v6.0/CAD/v6.0.stl` = "Plug Puller 3.1 - B", measured by
//     scripts/extract_reference_dims.py + scripts/analyze_v6*.py). The
//     reference is inch-native: 1/4" slab, 1" finger bores, 3/16" cord stem.
//   - The "Measure my hand" passthrough; the size table itself (Small /
//     Medium / Large hand pairs, ANSUR-II grounded) lives in fit_sizes.scad.
//   - Derivations mapping the always-active plug measurements plus the hand
//     pair to every geometry parameter — including the v6 additions:
//     J-hook cord catch (D-37..D-40), wing velcro (D-41..D-42), zip
//     countersink.
//   - `FIT_MEASURED` — a [key, value] lookup table with exactly the same key
//     set as PRESET_MEDIUM (enforced by tests/test_preset_routing.py).
//   - A machine-parseable `fit_derived:` echo block.
//
// Calibration invariant (MEDIUM PARITY)
// -------------------------------------
// With `size = "Medium"` and every `measure_*` input at its default, every
// FIT_MEASURED value equals PRESET_MEDIUM's value exactly — and both equal
// the measured v6 reference geometry. Pinned at three levels:
// tests/fit_formulas.py (pure-Python mirror), the derivation echo parity
// test, and the mesh-level reference-parity test.
//
// Keep tests/fit_formulas.py in sync with every formula and constant here.
//
// No modules, no geometry — assignments and one echo block only.
//
// License: PolyForm Noncommercial 1.0.0

/* [Hidden] */

// ---------------------------------------------------------------------------
// Clearance and design constants (v6-calibrated)
// ---------------------------------------------------------------------------

// Bridge of material between the two finger holes: spacing 33 - bore 25.4.
FIT_FINGER_WEB = 7.6;

// Sliding fit of the notch over a molded plug, per side: notch 26.67
// (1.05") for the 25 mm reference plug.
FIT_SLIDE_CLEARANCE = 0.835;

// Cord slides into the hook stem with light friction: stem 4.7625 (3/16")
// for the 4 mm reference cord.
FIT_CORD_CLEARANCE = 0.7625;

// T/J-hook family ratios (exact inch fractions of the 3/16" stem):
// length 2/5" (x32/15), crossbar 7/16" (x7/3), crossbar length 1/5" (x16/15).
FIT_T_LENGTH_RATIO   = 32 / 15;
FIT_T_HOLDER_W_RATIO = 7 / 3;
FIT_T_HOLDER_L_RATIO = 16 / 15;

// Radial clearance between the finger-hole rim and the hook crossbar corner.
// v6 places the finger holes ~2 mm higher than v5 (more web behind the wider
// J-hook crossbar): calibrated so finger_hole_y derives to 21.8 at Medium.
FIT_FINGER_HOOK_CLEARANCE = 3.28;

// --- J-hook cord catch (v6) --------------------------------------------------
// The v6 reference replaces v5's symmetric T-hook with a chiral J-hook: the
// stem opening is offset toward one side, the crossbar extends past it on the
// catch side, and the stem tip sags below Y = 0 so a hooked cord cannot back
// out. Measured on v6.0.stl (right-hand device).
FIT_HOOK_STEM_OFFSET = 4.48;  // stem center X, offset from crossbar center
FIT_HOOK_CATCH_REACH = 4.55;  // crossbar left (catch) half-extent past center
FIT_HOOK_TIP_DROP    = 1.98;  // stem extends this far below Y = 0

// Wall-plate style -> notch depth. Reference: 0.15" (3.81) standard plate.
FIT_WALL_PLATE_DEPTH_STANDARD  = 3.81;
FIT_WALL_PLATE_DEPTH_DECORA    = 5.3;
FIT_WALL_PLATE_DEPTH_OVERSIZED = 6.3;
FIT_WALL_PLATE_DEPTH_NONE      = 1.5;

// Notch bottom-corner rounding: 2.54 = 0.1".
FIT_NOTCH_ROUNDING = 2.54;

// Dome pocket: seat disc diameter = notch width + this. v6 seat measures
// 30.5 = 26.67 + 3.83 (the seat no longer reaches the top corners; the wider
// body leaves ~2.6 mm shoulder ears per side).
FIT_SEAT_BEYOND_NOTCH = 3.83;

// Dome pocket: ellipse width = plug width + this. v6 widens the plug-body
// recess to 31.7 for a 25 mm reference plug (freer drop-in on the wider body).
FIT_POCKET_WIDTH_CLEARANCE = 6.7;

// Dome pocket: ellipse center sits this far below the top edge.
FIT_DOME_DROP = 2.15;

// Gap between the finger-hole top rim and the pocket's inner end. v6: 5.5
// (the finger holes sit closer to the pocket than v5's 6.5).
FIT_POCKET_FINGER_GAP = 5.5;

// Seat recess = this x plug thickness: 0.15875 x 20 = 3.175 (1/8").
FIT_RECESS_RATIO_SEAT = 0.15875;
// Pocket-body recess = this x plug thickness: 0.127 x 20 = 2.54 (1/10").
FIT_RECESS_RATIO_BODY = 0.127;
// Thinnest printable pocket floor at 0.2 mm layers.
FIT_MIN_POCKET_FLOOR = 1.5;

// Body envelope ratios — the v6 reference's own proportions (octagon control
// values are PRE-ROUNDING; body_side_rounding turns them into the organic
// outline; see scripts/fit_body_outline_v6.py, silhouette RMS ~0.15 mm).
FIT_BODY_HAND_RATIO     = 81.55 / 85;   // octagon bottom_width / hand width
FIT_BODY_CORNER_RATIO   = 3 / 81.55;    // bottom_corners / bottom_width
FIT_BODY_TOP_RATIO      = 35.75 / 81.55; // top_width / bottom_width
FIT_BODY_MIDDLE_RATIO   = 62.1 / 81.55; // middle_width / bottom_width
FIT_SIDE_CORNER_RATIO   = 5.45 / 65.5;  // side_corner / length
FIT_SIDE_ROUNDING_RATIO = 17.05 / 81.55; // side_rounding / bottom_width
FIT_THICKNESS_HAND_RATIO = 6.35 / 85;   // slab thickness / hand width

// Body top-face roundover: 2.54 = 0.1".
FIT_BODY_TOP_ROUNDING = 2.54;
// Finger-hole rim fillet.
FIT_FINGER_RIM_FILLET = 2.5;

// Hook edge rounding set (stem walls sharp; crossbar corners 1.27 = 0.05").
FIT_T_GAP_SIDE_ROUNDING    = 0;
FIT_T_HOLDER_SIDE_ROUNDING = 1.27;
FIT_T_TOP_BOTTOM_ROUNDING  = 0;

// --- Wing velcro slots (v6) --------------------------------------------------
// The v6 reference replaces v5's 12x7 rectangular slots with curved
// triangular "wing" cutouts that fill the dead space between the finger hole,
// pocket ellipse, side edge, and zip holes (measured: ~10.6 x 14.9 mm, area
// 72.5 mm^2, centroid +/-19.7 / 43.2). The wing region is built from 2D
// offsets of those neighbours; these are the web (keep-out) widths.
FIT_WING_SIDE_INSET  = 4.3;  // inset from the raw body side edge
FIT_WING_FINGER_WEB  = 5.0;  // keep-out ring outside the finger circle
FIT_WING_POCKET_WEB  = 2.5;  // web outside the pocket ellipse footprint
FIT_WING_ZIP_WEB     = 4.0;  // keep-out around each zip hole
FIT_WING_ROUND       = 1.5;  // corner rounding of the wing region

// Classic slot fallback geometry (velcro_style = "Classic slot"): the v4/v5
// 12x7 rectangular slot with its v5 placement margins. The wing style
// derives its own region and ignores these.
FIT_VELCRO_LENGTH = 12;
FIT_VELCRO_WIDTH = 7;
FIT_VELCRO_EDGE_OFFSET = 7.02;
FIT_VELCRO_POCKET_MARGIN = 6.0;  // slot center Y above the pocket end

// ONE-WRAP strap default (widths available: 10/13/16/20/25).
FIT_STRAP_WIDTH = 15;

// Zip-tie constants (measured: 0.2" holes, 0.7" row spacing). v6 adds a
// top-face countersink flare on the exposed (lower-row) holes.
FIT_ZIP_DIAMETER = 5.08;
FIT_ZIP_HEIGHT_SPACING = 17.78;
FIT_ZIP_WIDTH_SPACING = 17.7;
FIT_ZIP_DISTANCE_FROM_NOTCH = 5.1;
FIT_ZIP_COUNTERSINK = 0.9;  // Ø5.1 -> ~Ø6.9 flare at the top face

// Minimum wall between the lower zip-row bore and the finger-hole bore. The
// zip grid hangs from the top edge while the finger holes anchor near the
// cord end, so shallow plugs (short bodies) can pull the grid down into the
// finger holes; D-20 lengthens the body to preserve this web instead.
// Chosen below the Small-size default web (2.87) so every shipped size is
// unchanged at default measurements.
FIT_ZIP_FINGER_WEB = 2.5;

// The size table and FIT_GRIP_CLEARANCE live in fit_sizes.scad, which the
// main file includes first.

function _fit_clamp(v, lo, hi) = max(lo, min(v, hi));
function _fit_round05(v) = floor(v * 20 + 0.5) / 20;
function _fit_round_half(v) = floor(v * 2 + 0.5) / 2;

// ---------------------------------------------------------------------------
// D-1 / D-2 — Size → hand pair
// ---------------------------------------------------------------------------
_fit_finger_width = size == "Small"  ? FIT_SIZE_FINGER_S :
                    size == "Medium" ? FIT_SIZE_FINGER_M :
                    size == "Large"  ? FIT_SIZE_FINGER_L :
                    measure_finger_width;
_fit_hand_width   = size == "Small"  ? FIT_SIZE_HAND_S :
                    size == "Medium" ? FIT_SIZE_HAND_M :
                    size == "Large"  ? FIT_SIZE_HAND_L :
                    measure_hand_width;

// ---------------------------------------------------------------------------
// D-3 … D-8 — Hook family (whole family scales off the cord)
// ---------------------------------------------------------------------------
_fit_t_hook_base_gap      = _fit_clamp(_eff_cord_thickness + FIT_CORD_CLEARANCE, 3, 10); // D-3
_fit_t_hook_length        = _fit_clamp(FIT_T_LENGTH_RATIO   * _fit_t_hook_base_gap, 6, 20); // D-4
_fit_t_hook_holder_width  = _fit_clamp(FIT_T_HOLDER_W_RATIO * _fit_t_hook_base_gap, 8, 25); // D-5
_fit_t_hook_holder_length = _fit_clamp(FIT_T_HOLDER_L_RATIO * _fit_t_hook_base_gap, 2, 15); // D-6
_fit_t_hook_gap_offset    = 0;                                                              // D-7 (const)
_fit_t_hook_leg_offset    = 0;                                                              // D-8 (const)

// ---------------------------------------------------------------------------
// D-9 … D-11 — Finger holes
// ---------------------------------------------------------------------------
_fit_finger_hole_diameter = _fit_clamp(_fit_finger_width + FIT_GRIP_CLEARANCE, 15, 40);     // D-9
_fit_finger_hole_spacing  = _fit_clamp(_fit_finger_hole_diameter + FIT_FINGER_WEB, 20, 50); // D-10
_fit_finger_dx = max(0, _fit_finger_hole_spacing / 2 - _fit_t_hook_holder_width / 2);
_fit_finger_reach = _fit_finger_hole_diameter / 2 + FIT_FINGER_HOOK_CLEARANCE;
_fit_finger_hole_y_position = _fit_round05(
    max(_fit_finger_hole_diameter / 2 + 2,
        _fit_t_hook_length
            + sqrt(max(0, _fit_finger_reach * _fit_finger_reach
                          - _fit_finger_dx * _fit_finger_dx))));

// ---------------------------------------------------------------------------
// D-12 … D-14 — Plug wall notch
// ---------------------------------------------------------------------------
// Notch (and pocket/seat below) size from the WALL-station width — the end
// of the plug that meets the wall is the end the notch must straddle.
_fit_plug_wall_notch_width = _fit_clamp(
    _eff_plug_width_wall + 2 * FIT_SLIDE_CLEARANCE, 5, 40);                              // D-12
_fit_plug_wall_notch_height =                                                               // D-13
    _eff_wall_plate_style == "Rocker / Decora"    ? FIT_WALL_PLATE_DEPTH_DECORA    :
    _eff_wall_plate_style == "Oversized / Jumbo"  ? FIT_WALL_PLATE_DEPTH_OVERSIZED :
    _eff_wall_plate_style == "No plate / flush"   ? FIT_WALL_PLATE_DEPTH_NONE      :
    FIT_WALL_PLATE_DEPTH_STANDARD;
_fit_plug_wall_notch_rounding = min(FIT_NOTCH_ROUNDING,                                     // D-14
    _fit_plug_wall_notch_height, _fit_plug_wall_notch_width / 4);

// ---------------------------------------------------------------------------
// D-15 … D-18 — Dome pocket (seat disc + plug-body ellipse)
// ---------------------------------------------------------------------------
_fit_pocket_seat_diameter = _fit_clamp(
    _fit_plug_wall_notch_width + FIT_SEAT_BEYOND_NOTCH, 10, 45);                            // D-15
_fit_pocket_width = _fit_clamp(
    _eff_plug_width_wall + FIT_POCKET_WIDTH_CLEARANCE, 10, 45);                          // D-16
_fit_pocket_dome_drop = min(FIT_DOME_DROP, 0.25 * _eff_plug_length);                     // D-17
// D-43 — Plug side taper (also the plug side rail angle). The angle is
// DERIVED from the two Step 1 width stations over the plug length (in the
// main SCAD), so its sign encodes which end of the plug is wider: positive
// narrows toward the cord, negative widens toward it. Clamped to the rail
// math's safe window. 0 at Medium defaults (equal stations — parity).
_fit_pocket_side_angle = _fit_clamp(_eff_plug_side_angle, -15, 25);                      // D-43

// ---------------------------------------------------------------------------
// D-19 / D-20 — Pocket depth and body length (two-pass)
// ---------------------------------------------------------------------------
// The pocket runs the FULL plug length whenever the 120 mm body ceiling
// allows: the only cap is the real budget left after the cord-end features
// (finger holes + the pocket/finger gap) claim their run. At Medium
// defaults the budget is ~80 mm, so a 60-85 mm plug still gets a
// full-length pocket (the old rule capped it at half the body).
_fit_pocket_depth_max = 120 - (FIT_POCKET_FINGER_GAP                                     // D-19a (internal)
    + _fit_finger_hole_y_position + _fit_finger_hole_diameter / 2);
_fit_pocket_depth = _fit_clamp(_eff_plug_length, 12, _fit_pocket_depth_max);             // D-19b
// Zip-grid floor: the body must also be long enough that the lower zip row
// keeps a FIT_ZIP_FINGER_WEB wall from the nearest finger bore. dy_req is the
// vertical center distance that yields that wall given the fixed lateral
// offset between the zip column and the finger-hole center.
_fit_zip_finger_dx = abs(_fit_finger_hole_spacing / 2 - FIT_ZIP_WIDTH_SPACING / 2);
_fit_zip_finger_rr = _fit_finger_hole_diameter / 2 + FIT_ZIP_DIAMETER / 2
    + FIT_ZIP_FINGER_WEB;
_fit_zip_dy_req = sqrt(max(0,
    _fit_zip_finger_rr * _fit_zip_finger_rr
        - _fit_zip_finger_dx * _fit_zip_finger_dx));
_fit_length_for_zip = _fit_finger_hole_y_position + _fit_zip_dy_req                      // D-20a (internal)
    + FIT_ZIP_HEIGHT_SPACING + FIT_ZIP_DISTANCE_FROM_NOTCH
    + _fit_plug_wall_notch_height;
_fit_puller_length = _fit_clamp(                                                            // D-20
    max(_fit_pocket_depth + FIT_POCKET_FINGER_GAP
            + _fit_finger_hole_y_position + _fit_finger_hole_diameter / 2,
        _fit_length_for_zip),
    55, 120);

// ---------------------------------------------------------------------------
// D-21 — Slab thickness
// ---------------------------------------------------------------------------
_fit_body_thickness = _fit_round05(
    _fit_clamp(FIT_THICKNESS_HAND_RATIO * _fit_hand_width, 5, 9));                          // D-21

// ---------------------------------------------------------------------------
// D-22 / D-23 — Pocket floor heights (seat + body recesses)
// ---------------------------------------------------------------------------
_fit_seat_floor = _fit_body_thickness                                                       // D-22
    - _fit_clamp(FIT_RECESS_RATIO_SEAT * _eff_plug_thickness,
                 2, _fit_body_thickness - FIT_MIN_POCKET_FLOOR);
_fit_body_floor = _fit_body_thickness                                                       // D-23
    - _fit_clamp(FIT_RECESS_RATIO_BODY * _eff_plug_thickness,
                 1, _fit_body_thickness - FIT_MIN_POCKET_FLOOR);

// ---------------------------------------------------------------------------
// D-28 … D-33 — Body envelope (octagon control points, pre-rounding)
// ---------------------------------------------------------------------------
_fit_puller_bottom_width = _fit_round05(
    _fit_clamp(FIT_BODY_HAND_RATIO * _fit_hand_width, 50, 120));                            // D-28
_fit_puller_top_width = _fit_round05(_fit_clamp(                                            // D-29
    max(FIT_BODY_TOP_RATIO * _fit_puller_bottom_width,
        _fit_pocket_seat_diameter),
    25, 80));
_fit_puller_bottom_corners = _fit_round05(
    _fit_clamp(FIT_BODY_CORNER_RATIO * _fit_puller_bottom_width, 3, 80));                   // D-30
_fit_puller_middle_width = _fit_round05(_fit_clamp(                                         // D-31
    max(FIT_BODY_MIDDLE_RATIO * _fit_puller_bottom_width,
        _fit_puller_top_width + 4),
    25, 120));
_fit_puller_side_corner = _fit_round05(
    _fit_clamp(FIT_SIDE_CORNER_RATIO * _fit_puller_length, 3, 35));                         // D-32
_fit_body_side_rounding = _fit_round05(
    _fit_clamp(FIT_SIDE_ROUNDING_RATIO * _fit_puller_bottom_width, 0, 30));                 // D-33

// ---------------------------------------------------------------------------
// D-34 … D-36 — Velcro / wing placement (optional attachment)
// ---------------------------------------------------------------------------
_fit_middle_y = (_fit_puller_side_corner + _fit_puller_length) / 2;
function _fit_hw_at(y) =
    (y <= _fit_puller_side_corner)
        ? _fit_puller_bottom_corners / 2
          + (_fit_puller_bottom_width / 2 - _fit_puller_bottom_corners / 2)
            * y / _fit_puller_side_corner
        : (y <= _fit_middle_y)
            ? _fit_puller_bottom_width / 2
              + (_fit_puller_middle_width / 2 - _fit_puller_bottom_width / 2)
                * (y - _fit_puller_side_corner)
                / (_fit_middle_y - _fit_puller_side_corner)
            : _fit_puller_middle_width / 2
              + (_fit_puller_top_width / 2 - _fit_puller_middle_width / 2)
                * (y - _fit_middle_y)
                / (_fit_puller_length - _fit_middle_y);

_fit_velcro_hole_y_center = _fit_round05(                                                   // D-34
    _fit_puller_length - _fit_pocket_depth + FIT_VELCRO_POCKET_MARGIN);
_fit_side_edge_angle = atan2(
    _fit_puller_length - _fit_middle_y,
    _fit_puller_top_width / 2 - _fit_puller_middle_width / 2);
_fit_velcro_hole_rotation = _fit_round_half(_fit_side_edge_angle - 90);                     // D-35
_fit_velcro_hole_x_center = _fit_round05(
    _fit_hw_at(_fit_velcro_hole_y_center) - FIT_VELCRO_EDGE_OFFSET);                        // D-36

// ---------------------------------------------------------------------------
// D-37 … D-40 — J-hook cord catch (v6)
// ---------------------------------------------------------------------------
// The stem offset and catch reach scale with the crossbar so the catch stays
// proportional across cord sizes; the tip drop is a fixed sag.
_fit_hook_stem_offset = _fit_round05(                                                       // D-37
    FIT_HOOK_STEM_OFFSET * _fit_t_hook_base_gap / 4.7625);
_fit_hook_catch_reach = _fit_round05(                                                       // D-38
    FIT_HOOK_CATCH_REACH * _fit_t_hook_holder_width / 11.1125);
_fit_hook_tip_drop = FIT_HOOK_TIP_DROP;                                                     // D-39
_fit_zip_countersink = FIT_ZIP_COUNTERSINK;                                                 // D-40 (const)

// ---------------------------------------------------------------------------
// D-41 … D-42 — Wing velcro / strap width (v6)
// ---------------------------------------------------------------------------
_fit_strap_width = FIT_STRAP_WIDTH;                                                         // D-41
_fit_velcro_hole_length = FIT_VELCRO_LENGTH;                                                // D-42a (const)
_fit_velcro_hole_width  = FIT_VELCRO_WIDTH;                                                 // D-42b (const)

// ---------------------------------------------------------------------------
// FIT_MEASURED lookup table
// ---------------------------------------------------------------------------
// Same key set as PRESET_MEDIUM (enforced by the key-parity test).
FIT_MEASURED = [
    // -- Body Shape --
    ["puller_length",                    _fit_puller_length],
    ["puller_bottom_width",              _fit_puller_bottom_width],
    ["puller_bottom_corners",            _fit_puller_bottom_corners],
    ["puller_top_width",                 _fit_puller_top_width],
    ["puller_middle_width",              _fit_puller_middle_width],
    ["puller_side_corner",               _fit_puller_side_corner],
    ["body_thickness",                   _fit_body_thickness],
    ["body_round_bottom_only",           true],

    // -- Plug Pocket (dome) --
    ["pocket_seat_diameter",             _fit_pocket_seat_diameter],
    ["pocket_width",                     _fit_pocket_width],
    ["pocket_depth",                     _fit_pocket_depth],
    ["pocket_dome_drop",                 _fit_pocket_dome_drop],
    ["pocket_seat_floor",                _fit_seat_floor],
    ["pocket_floor",                     _fit_body_floor],
    ["pocket_side_angle",                _fit_pocket_side_angle],

    // -- Finger Holes --
    ["enable_finger_holes",              true],
    ["finger_hole_diameter",             _fit_finger_hole_diameter],
    ["finger_hole_spacing",              _fit_finger_hole_spacing],
    ["finger_hole_y_position",           _fit_finger_hole_y_position],

    // -- Hook (J-hook cord catch) --
    ["enable_t_hook",                    true],
    ["t_hook_base_gap",                  _fit_t_hook_base_gap],
    ["t_hook_length",                    _fit_t_hook_length],
    ["t_hook_holder_width",              _fit_t_hook_holder_width],
    ["t_hook_holder_length",             _fit_t_hook_holder_length],
    ["t_hook_gap_offset",                _fit_t_hook_gap_offset],
    ["t_hook_leg_offset",                _fit_t_hook_leg_offset],
    ["t_hook_stem_offset",               _fit_hook_stem_offset],
    ["t_hook_catch_reach",               _fit_hook_catch_reach],
    ["t_hook_tip_drop",                  _fit_hook_tip_drop],

    // -- Plug Wall Notch --
    ["enable_plug_wall_notch",           true],
    ["plug_wall_notch_width",            _fit_plug_wall_notch_width],
    ["plug_wall_notch_height",           _fit_plug_wall_notch_height],
    ["plug_wall_notch_rounding",         _fit_plug_wall_notch_rounding],

    // -- Zip Tie Holes (enable comes from the `attachment` dropdown) --
    ["zip_tie_hole_diameter",            FIT_ZIP_DIAMETER],
    ["zip_tie_height_spacing",           FIT_ZIP_HEIGHT_SPACING],
    ["zip_tie_width_spacing",            FIT_ZIP_WIDTH_SPACING],
    ["zip_tie_distance_from_notch",      FIT_ZIP_DISTANCE_FROM_NOTCH],
    ["zip_tie_countersink",              _fit_zip_countersink],

    // -- Velcro / Wing Strap (enable/style/width come from Step 3 dropdowns) --
    ["velcro_hole_length",               _fit_velcro_hole_length],
    ["velcro_hole_width",                _fit_velcro_hole_width],
    ["velcro_hole_x_center",             _fit_velcro_hole_x_center],
    ["velcro_hole_y_center",             _fit_velcro_hole_y_center],
    ["velcro_hole_rotation",             _fit_velcro_hole_rotation],

    // -- Edge Rounding --
    ["body_side_rounding",               _fit_body_side_rounding],
    ["body_top_rounding",                FIT_BODY_TOP_ROUNDING],
    ["body_bottom_rounding",             0],
    ["velcro_side_rounding",             0],
    ["velcro_top_bottom_rounding",       0],
    ["finger_hole_rounding",             FIT_FINGER_RIM_FILLET],
    ["t_hook_holder_side_rounding",      FIT_T_HOLDER_SIDE_ROUNDING],
    ["t_hook_gap_side_rounding",         FIT_T_GAP_SIDE_ROUNDING],
    ["t_hook_top_bottom_rounding",       FIT_T_TOP_BOTTOM_ROUNDING],
];

// ---------------------------------------------------------------------------
// Diagnostics — machine-parseable derivation echo
// ---------------------------------------------------------------------------
if (size != "Custom") {
    echo(str("=== Derived values for size '", size, "' (mm) ==="));
    for (row = FIT_MEASURED)
        echo(str("fit_derived: ", row[0], "=", row[1]));
}
// ── ===========================================================================
// ── END: fit_measured.scad (inlined by scripts/build_flattened.py)
// ── ===========================================================================
// ── ===========================================================================
// ── BEGIN: presets.scad (inlined by scripts/build_flattened.py)
// ── ===========================================================================
// =============================================================================
// presets.scad — Plug Puller v6 preset table and lookup helper
// =============================================================================
//
// This file is `include`d by Plug_Puller_v6_Parametric.scad. It defines:
//
//   - PRESET_MEDIUM       : the calibration reference table. Its values are
//                           the measured dimensions of the authoritative v6.0
//                           CAD reference ("Plug Puller 3.1 - B",
//                           `v6.0/CAD/v6.0.stl`, extracted by
//                           scripts/extract_reference_dims.py +
//                           scripts/analyze_v6*.py). The Medium size IS the
//                           v6 Plug Puller.
//   - preset_lookup(...)  : low-level table lookup; returns undef on miss.
//   - preset_value(p, key, fallback)
//                         : public routing helper used by the main SCAD.
//
// MEDIUM-PARITY INVARIANT
// -----------------------
// With `size = "Medium"` and every `measure_*` input at its default, every
// FIT_MEASURED value equals PRESET_MEDIUM's value exactly, and both equal the
// measured v6 reference geometry. Pinned at three levels: tests/fit_formulas.py
// (pure-Python mirror), the derivation echo parity test, and the mesh-level
// reference-parity test (tests/test_reference_parity.py).
//
// Include-order dependency
// ------------------------
// `preset_value()` references FIT_MEASURED, built by fit_measured.scad. The
// main SCAD must `include <fit_measured.scad>` BEFORE `include <presets.scad>`.
//
// Key-naming convention
// ---------------------
// Keys match the public variable names in the main file. Keep the key set
// identical between PRESET_MEDIUM and FIT_MEASURED (enforced by
// tests/test_preset_routing.py).
//
// License: PolyForm Noncommercial 1.0.0

/* [Hidden] */

// ----------- "Medium" reference table (the v6 Plug Puller) -----------
// Sources: v6.0/reference_dims.json (measured mesh), v6.0/outline_fit.json
// (octagon + rounding fit, silhouette RMS ~0.15 mm), and
// scripts/analyze_v6_features.py (seat/pocket/wing/J-hook).
PRESET_MEDIUM = [
    // -- Body Shape (octagon control points; the rendered outline applies
    //    body_side_rounding below puller_middle_y) --
    ["puller_length",                    65.5],
    ["puller_bottom_width",              81.55],
    ["puller_bottom_corners",            3],
    ["puller_top_width",                 35.75],
    ["puller_middle_width",              62.1],
    ["puller_side_corner",               5.45],
    ["body_thickness",                   6.35],
    ["body_round_bottom_only",           true],

    // -- Plug Pocket (dome style: seat disc + body ellipse) --
    ["pocket_seat_diameter",             30.5],
    ["pocket_width",                     31.7],
    ["pocket_depth",                     25.5],
    ["pocket_dome_drop",                 2.15],
    ["pocket_seat_floor",                3.175],
    ["pocket_floor",                     3.81],
    ["pocket_side_angle",                0],

    // -- Finger Holes --
    ["enable_finger_holes",              true],
    ["finger_hole_diameter",             25.4],
    ["finger_hole_spacing",              33],
    ["finger_hole_y_position",           21.8],

    // -- Hook (J-hook cord catch) --
    ["enable_t_hook",                    true],
    ["t_hook_base_gap",                  4.7625],
    ["t_hook_length",                    10.16],
    ["t_hook_holder_width",              11.1125],
    ["t_hook_holder_length",             5.08],
    ["t_hook_gap_offset",                0],
    ["t_hook_leg_offset",                0],
    ["t_hook_stem_offset",               4.5],
    ["t_hook_catch_reach",               4.55],
    ["t_hook_tip_drop",                  1.98],

    // -- Plug Wall Notch --
    ["enable_plug_wall_notch",           true],
    ["plug_wall_notch_width",            26.67],
    ["plug_wall_notch_height",           3.81],
    ["plug_wall_notch_rounding",         2.54],

    // -- Zip Tie Holes (enable comes from the `attachment` dropdown) --
    ["zip_tie_hole_diameter",            5.08],
    ["zip_tie_height_spacing",           17.78],
    ["zip_tie_width_spacing",            17.7],
    ["zip_tie_distance_from_notch",      5.1],
    ["zip_tie_countersink",              0.9],

    // -- Velcro / Wing Strap (enable/style/width come from Step 3 dropdowns;
    //    the hole_length/width/x/y values size and place the Classic-slot
    //    fallback only — the wing derives its own region) --
    ["velcro_hole_length",               12],
    ["velcro_hole_width",                7],
    ["velcro_hole_x_center",             19.4],
    ["velcro_hole_y_center",             46],
    ["velcro_hole_rotation",             23.5],

    // -- Edge Rounding --
    ["body_side_rounding",               17.05],
    ["body_top_rounding",                2.54],
    ["body_bottom_rounding",             0],
    ["velcro_side_rounding",             0],
    ["velcro_top_bottom_rounding",       0],
    ["finger_hole_rounding",             2.5],
    ["t_hook_holder_side_rounding",      1.27],
    ["t_hook_gap_side_rounding",         0],
    ["t_hook_top_bottom_rounding",       0],
];

// Low-level table lookup. Returns the value for `key` in `preset_list`, or
// `undef` if not found. See the v5 notes on OpenSCAD's search() quirks: we
// wrap the key in a one-element vector and discriminate hit-vs-miss with
// is_num(m[0]) (a hit is the row index; a miss is the empty list []).
function preset_lookup(preset_list, key) =
    let (m = search([key], preset_list))
    is_num(m[0]) ? preset_list[m[0]][1] : undef;

// Public routing helper. `p` is the resolved size name from the main SCAD:
//   "Custom"          -> fallback (the user's `custom_*` slider),
//   "Medium Defaults" -> the static PRESET_MEDIUM table,
//   anything else     -> FIT_MEASURED (Small / Medium / Large / Measure my
//                        hand, all measurement-driven).
function preset_value(p, key, fallback) =
    let (val =
        p == "Custom"          ? undef :
        p == "Medium Defaults" ? preset_lookup(PRESET_MEDIUM, key) :
        preset_lookup(FIT_MEASURED, key))
    val == undef ? fallback : val;
// ── ===========================================================================
// ── END: presets.scad (inlined by scripts/build_flattened.py)
// ── ===========================================================================

_p = (size == "Custom" && reset_custom_to_medium) ? "Medium Defaults" : size;
_auto_fit = (_p == "Custom") ? custom_enable_auto_fit : true;

// --- Body ---
puller_length         = preset_value(_p, "puller_length",         custom_puller_length);
puller_bottom_width   = preset_value(_p, "puller_bottom_width",   custom_puller_bottom_width);
puller_bottom_corners = preset_value(_p, "puller_bottom_corners", custom_puller_bottom_corners);
puller_top_width      = preset_value(_p, "puller_top_width",      custom_puller_top_width);
puller_middle_width   = preset_value(_p, "puller_middle_width",   custom_puller_middle_width);
puller_side_corner    = preset_value(_p, "puller_side_corner",    custom_puller_side_corner);
body_thickness        = preset_value(_p, "body_thickness",        custom_body_thickness);
body_round_bottom_only = preset_value(_p, "body_round_bottom_only", custom_body_round_bottom_only);

// --- Plug Pocket ---
_raw_pocket_seat_diameter = preset_value(_p, "pocket_seat_diameter", custom_pocket_seat_diameter);
_raw_pocket_width         = preset_value(_p, "pocket_width",         custom_pocket_width);
_raw_pocket_depth         = preset_value(_p, "pocket_depth",         custom_pocket_depth);
_raw_pocket_dome_drop     = preset_value(_p, "pocket_dome_drop",     custom_pocket_dome_drop);
_raw_pocket_seat_floor    = preset_value(_p, "pocket_seat_floor",    custom_pocket_seat_floor);
_raw_pocket_floor         = preset_value(_p, "pocket_floor",         custom_pocket_floor);
// Pocket side-wall taper (also the plug side rail angle). Not auto-fit
// clamped — a pure angle, bounded by its slider range.
pocket_side_angle         = preset_value(_p, "pocket_side_angle",    custom_pocket_side_angle);

// --- Finger Holes ---
enable_finger_holes         = preset_value(_p, "enable_finger_holes",    custom_enable_finger_holes);
_raw_finger_hole_diameter   = preset_value(_p, "finger_hole_diameter",   custom_finger_hole_diameter);
_raw_finger_hole_spacing    = preset_value(_p, "finger_hole_spacing",    custom_finger_hole_spacing);
_raw_finger_hole_y_position = preset_value(_p, "finger_hole_y_position", custom_finger_hole_y_position);

// --- Hook (J-hook cord catch) ---
enable_t_hook             = preset_value(_p, "enable_t_hook",        custom_enable_t_hook);
_raw_t_hook_base_gap      = preset_value(_p, "t_hook_base_gap",      custom_t_hook_base_gap);
_raw_t_hook_length        = preset_value(_p, "t_hook_length",        custom_t_hook_length);
_raw_t_hook_holder_width  = preset_value(_p, "t_hook_holder_width",  custom_t_hook_holder_width);
_raw_t_hook_holder_length = preset_value(_p, "t_hook_holder_length", custom_t_hook_holder_length);
_raw_t_hook_gap_offset    = preset_value(_p, "t_hook_gap_offset",    custom_t_hook_gap_offset);
_raw_t_hook_leg_offset    = preset_value(_p, "t_hook_leg_offset",    custom_t_hook_leg_offset);
_raw_t_hook_stem_offset   = preset_value(_p, "t_hook_stem_offset",   custom_t_hook_stem_offset);
_raw_t_hook_catch_reach   = preset_value(_p, "t_hook_catch_reach",   custom_t_hook_catch_reach);
_raw_t_hook_tip_drop      = preset_value(_p, "t_hook_tip_drop",      custom_t_hook_tip_drop);
// Hook chirality: the Step 4 dropdown is authoritative in every size.
_resolved_hook_hand = hook_hand;

// --- Plug Wall Notch ---
enable_plug_wall_notch        = preset_value(_p, "enable_plug_wall_notch",  custom_enable_plug_wall_notch);
_raw_plug_wall_notch_width    = preset_value(_p, "plug_wall_notch_width",   custom_plug_wall_notch_width);
_raw_plug_wall_notch_height   = preset_value(_p, "plug_wall_notch_height",  custom_plug_wall_notch_height);
_raw_plug_wall_notch_rounding = preset_value(_p, "plug_wall_notch_rounding", custom_plug_wall_notch_rounding);

// --- Attachment (zip ties / wing velcro) ---
// The Step 3 dropdowns are authoritative in every size, including Custom.
_attach_zip    = (attachment == "Zip ties" || attachment == "Zip ties + Velcro");
_attach_velcro = (attachment == "Velcro strap" || attachment == "Zip ties + Velcro");
enable_zip_tie_holes   = _attach_zip;
enable_velcro_holes    = _attach_velcro;
_resolved_velcro_style = velcro_style;
_raw_strap_width       = strap_width;

// --- Zip Tie Holes ---
_raw_zip_tie_hole_diameter       = preset_value(_p, "zip_tie_hole_diameter",       custom_zip_tie_hole_diameter);
_raw_zip_tie_height_spacing      = preset_value(_p, "zip_tie_height_spacing",      custom_zip_tie_height_spacing);
_raw_zip_tie_width_spacing       = preset_value(_p, "zip_tie_width_spacing",       custom_zip_tie_width_spacing);
_raw_zip_tie_distance_from_notch = preset_value(_p, "zip_tie_distance_from_notch", custom_zip_tie_distance_from_notch);
_raw_zip_tie_countersink         = preset_value(_p, "zip_tie_countersink",       custom_zip_tie_countersink);

// --- Velcro / Wing Strap Holes ---
_raw_velcro_hole_length   = preset_value(_p, "velcro_hole_length",   custom_velcro_hole_length);
_raw_velcro_hole_width    = preset_value(_p, "velcro_hole_width",    custom_velcro_hole_width);
_raw_velcro_hole_x_center = preset_value(_p, "velcro_hole_x_center", custom_velcro_hole_x_center);
_raw_velcro_hole_y_center = preset_value(_p, "velcro_hole_y_center", custom_velcro_hole_y_center);
velcro_hole_rotation      = preset_value(_p, "velcro_hole_rotation", custom_velcro_hole_rotation);

// --- Rounding ---
body_side_rounding          = preset_value(_p, "body_side_rounding",          custom_body_side_rounding);
body_top_rounding           = preset_value(_p, "body_top_rounding",           custom_body_top_rounding);
body_bottom_rounding        = preset_value(_p, "body_bottom_rounding",        custom_body_bottom_rounding);
velcro_side_rounding        = preset_value(_p, "velcro_side_rounding",        custom_velcro_side_rounding);
velcro_top_bottom_rounding  = preset_value(_p, "velcro_top_bottom_rounding",  custom_velcro_top_bottom_rounding);
finger_hole_rounding        = preset_value(_p, "finger_hole_rounding",        custom_finger_hole_rounding);
t_hook_holder_side_rounding = preset_value(_p, "t_hook_holder_side_rounding", custom_t_hook_holder_side_rounding);
t_hook_gap_side_rounding    = preset_value(_p, "t_hook_gap_side_rounding",    custom_t_hook_gap_side_rounding);
t_hook_top_bottom_rounding  = preset_value(_p, "t_hook_top_bottom_rounding",  custom_t_hook_top_bottom_rounding);

// ═══════════════════════════════════════════════════════════════════════════════
// BODY-OUTLINE HELPERS (must be defined before the AUTO-FIT block)
// ═══════════════════════════════════════════════════════════════════════════════
// `puller_middle_y` and `body_half_width_at_y()` are consumed by several
// auto-fit clamps below. OpenSCAD evaluates top-level variable assignments in
// source order, so any helper used by an auto-fit `_clamp(...)` expression
// must appear *above* that assignment — otherwise the helper sees `undef`,
// propagates undef into the placement, and the feature silently disappears.
// The same helpers are re-used by the derived-values section and the
// in-model validation_warnings() module.
//
// NOTE: body_half_width_at_y() interpolates the RAW octagon control polygon.
// In the rounded cord-end zone (y < puller_middle_y with
// body_round_bottom_only) it overestimates the true outline by up to a few
// millimetres near the corners; every consumer of the function is either in
// the crisp zone (velcro, zip ties, plates, pocket) or uses it only as a
// generous upper bound (T-hook clamps, finger overrun warning).

puller_middle_y = (puller_side_corner + puller_length) / 2;

// Body half-width at any Y: piecewise linear interpolation of the octagonal outline.
function body_half_width_at_y(y) =
    (y <= puller_side_corner)
        ? puller_bottom_corners / 2
          + (puller_bottom_width / 2 - puller_bottom_corners / 2)
            * y / puller_side_corner
        : (y <= puller_middle_y)
            ? puller_bottom_width / 2
              + (puller_middle_width / 2 - puller_bottom_width / 2)
                * (y - puller_side_corner)
                / (puller_middle_y - puller_side_corner)
            : puller_middle_width / 2
              + (puller_top_width / 2 - puller_middle_width / 2)
                * (y - puller_middle_y)
                / (puller_length - puller_middle_y);

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-FIT (BOUNDS CLAMPING)
// ═══════════════════════════════════════════════════════════════════════════════
// Slider values are absolute millimetres — what you enter is what you get.
// When auto-fit is enabled, each feature dimension is clamped to a valid range
// so it stays inside the body outline and maintains minimum clearance from
// neighbouring features (collision avoidance between finger holes, velcro,
// zip ties, pocket, and the T-hook).  No proportional scaling is applied.
//
// Toggle: custom_enable_auto_fit (Custom size only).  When disabled, all
// adapted variables receive their raw values directly — no bounds clamping.
// Features may overlap or extend beyond the body outline, which is the
// intended trade-off for full manual control.

function _clamp(val, lo, hi) = max(lo, min(val, hi));

// --- T-Hook (adapted) ---
t_hook_length = _auto_fit
    ? _clamp(_raw_t_hook_length,
             4, puller_length * 0.25)
    : _raw_t_hook_length;
// Reference width for the hook clamps: the body's full width at the
// crossbar's top Y. (The raw-octagon overestimate in the rounded zone is
// fine here — the bound only guards against absurd values.)
_t_hook_ref_width = 2 * body_half_width_at_y(t_hook_length);
t_hook_base_gap = _auto_fit
    ? _clamp(_raw_t_hook_base_gap,
             2, _t_hook_ref_width * 0.4)
    : _raw_t_hook_base_gap;
t_hook_holder_width = _auto_fit
    ? _clamp(_raw_t_hook_holder_width,
             t_hook_base_gap + 2, _t_hook_ref_width - 2)
    : _raw_t_hook_holder_width;
t_hook_holder_length = _auto_fit
    ? _clamp(_raw_t_hook_holder_length,
             2, t_hook_length * 0.8)
    : _raw_t_hook_holder_length;
t_hook_gap_offset = _auto_fit
    ? _clamp(_raw_t_hook_gap_offset,
             0, t_hook_length * 0.5)
    : _raw_t_hook_gap_offset;
_t_hook_max_leg_offset = (t_hook_holder_width - t_hook_base_gap) / 2;
t_hook_leg_offset = _auto_fit
    ? _clamp(_raw_t_hook_leg_offset,
             -_t_hook_max_leg_offset, _t_hook_max_leg_offset)
    : _raw_t_hook_leg_offset;
// J-hook extensions (v6). The stem offset can exceed the crossbar half-width
// (that asymmetry is the J), but it is bounded so the offset stem still
// clears the body edge; the catch reach and tip drop are lightly clamped.
t_hook_stem_offset = _auto_fit
    ? _clamp(_raw_t_hook_stem_offset, 0, _t_hook_ref_width * 0.4)
    : _raw_t_hook_stem_offset;
t_hook_catch_reach = _auto_fit
    ? _clamp(_raw_t_hook_catch_reach, 0, _t_hook_ref_width * 0.4)
    : _raw_t_hook_catch_reach;
t_hook_tip_drop = _auto_fit
    ? _clamp(_raw_t_hook_tip_drop, 0, t_hook_length * 0.4)
    : _raw_t_hook_tip_drop;

// --- Plug Wall Notch (adapted) ---
plug_wall_notch_width = _auto_fit
    ? _clamp(_raw_plug_wall_notch_width,
             5, puller_top_width - 2)
    : _raw_plug_wall_notch_width;
plug_wall_notch_height = _auto_fit
    ? _clamp(_raw_plug_wall_notch_height,
             1.5, puller_length * 0.12)
    : _raw_plug_wall_notch_height;
plug_wall_notch_rounding = _auto_fit
    ? _clamp(_raw_plug_wall_notch_rounding,
             0, min(plug_wall_notch_height, plug_wall_notch_width / 4))
    : _raw_plug_wall_notch_rounding;

// --- Finger Holes (adapted) ---
finger_hole_diameter = _auto_fit
    ? _clamp(_raw_finger_hole_diameter,
             10, min(puller_bottom_width * 0.4, puller_length * 0.4))
    : _raw_finger_hole_diameter;
finger_hole_spacing = _auto_fit
    ? _clamp(_raw_finger_hole_spacing,
             finger_hole_diameter + 2,
             puller_bottom_width - finger_hole_diameter - 4)
    : _raw_finger_hole_spacing;
// Y position: the holes may flank the T-hook crossbar (the original does),
// so the lower bound is a RADIAL clearance from the crossbar corner — a
// 0.5 mm web between hole rim and hook — not an axis-aligned stack.
_finger_hook_dx = max(0,
    finger_hole_spacing / 2 - (t_hook_holder_width / 2 + abs(t_hook_leg_offset)));
_finger_reach_min = finger_hole_diameter / 2 + 0.5;
_finger_y_min_hook = (enable_t_hook && _finger_hook_dx < _finger_reach_min)
    ? t_hook_length
      + sqrt(_finger_reach_min * _finger_reach_min
             - _finger_hook_dx * _finger_hook_dx)
    : 0;
finger_hole_y_position = _auto_fit
    ? _clamp(_raw_finger_hole_y_position,
             max(_finger_y_min_hook, finger_hole_diameter / 2 + 0.5),
             puller_length * 0.6)
    : _raw_finger_hole_y_position;

// --- Plug Pocket (adapted) ---
// Ceiling is the full top width: the original's seat disc is exactly
// tangent to the top corners (seat diameter == top width), which leaves the
// razor-thin raised rim between the seat wall and the taper edge.
pocket_seat_diameter = _auto_fit
    ? _clamp(_raw_pocket_seat_diameter,
             10, min(45, puller_top_width))
    : _raw_pocket_seat_diameter;
// Depth ceiling mirrors the derivation budget (D-19): the pocket may run
// until the FIT_POCKET_FINGER_GAP web above the finger holes — not the old
// 0.6 x body cap, which silently truncated long plugs' pockets.
pocket_depth = _auto_fit
    ? _clamp(_raw_pocket_depth,
             max(5, plug_wall_notch_height + 2),
             puller_length - (FIT_POCKET_FINGER_GAP + finger_hole_y_position
                              + finger_hole_diameter / 2))
    : _raw_pocket_depth;
pocket_dome_drop = _auto_fit
    ? _clamp(_raw_pocket_dome_drop, 0, pocket_depth * 0.25)
    : _raw_pocket_dome_drop;
pocket_width = _auto_fit
    ? _clamp(_raw_pocket_width,
             8, 2 * body_half_width_at_y(
                     min(puller_length - pocket_dome_drop, puller_length)) - 3)
    : _raw_pocket_width;
pocket_seat_floor = _auto_fit
    ? _clamp(_raw_pocket_seat_floor, 0, body_thickness)
    : _raw_pocket_seat_floor;
pocket_floor = _auto_fit
    ? _clamp(_raw_pocket_floor, 0, body_thickness)
    : _raw_pocket_floor;

// --- Velcro Strap Holes (adapted) ---
velcro_hole_length = _auto_fit
    ? _clamp(_raw_velcro_hole_length, 4, 25)
    : _raw_velcro_hole_length;
velcro_hole_width = _auto_fit
    ? _clamp(_raw_velcro_hole_width, 2, 15)
    : _raw_velcro_hole_width;
// Y center must sit between the finger holes and the wall notch region.
velcro_hole_y_center = _auto_fit
    ? _clamp(_raw_velcro_hole_y_center,
             finger_hole_y_position + finger_hole_diameter / 2
                 + velcro_hole_length / 2 + 3,
             puller_length - plug_wall_notch_height
                 - velcro_hole_length / 2 - 3)
    : _raw_velcro_hole_y_center;
// X center must keep the ROTATED slot inside the body outline at this Y.
_velcro_x_extent = velcro_hole_length / 2 * abs(sin(velcro_hole_rotation))
                 + velcro_hole_width / 2 * abs(cos(velcro_hole_rotation));
velcro_hole_x_center = _auto_fit
    ? _clamp(_raw_velcro_hole_x_center,
             velcro_hole_width / 2 + 3,
             body_half_width_at_y(velcro_hole_y_center)
                 - _velcro_x_extent - 1)
    : _raw_velcro_hole_x_center;

// --- Zip Tie Holes (adapted) ---
// height_spacing is clamped LAST: its finger-barrier cap reads the adapted
// width spacing and hole diameter.
zip_tie_hole_diameter = _auto_fit
    ? _clamp(_raw_zip_tie_hole_diameter, 1.5, 10)
    : _raw_zip_tie_hole_diameter;
zip_tie_width_spacing = _auto_fit
    ? _clamp(_raw_zip_tie_width_spacing,
             5, puller_bottom_width * 0.4)
    : _raw_zip_tie_width_spacing;
zip_tie_distance_from_notch = _auto_fit
    ? _clamp(_raw_zip_tie_distance_from_notch,
             3, puller_length * 0.2)
    : _raw_zip_tie_distance_from_notch;
// Finger barrier: the lower zip row must keep a solid wall from the nearest
// finger bore (the grid hangs from the top edge; the fingers anchor near the
// cord end — a long grid on a short body would run into them). The cap keeps
// the row's center distance at (radii + web); 0.1 slack below the derivation
// web so the measured sizes — already spaced by D-20's zip-grid floor —
// never re-clamp here. If even the cap floor (5) cannot restore the wall,
// W-16 fires instead of forcing geometry.
_zip_finger_dx = abs(finger_hole_spacing / 2 - zip_tie_width_spacing / 2);
_zip_finger_keepout = finger_hole_diameter / 2 + zip_tie_hole_diameter / 2
    + FIT_ZIP_FINGER_WEB - 0.1;
_zip_dy_needed = (enable_finger_holes && _zip_finger_dx < _zip_finger_keepout)
    ? sqrt(_zip_finger_keepout * _zip_finger_keepout
           - _zip_finger_dx * _zip_finger_dx)
    : 0;
_zip_spacing_max = puller_length - plug_wall_notch_height
    - zip_tie_distance_from_notch - finger_hole_y_position - _zip_dy_needed;
zip_tie_height_spacing = _auto_fit
    ? _clamp(_raw_zip_tie_height_spacing,
             5, min(puller_length * 0.4, _zip_spacing_max))
    : _raw_zip_tie_height_spacing;
zip_tie_countersink = _auto_fit
    ? _clamp(_raw_zip_tie_countersink, 0, body_thickness * 0.6)
    : _raw_zip_tie_countersink;

// --- Wing / Velcro strap width (adapted) ---
strap_width_eff = _auto_fit
    ? _clamp(_raw_strap_width, 8, 30)
    : _raw_strap_width;

// --- Diagnostic echo (console only, no effect on geometry) ---
// Every adapted dimension as [name, adapted value, raw input]. When auto-fit
// clamped a value, the echo line appends "(clamped from <raw>)" and the
// preview HUD (see validation_warnings) shows a one-line notice.
_adapted_report = [
    ["t_hook_base_gap",             t_hook_base_gap,             _raw_t_hook_base_gap],
    ["t_hook_length",               t_hook_length,               _raw_t_hook_length],
    ["t_hook_holder_width",         t_hook_holder_width,         _raw_t_hook_holder_width],
    ["t_hook_holder_length",        t_hook_holder_length,        _raw_t_hook_holder_length],
    ["t_hook_gap_offset",           t_hook_gap_offset,           _raw_t_hook_gap_offset],
    ["t_hook_leg_offset",           t_hook_leg_offset,           _raw_t_hook_leg_offset],
    ["t_hook_stem_offset",          t_hook_stem_offset,          _raw_t_hook_stem_offset],
    ["t_hook_catch_reach",          t_hook_catch_reach,          _raw_t_hook_catch_reach],
    ["t_hook_tip_drop",             t_hook_tip_drop,             _raw_t_hook_tip_drop],
    ["plug_wall_notch_width",       plug_wall_notch_width,       _raw_plug_wall_notch_width],
    ["plug_wall_notch_height",      plug_wall_notch_height,      _raw_plug_wall_notch_height],
    ["plug_wall_notch_rounding",    plug_wall_notch_rounding,    _raw_plug_wall_notch_rounding],
    ["pocket_seat_diameter",        pocket_seat_diameter,        _raw_pocket_seat_diameter],
    ["pocket_width",                pocket_width,                _raw_pocket_width],
    ["pocket_depth",                pocket_depth,                _raw_pocket_depth],
    ["pocket_dome_drop",            pocket_dome_drop,            _raw_pocket_dome_drop],
    ["pocket_seat_floor",           pocket_seat_floor,           _raw_pocket_seat_floor],
    ["pocket_floor",                pocket_floor,                _raw_pocket_floor],
    ["finger_hole_diameter",        finger_hole_diameter,        _raw_finger_hole_diameter],
    ["finger_hole_spacing",         finger_hole_spacing,         _raw_finger_hole_spacing],
    ["finger_hole_y_position",      finger_hole_y_position,      _raw_finger_hole_y_position],
    ["velcro_hole_length",          velcro_hole_length,          _raw_velcro_hole_length],
    ["velcro_hole_width",           velcro_hole_width,           _raw_velcro_hole_width],
    ["velcro_hole_y_center",        velcro_hole_y_center,        _raw_velcro_hole_y_center],
    ["velcro_hole_x_center",        velcro_hole_x_center,        _raw_velcro_hole_x_center],
    ["strap_width_eff",             strap_width_eff,             _raw_strap_width],
    ["zip_tie_hole_diameter",       zip_tie_hole_diameter,       _raw_zip_tie_hole_diameter],
    ["zip_tie_height_spacing",      zip_tie_height_spacing,      _raw_zip_tie_height_spacing],
    ["zip_tie_width_spacing",       zip_tie_width_spacing,       _raw_zip_tie_width_spacing],
    ["zip_tie_distance_from_notch", zip_tie_distance_from_notch, _raw_zip_tie_distance_from_notch],
    ["zip_tie_countersink",         zip_tie_countersink,         _raw_zip_tie_countersink],
];
_autofit_clamped = _auto_fit
    ? [for (r = _adapted_report) if (r[1] != r[2]) r[0]]
    : [];

echo("=== Final Adapted Dimensions (mm) ===");
for (r = _adapted_report)
    echo(str("  ", r[0], " = ", r[1],
             (_auto_fit && r[1] != r[2])
                 ? str("  (clamped from ", r[2], ")") : ""));
echo("  puller_middle_width       =", puller_middle_width);
echo("  puller_middle_y           =", puller_middle_y);
echo("=== Auto-fit:", _auto_fit ? "ON (clamped)" : "OFF (raw)", "===");

// --- Inert-slider detection (console + preview HUD, no effect on geometry) ---
// Every custom_* control as [name, current value, declared default]. When a
// non-Custom size is selected, any entry that differs from its default is
// being silently ignored — each offender is echoed, and a preview-only
// orange HUD tag points the user at Size = Custom.
_custom_report = [
    ["custom_puller_length",              custom_puller_length,              63.5],
    ["custom_puller_bottom_width",        custom_puller_bottom_width,        77.6],
    ["custom_puller_bottom_corners",      custom_puller_bottom_corners,      3],
    ["custom_puller_top_width",           custom_puller_top_width,           31.75],
    ["custom_puller_middle_width",        custom_puller_middle_width,        57.35],
    ["custom_puller_side_corner",         custom_puller_side_corner,         4.65],
    ["custom_body_thickness",             custom_body_thickness,             6.35],
    ["custom_body_round_bottom_only",     custom_body_round_bottom_only,     true],
    ["custom_pocket_seat_diameter",       custom_pocket_seat_diameter,       31.75],
    ["custom_pocket_width",               custom_pocket_width,               28.85],
    ["custom_pocket_depth",               custom_pocket_depth,               24.5],
    ["custom_pocket_dome_drop",           custom_pocket_dome_drop,           2.15],
    ["custom_pocket_seat_floor",          custom_pocket_seat_floor,          3.175],
    ["custom_pocket_floor",               custom_pocket_floor,               3.81],
    ["custom_pocket_side_angle",          custom_pocket_side_angle,          0],
    ["custom_enable_finger_holes",        custom_enable_finger_holes,        true],
    ["custom_finger_hole_diameter",       custom_finger_hole_diameter,       25.4],
    ["custom_finger_hole_spacing",        custom_finger_hole_spacing,        33],
    ["custom_finger_hole_y_position",     custom_finger_hole_y_position,     19.8],
    ["custom_enable_t_hook",              custom_enable_t_hook,              true],
    ["custom_t_hook_base_gap",            custom_t_hook_base_gap,            4.7625],
    ["custom_t_hook_length",              custom_t_hook_length,              10.16],
    ["custom_t_hook_holder_width",        custom_t_hook_holder_width,        11.1125],
    ["custom_t_hook_holder_length",       custom_t_hook_holder_length,       5.08],
    ["custom_t_hook_gap_offset",          custom_t_hook_gap_offset,          0],
    ["custom_t_hook_leg_offset",          custom_t_hook_leg_offset,          0],
    ["custom_t_hook_stem_offset",         custom_t_hook_stem_offset,         4.5],
    ["custom_t_hook_catch_reach",         custom_t_hook_catch_reach,         4.55],
    ["custom_t_hook_tip_drop",            custom_t_hook_tip_drop,            1.98],
    ["custom_enable_plug_wall_notch",     custom_enable_plug_wall_notch,     true],
    ["custom_plug_wall_notch_width",      custom_plug_wall_notch_width,      26.67],
    ["custom_plug_wall_notch_height",     custom_plug_wall_notch_height,     3.81],
    ["custom_plug_wall_notch_rounding",   custom_plug_wall_notch_rounding,   2.54],
    ["custom_zip_tie_hole_diameter",      custom_zip_tie_hole_diameter,      5.08],
    ["custom_zip_tie_height_spacing",     custom_zip_tie_height_spacing,     17.78],
    ["custom_zip_tie_width_spacing",      custom_zip_tie_width_spacing,      17.7],
    ["custom_zip_tie_distance_from_notch", custom_zip_tie_distance_from_notch, 5.1],
    ["custom_zip_tie_countersink",        custom_zip_tie_countersink,        0.9],
    ["custom_velcro_hole_length",         custom_velcro_hole_length,         12],
    ["custom_velcro_hole_width",          custom_velcro_hole_width,          7],
    ["custom_velcro_hole_x_center",       custom_velcro_hole_x_center,       19.4],
    ["custom_velcro_hole_y_center",       custom_velcro_hole_y_center,       46],
    ["custom_velcro_hole_rotation",       custom_velcro_hole_rotation,       23.5],
    ["custom_body_side_rounding",         custom_body_side_rounding,         15.85],
    ["custom_body_top_rounding",          custom_body_top_rounding,          2.54],
    ["custom_body_bottom_rounding",       custom_body_bottom_rounding,       0],
    ["custom_velcro_side_rounding",       custom_velcro_side_rounding,       0],
    ["custom_velcro_top_bottom_rounding", custom_velcro_top_bottom_rounding, 0],
    ["custom_finger_hole_rounding",       custom_finger_hole_rounding,       2.5],
    ["custom_t_hook_holder_side_rounding", custom_t_hook_holder_side_rounding, 1.27],
    ["custom_t_hook_gap_side_rounding",   custom_t_hook_gap_side_rounding,   0],
    ["custom_t_hook_top_bottom_rounding", custom_t_hook_top_bottom_rounding, 0],
];
_ignored_custom = (size == "Custom")
    ? []
    : [for (r = _custom_report) if (r[1] != r[2]) r[0]];
for (n = _ignored_custom)
    echo(str("NOTE: ", n, " is set but ignored — set Size = Custom"));

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED VALUES
// ═══════════════════════════════════════════════════════════════════════════════
// `puller_middle_y` and `body_half_width_at_y()` are intentionally declared
// earlier (above the AUTO-FIT block) because several clamps need them. The
// values below depend on auto-fit *outputs* and therefore have to live here,
// after the AUTO-FIT block has finished.

// Side edge angle from +X axis (overall chord from side_corner to top).
// The middle-width point bisects this segment; the actual edge bends at
// puller_middle_y.
side_edge_angle = atan2(
    puller_length - puller_side_corner,
    puller_top_width / 2 - puller_bottom_width / 2
);

// Finger hole Y position — directly controlled by finger_hole_y_position.
finger_hole_y = finger_hole_y_position;

// Dome pocket geometry: the seat disc is centered ON the top edge; the
// plug-recess pocket is centered pocket_dome_drop below it and reaches
// down to puller_length - pocket_depth.
_pocket_ellipse_center_y = puller_length - pocket_dome_drop;
_pocket_ellipse_semi_y   = max(eps, pocket_depth - pocket_dome_drop);
_pocket_inner_end_y      = puller_length - pocket_depth;

// ── Plug side rail ────────────────────────────────────────────────────────
// A 2D line describing the plug's side edge inside the tool. It starts at the
// pocket half-width on the plug face (Y = puller_length) and slopes inward by
// pocket_side_angle as it runs toward the cord (increasing t). The pocket
// side walls, the zip stations and the velcro slot all hang off this rail so
// one dial slides a feature coherently along the plug's side.
//   rail_point(t)          -> [x, y] on the right rail, t mm from the plug face
//   rail_feature_center(t,d) -> rail_point(t) shifted d mm along the OUTWARD
//                               normal (+X side; negative d = inward)
_rail_tan       = tan(pocket_side_angle);
_pocket_front_y = puller_length;
function rail_x(t)     = pocket_width / 2 - t * _rail_tan;
function rail_point(t) = [rail_x(t), _pocket_front_y - t];
function rail_feature_center(t, d) =
    [rail_x(t) + d * cos(pocket_side_angle),
     _pocket_front_y - t - d * sin(pocket_side_angle)];

// ── Zip-tie stations along the rail ───────────────────────────────────────
// Auto reproduces sensible v6-like rows: the first pair a fixed run behind the
// plug face, the rest stepping toward the cord by the derived row spacing —
// but never past the finger-hole keep-out. The deepest allowed run (_zip_t_max)
// keeps a FIT_ZIP_FINGER_WEB wall between the last row's bore and the nearest
// finger bore, computed with the ACTUAL rail-based hole X (the legacy v6 grid
// clamp used zip_tie_width_spacing, which no longer matches the placement).
// When zip_row_count would overflow that run at the preset row spacing, the
// rows compress evenly instead of punching into the finger holes.
// Manual uses the zip_pos_* dials (mm along the rail from the plug face).
// Each hole sits zip_edge_offset INWARD of the pocket wall (as on the v6
// device), so the tie threads beside the plug seat and the outer side stays
// clear for the velcro wing. X is floored so the two columns never merge and a
// (rare) deep taper station can't cross the centerline.
_zip_n         = zip_row_count;
_zip_auto_t0   = plug_wall_notch_height + zip_tie_distance_from_notch;
function _zip_y_of_t(t) = _pocket_front_y - t + zip_edge_offset * sin(pocket_side_angle);
function _zip_x_of_t(t) = max(rail_x(t) - zip_edge_offset * cos(pocket_side_angle),
                              zip_tie_hole_diameter / 2 + 0.75);
// Deepest run before the row violates the finger web (or falls off the cord
// end). X varies slowly with t, so two fixed-point iterations converge well
// past any physical tolerance.
function _zip_t_max_at(t) =
    let (dx    = abs(finger_hole_spacing / 2 - _zip_x_of_t(t)),
         rr    = finger_hole_diameter / 2 + zip_tie_hole_diameter / 2
                     + FIT_ZIP_FINGER_WEB,
         dy    = enable_finger_holes ? sqrt(max(0, rr * rr - dx * dx)) : 0,
         y_min = max(enable_finger_holes ? finger_hole_y + dy : 0,
                     zip_tie_hole_diameter / 2 + 0.75))
    _pocket_front_y + zip_edge_offset * sin(pocket_side_angle) - y_min;
_zip_t_max = _zip_t_max_at(_zip_t_max_at(
    _zip_auto_t0 + (_zip_n - 1) * zip_tie_height_spacing));
// Auto row step: the preset spacing when it fits, otherwise the available
// run divided evenly (floored at one bore + web so rows never merge).
_zip_auto_step = (_zip_n <= 1) ? 0 :
    min(zip_tie_height_spacing,
        max(zip_tie_hole_diameter + 1.5,
            (_zip_t_max - _zip_auto_t0) / (_zip_n - 1)));
_zip_auto_t    = [for (i = [0 : _zip_n - 1]) _zip_auto_t0 + i * _zip_auto_step];
_zip_manual_t  = [zip_pos_1, zip_pos_2, zip_pos_3];
_zip_t         = [for (i = [0 : _zip_n - 1])
                     (zip_placement == "Manual") ? _zip_manual_t[i] : _zip_auto_t[i]];
// Right-side [x, y] centers (left side is the mirror).
_zip_centers = [for (t = _zip_t)
    let (c   = rail_feature_center(t, -zip_edge_offset),
         xlo = zip_tie_hole_diameter / 2 + 0.75)
    [max(c[0], xlo), c[1]]];

// ── Taper-aware pocket footprint half-widths (centered frame) ─────────────
// The pocket recess side walls follow the rail: half-width at the plug-face
// end (top of the recess) and at the rounded nose (inner end), plus a nose
// radius. At pocket_side_angle = 0 these collapse to a rounded-nose rectangle
// of width pocket_width.
_pocket_hw_top  = pocket_width / 2 + (pocket_depth - 2 * pocket_dome_drop) * _rail_tan;
_pocket_hw_nose = max(1, pocket_width / 2 - pocket_depth * _rail_tan);
_pocket_nose_r  = max(0.5, min(_pocket_hw_nose, _pocket_ellipse_semi_y));

// ── Velcro slot placement ─────────────────────────────────────────────────
// Auto keeps the derived wing region / preset classic slots. Manual slides a
// pair of classic slots along the plug rail: velcro_pos sets the run from the
// plug face, the slot centers keep their outward offset past the pocket wall
// and follow the taper, and the slots stay leaned parallel to the body side.
_velcro_slide  = velcro_placement == "Manual";
_velcro_y_eff  = _velcro_slide ? _pocket_front_y - velcro_pos : velcro_hole_y_center;
_velcro_xc_eff = _velcro_slide
    ? rail_x(velcro_pos) + (velcro_hole_x_center - pocket_width / 2)
    : velcro_hole_x_center;

// ═══════════════════════════════════════════════════════════════════════════════
// 2D PROFILES
// ═══════════════════════════════════════════════════════════════════════════════

// Octagon control polygon. `bottom_drop` sinks the two cord-end vertices
// below Y = 0 — used by the rounded-bottom mode so the opened outline's tip
// stays at least T-hook-stem wide when it is clipped back to Y >= 0
// (otherwise the hook mouth swallows the rounded tip and the body starts a
// fraction of a millimetre above Y = 0).
module body_octagon_2d(bottom_drop = 0) {
    hw_bot = puller_bottom_corners / 2;
    hw_max = puller_bottom_width / 2;
    hw_mid = puller_middle_width / 2;
    hw_top = puller_top_width / 2;
    mid_y  = puller_middle_y;
    polygon([
        [-hw_bot, -bottom_drop],
        [ hw_bot, -bottom_drop],
        [ hw_max, puller_side_corner],
        [ hw_mid, mid_y],
        [ hw_top, puller_length],
        [-hw_top, puller_length],
        [-hw_mid, mid_y],
        [-hw_max, puller_side_corner]
    ]);
}

// Fitted with the other octagon controls by scripts/fit_body_outline.py
// (free parameter in the weighted outline optimization): drops the octagon's
// cord-tip vertices below Y = 0 before the opening, so the clipped flat at
// Y = 0 lands at the T-hook mouth width (the original outline is tangent to
// Y = 0 at the mouth corners) and the tip arc tracks the original within
// 0.06 mm. Also absorbs the offset() tessellation sag that would otherwise
// lift the rounded tip a fraction of a millimetre off Y = 0.
BODY_TIP_DROP = 0.1;  // see body_octagon_2d(bottom_drop)

module body_outline_2d() {
    if (body_side_rounding > 0) {
        if (body_round_bottom_only) {
            // The original's organic silhouette: the cord half is a rounded
            // blob (morphological opening of the octagon), while everything
            // above the middle waypoint keeps the crisp octagon edges so the
            // plug end / notch shoulders stay sharp. Along the side edges at
            // puller_middle_y the opened outline coincides with the octagon
            // edge (the region is locally wider than 2R), so the union seam
            // is flush. The octagon is opened with its cord tip dropped
            // below Y = 0, then clipped back to Y >= 0.
            intersection() {
                union() {
                    offset(r = body_side_rounding)
                        offset(delta = -body_side_rounding)
                            body_octagon_2d(bottom_drop = BODY_TIP_DROP);
                    intersection() {
                        body_octagon_2d();
                        translate([-500, puller_middle_y])
                            square([1000, 1000]);
                    }
                }
                translate([-500, 0]) square([1000, 1000]);
            }
        } else {
            offset(r = body_side_rounding)
                offset(delta = -body_side_rounding)
                    body_octagon_2d();
        }
    } else {
        body_octagon_2d();
    }
}

module t_hook_2d() {
    stem_half   = t_hook_base_gap / 2;
    cw_half     = t_hook_holder_width / 2;
    crossbar_y  = t_hook_length - t_hook_holder_length;
    stem_bottom = (t_hook_gap_offset > 0) ? t_hook_gap_offset : -eps;
    lo = t_hook_leg_offset;

    _shoulder = cw_half - stem_half - abs(lo);
    _stem_h   = crossbar_y - stem_bottom;

    // Each rounding type determines its own geometric cap first, then both
    // share the shoulder budget proportionally so neither starves the other.
    _tbr_geo  = min(_shoulder, _stem_h / 2);
    _cr_geo   = min(_shoulder, t_hook_holder_length / 2, t_hook_holder_width / 2);

    _tbr_want = (_tbr_geo > 0.05) ? min(t_hook_gap_side_rounding,    _tbr_geo - eps) : 0;
    _cr_want  = (_cr_geo  > 0.05) ? min(t_hook_holder_side_rounding, _cr_geo  - eps) : 0;

    _total_want = _tbr_want + _cr_want;
    _budget     = max(0, _shoulder - eps);
    _share      = (_total_want > _budget && _total_want > 0)
                ? _budget / _total_want
                : 1;

    _tbr = _tbr_want * min(_share, 1);
    _cr  = _cr_want  * min(_share, 1);

    // Mouth corners: when the stem opens at the body edge (gap_offset = 0),
    // rounding them would FLARE the opening — the original's stem walls run
    // straight to the edge, so only an inset mouth gets rounded corners.
    _mbr = (t_hook_gap_offset > 0) ? _tbr : 0;

    _n = max(4, floor(quality / 4));

    // --- Stem corners (controlled by t_hook_gap_side_rounding) ---
    _br = [for (i = [0:_n]) let(a = 270 - 90*i/_n)
        [stem_half+lo+_mbr + _mbr*cos(a),
         stem_bottom+_mbr  + _mbr*sin(a)]];
    _tr = [for (i = [0:_n]) let(a = 180 - 90*i/_n)
        [stem_half+lo+_tbr + _tbr*cos(a),
         crossbar_y-_tbr   + _tbr*sin(a)]];
    _tl = [for (i = [0:_n]) let(a = 90 - 90*i/_n)
        [-stem_half+lo-_tbr + _tbr*cos(a),
         crossbar_y-_tbr    + _tbr*sin(a)]];
    _bl = [for (i = [0:_n]) let(a = 360 - 90*i/_n)
        [-stem_half+lo-_mbr + _mbr*cos(a),
         stem_bottom+_mbr   + _mbr*sin(a)]];

    // --- Crossbar corners (controlled by t_hook_holder_side_rounding) ---
    _cbr = [for (i = [0:_n]) let(a = 270 + 90*i/_n)
        [cw_half-_cr   + _cr*cos(a),
         crossbar_y+_cr + _cr*sin(a)]];
    _ctr = [for (i = [0:_n]) let(a = 90*i/_n)
        [cw_half-_cr       + _cr*cos(a),
         t_hook_length-_cr + _cr*sin(a)]];
    _ctl = [for (i = [0:_n]) let(a = 90 + 90*i/_n)
        [-cw_half+_cr      + _cr*cos(a),
         t_hook_length-_cr + _cr*sin(a)]];
    _cbl = [for (i = [0:_n]) let(a = 180 + 90*i/_n)
        [-cw_half+_cr  + _cr*cos(a),
         crossbar_y+_cr + _cr*sin(a)]];

    polygon(concat(_br, _tr, _cbr, _ctr, _ctl, _cbl, _tl, _bl));
}

// Rounded rectangle helper: lower-left origin, size [w, h], corner radius r.
module rounded_rect_2d(w, h, r) {
    _r = min(r, w / 2, h / 2);
    if (_r > 0)
        offset(r = _r) offset(delta = -_r) square([w, h]);
    else
        square([w, h]);
}

// ── J-hook cord catch (v6) ────────────────────────────────────────────────
// A chiral cord catch: the cord enters the OFFSET stem (shifted toward the
// hand side), rises into the crossbar, and hooks over toward the CATCH side
// (where the crossbar overhangs a material shelf) — so it cannot back out.
// The stem opening sags below Y = 0 by t_hook_tip_drop.
//
// Built as ONE polygon (not a union of rectangles): the offset stem's outer
// wall can overhang the crossbar edge (sr > cr at the reference values), and
// a rectangle union would leave a stepped jag protruding into the slot at
// the junction. Instead both stem walls meet the crossbar underside through
// 45-degree blends, as on the reference mesh — the outer blend is sized to
// absorb at least the overhang, the inner blend opens the slot toward the
// catch shelf. Only the crossbar's top corners are rounded; the underside is
// the catch shelf and stays straight (a small arc eases the shelf's outer
// corner). Built for the "Right" hand; hook_hand = "Left" mirrors it.
module j_hook_2d() {
    cw   = t_hook_holder_width;
    cl   = -t_hook_catch_reach;                 // crossbar left (catch) edge
    cr   = cl + cw;                             // crossbar right edge
    cy   = max(eps, t_hook_length - t_hook_holder_length); // crossbar bottom
    ty   = t_hook_length;                       // crossbar top
    sl   = t_hook_stem_offset - t_hook_base_gap / 2;  // stem left wall
    sr   = t_hook_stem_offset + t_hook_base_gap / 2;  // stem right wall
    td   = -t_hook_tip_drop;                    // stem mouth (below Y = 0)
    _cr  = min(t_hook_holder_side_rounding, t_hook_holder_length / 2, cw / 2);

    // 45-degree stem-to-crossbar blends. The outer blend is sized to the
    // exact overhang of the stem wall past the crossbar edge — any larger
    // and the chamfer overshoots the crossbar wall, leaving a re-entrant
    // ledge; any smaller and the step is back. The inner blend (reference:
    // ~1.33 on a 4.76 stem) opens the slot toward the catch shelf.
    _b   = min(t_hook_base_gap * 0.28, (cy - td) / 2);
    _br  = min(max(0, sr - cr), cy - td);
    _bl  = min(_b, max(0, sl - cl));

    // Catch-shelf outer corner arc, kept clear of the left stem blend.
    _clr = max(0, min(_cr, sl - _bl - cl));

    _n = max(4, floor(quality / 4));
    _arc = function(cx0, cy0, r, a0)
        [for (i = [0:_n]) [cx0 + r * cos(a0 + 90 * i / _n),
                           cy0 + r * sin(a0 + 90 * i / _n)]];

    _hand = (_resolved_hook_hand == "Left") ? -1 : 1;
    scale([_hand, 1])
        polygon(concat(
            // stem mouth and right wall
            [[sl, td], [sr, td]],
            // outer 45° chamfer absorbing the stem's overhang past the
            // crossbar edge (empty when the stem sits inside the crossbar)
            (_br > 0) ? [[sr, cy - _br]] : [],
            // crossbar underside on the stem's outer side
            (sr - _br < cr - eps) ? [[sr - _br, cy], [cr, cy]] : [[cr, cy]],
            // crossbar right wall + rounded top corners + left wall
            _arc(cr - _cr, ty - _cr, _cr, 0),
            _arc(cl + _cr, ty - _cr, _cr, 90),
            // catch-shelf outer corner (quarter arc), then the shelf
            _arc(cl + _clr, cy + _clr, _clr, 180),
            // inner 45° blend from the shelf down into the stem left wall
            [[sl - _bl, cy], [sl, cy - _bl]]
        ));
}

module plug_wall_notch_2d() {
    // Rectangle overshooting the top edge by 10 mm; with rounding, the
    // morphological opening rounds the (convex) bottom corners while the
    // top corners stay far outside the body, so the mouth remains open.
    _r = min(plug_wall_notch_rounding,
             plug_wall_notch_height,
             plug_wall_notch_width / 4);
    _h = plug_wall_notch_height + 10;
    // Mouth blend: the original rounds the convex corner where each notch
    // wall meets the top edge with a fillet at half the bottom rounding
    // (0.05 in vs 0.1 in). Cut square-minus-arc wedges so the fillet stays
    // tangent to both the wall and the top edge.
    _m = _r / 2;
    union() {
        if (_r > 0) {
            offset(r = _r) offset(delta = -_r)
                translate([-plug_wall_notch_width / 2,
                           puller_length - plug_wall_notch_height])
                    square([plug_wall_notch_width, _h]);
        } else {
            translate([-plug_wall_notch_width / 2,
                       puller_length - plug_wall_notch_height])
                square([plug_wall_notch_width, _h]);
        }
        if (_m > 0)
            for (s = [-1, 1])
                translate([s * plug_wall_notch_width / 2, puller_length - _m])
                    scale([s, 1])
                        difference() {
                            square([_m + 0.01, _m + 1]);
                            translate([_m, 0]) circle(r = _m, $fn = quality);
                        }
    }
}

module velcro_slot_2d() {
    if (velcro_side_rounding > 0) {
        _r = min(velcro_side_rounding, velcro_hole_width / 2, velcro_hole_length / 2);
        offset(r = _r) offset(delta = -_r)
            square([velcro_hole_width, velcro_hole_length], center = true);
    } else {
        square([velcro_hole_width, velcro_hole_length], center = true);
    }
}

// Dome pocket 2D footprints (used by the cutters and the 2D debug overlay).
module pocket_seat_2d() {
    translate([0, puller_length])
        circle(d = pocket_seat_diameter, $fn = quality);
}

// Plug-recess footprint in absolute coordinates (the taper-aware rail pocket).
// Name kept from v6 for the wing keep-out and 2D-debug call sites.
module pocket_ellipse_2d() {
    translate([0, _pocket_ellipse_center_y])
        pocket_recess_footprint_2d();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3D BODIES
// ═══════════════════════════════════════════════════════════════════════════════

// A rolling-ball roundover band, 0 <= Z <= r, its face at Z = r. At each
// height the ball's cross-section is the morphological OPENING of the
// outline, offset(r = w) of offset(delta = -r), with w = sqrt(r^2 - h^2) at
// height h. The band is stacked from ROUNDOVER_STEP layers, each taking w at
// its own top, so every step sits on or just inside the smooth surface.
// This replaces minkowski() with a sphere, which gave the same surface but
// which the WebAssembly build of OpenSCAD (the one browsers run) cannot
// finish its fast way: its CGAL hull fails and it falls back to a method
// that took 23 s to preview this body, against 0.4 s on desktop.
module roundover_layers_3d(r) {
    assert(quality >= 24 && quality <= 128, "quality must be 24 to 128");
    _n  = max(1, ceil(r / ROUNDOVER_STEP));
    _dz = r / _n;
    for (i = [0 : _n - 1]) {
        _h = (i + 1) * _dz;
        translate([0, 0, i * _dz])
            linear_extrude(height = _dz + (i < _n - 1 ? eps : 0))
                offset(r = sqrt(max(0, r * r - _h * _h)))
                    offset(delta = -r) children();
    }
}

// Z-edge roundover. The opening also rounds convex plan corners (the crisp
// plug-end corners, the notch mouth), but the original only loses them
// inside the fillet band, so each band is unioned with a full-outline prism
// that stops where the band begins: below that plane the sharp outline
// wins, above it the ball fillet is the only material.
module plug_puller_body_3d() {
    assert(body_top_rounding >= 0 && body_top_rounding <= 5,
           "body_top_rounding must be 0 to 5 mm");
    assert(body_bottom_rounding >= 0 && body_bottom_rounding <= 5,
           "body_bottom_rounding must be 0 to 5 mm");
    _rt = min(body_top_rounding, body_thickness / 2);
    _rb = min(body_bottom_rounding, body_thickness / 2);

    intersection() {
        linear_extrude(height = body_thickness)
            body_outline_2d();
        if (_rt > 0)
            union() {
                linear_extrude(height = body_thickness - _rt + eps)
                    body_outline_2d();
                translate([0, 0, body_thickness - _rt])
                    roundover_layers_3d(_rt) body_outline_2d();
            }
        if (_rb > 0)
            union() {
                translate([0, 0, _rb - eps])
                    linear_extrude(height = body_thickness - _rb + eps)
                        body_outline_2d();
                translate([0, 0, _rb])
                    mirror([0, 0, 1])
                        roundover_layers_3d(_rb) body_outline_2d();
            }
    }
}

// ── Dome pocket cutters ────────────────────────────────────────────────────────
// The original's pocket is two partial-depth recesses cut from the top face:
//   1. Plug-body recess: an ellipse (pocket_width wide, reaching from just
//      past the top edge down to puller_length - pocket_depth), floor at
//      pocket_floor.
//   2. Seat recess: a circle of pocket_seat_diameter centered ON the top
//      edge, floor at pocket_seat_floor (deeper). Its overhang beyond the
//      wall notch forms the two shoulder tabs; between its near-vertical
//      wall and the outline's taper edge a razor-thin raised rim survives
//      to ~5.5 mm — both present on the original.
// The footprint at each FLOOR equals the named dimension; every flare below
// grows outward above the floor. The wall notch (full-thickness cutout)
// then bites through both recesses. No fill pieces are needed — recesses
// are plain difference() cuts.
//
// Wall-blend calibration, fitted to the original's measured wall profiles
// (validation/fidelity_report.json "pocket_walls"; all values in mm):
//   - Seat wall: 0.1 lead-in over the first 0.535, then vertical, then a
//     +0.2 flare over the last 1.3 to the top face.
//   - Seat -> recess-floor blend: on the arc facing the body interior the
//     original ramps the seat wall out to +0.805 at the recess-floor level
//     (a two-cone convex ramp); the tab-side arc keeps the near-vertical
//     wall. Modeled as a cone pair clipped to the recess footprint.
//   - Recess (ellipse) wall: S-blend lead-in, ~1.06 total normal flare
//     over the first 1.25, then vertical (3-segment piecewise cone).
POCKET_SEAT_LEAD_RUN   = 0.1;
POCKET_SEAT_LEAD_RISE  = 0.535;
POCKET_SEAT_TOP_RUN    = 0.2;
POCKET_SEAT_TOP_RISE   = 1.3;
POCKET_BLEND_RUN_MID   = 0.155;  // blend ramp radius at the knee...
POCKET_BLEND_RISE_MID  = 0.433;  // ...placed this fraction up the floor gap
POCKET_BLEND_RUN_TOP   = 0.805;  // blend ramp radius at the recess floor
POCKET_ELLIPSE_BLEND   = [       // [normal flare, rise above recess floor]
    [0.44, 0.2],
    [0.88, 0.55],
    [1.06, 1.25],
];

// Taper-aware plug-recess footprint (centered on _pocket_ellipse_center_y by
// the caller). Straight side walls following the plug rail from the plug-face
// end (top) down to a rounded nose at the inner end; at pocket_side_angle = 0
// it is a rounded-nose rectangle of width pocket_width. `flare` grows the
// whole footprint outward (used by the S-blend cone stack); every flared
// version stays convex so the caller's hull() slices remain well-formed.
module pocket_recess_footprint_2d(flare = 0) {
    _sy = _pocket_ellipse_semi_y;
    offset(delta = flare)
        hull() {
            // Straight tapered sides from the plug-face bar to the nose shoulder.
            polygon([
                [ _pocket_hw_top,  _sy],
                [ _pocket_hw_nose, -_sy + _pocket_nose_r],
                [-_pocket_hw_nose, -_sy + _pocket_nose_r],
                [-_pocket_hw_top,  _sy],
            ]);
            // Rounded nose at the inner end.
            translate([0, -_sy + _pocket_nose_r])
                circle(r = _pocket_nose_r, $fn = quality);
        }
}

module pocket_dome_cutters_3d() {
    _seat_floor = min(pocket_seat_floor, body_thickness);
    _body_floor = min(pocket_floor, body_thickness);
    _seat_r     = pocket_seat_diameter / 2;
    _seat_depth = body_thickness - _seat_floor;
    _gap        = max(0, _body_floor - _seat_floor);

    // Plug-body recess: S-blend collar (stacked hulls between normal
    // offsets of the footprint — every slice is convex), vertical above.
    _prof = concat([[0, 0]],
                   [for (p = POCKET_ELLIPSE_BLEND)
                       [p[0], min(p[1], body_thickness - _body_floor)]]);
    _top_i = len(_prof) - 1;
    translate([0, _pocket_ellipse_center_y, _body_floor]) {
        for (i = [0 : _top_i - 1])
            if (_prof[i + 1][1] > _prof[i][1])
                hull() {
                    translate([0, 0, _prof[i][1]])
                        linear_extrude(height = eps)
                            pocket_recess_footprint_2d(_prof[i][0]);
                    translate([0, 0, _prof[i + 1][1]])
                        linear_extrude(height = eps)
                            pocket_recess_footprint_2d(_prof[i + 1][0]);
                }
        translate([0, 0, _prof[_top_i][1]])
            linear_extrude(height = max(eps, body_thickness - _body_floor
                                             - _prof[_top_i][1]) + eps)
                pocket_recess_footprint_2d(_prof[_top_i][0]);
    }

    // Seat recess: micro lead-in cone, vertical wall, slight top flare.
    // The floor radius carries a +eps nick: when the seat is tangent to the
    // plug-end corners (pocket_seat_diameter == puller_top_width, as on the
    // original), an exact-radius cutter would graze the corner edge along a
    // line and leave non-manifold contact edges; the nick turns the graze
    // into a real crossing. The center likewise sits +eps PAST the plug
    // face: centered exactly on it, the cylinder's tangency lines at
    // x = ±r lie inside the face plane and graze it the same way (seen on
    // the lamp preset).
    _r0     = _seat_r + eps;
    _lead_h = min(POCKET_SEAT_LEAD_RISE, _seat_depth);
    _top_h  = min(POCKET_SEAT_TOP_RISE, max(0, _seat_depth - _lead_h));
    _mid_h  = max(eps, _seat_depth - _lead_h - _top_h);
    _r_wall = _r0 + POCKET_SEAT_LEAD_RUN;
    translate([0, puller_length + eps, _seat_floor]) {
        cylinder(h = _lead_h, r1 = _r0, r2 = _r_wall, $fn = quality);
        translate([0, 0, _lead_h])
            cylinder(h = _mid_h + eps, r = _r_wall, $fn = quality);
        translate([0, 0, _lead_h + _mid_h])
            cylinder(h = _top_h + eps, r1 = _r_wall,
                     r2 = _r_wall + POCKET_SEAT_TOP_RUN, $fn = quality);
    }

    // Seat -> recess-floor blend ramp, clipped to the recess footprint so
    // it only exists on the interior arc (the tab side stays vertical).
    // Like the seat above, the cone pair sits +eps PAST the plug face:
    // centered exactly on it, the cones' tangency lines at x = ±r lie
    // inside the face plane and graze it, leaving non-manifold contact
    // edges (surfaced as a non-watertight export whenever the blend radius
    // pokes past the clipped footprint wall near the face — e.g. thick
    // cords or long plugs lengthening the body).
    if (_gap > 0.01)
        intersection() {
            translate([0, puller_length + eps, _seat_floor]) {
                cylinder(h = POCKET_BLEND_RISE_MID * _gap,
                         r1 = _r0, r2 = _r0 + POCKET_BLEND_RUN_MID,
                         $fn = quality);
                translate([0, 0, POCKET_BLEND_RISE_MID * _gap])
                    cylinder(h = (1 - POCKET_BLEND_RISE_MID) * _gap + eps,
                             r1 = _r0 + POCKET_BLEND_RUN_MID,
                             r2 = _r0 + POCKET_BLEND_RUN_TOP,
                             $fn = quality);
            }
            translate([0, _pocket_ellipse_center_y, _seat_floor - eps])
                linear_extrude(height = _gap + 3 * eps)
                    pocket_recess_footprint_2d();
        }
}

// Body with the plug pocket carved out.
module plug_puller_body_pocketed_3d() {
    difference() {
        plug_puller_body_3d();
        pocket_dome_cutters_3d();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3D CUTOUTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Z-edge flare for arbitrary 2D cutouts ─────────────────────────────────────
// Rounds the rim where a through-cutout meets the top/bottom face: the
// cutout opening grows by `fr` at the face, following a quarter-circle
// profile, approximated by `_flare_slices()` stacked straight extrusions
// (each ~fr/n tall, well under a print layer at default quality).
//
// This replaces the earlier minkowski-of-a-thin-shell construction, which
// produced near-degenerate faces and non-watertight exports (the "minkowski
// rounding artifact" documented against the old Small Plug fixture).
function _flare_slices() = max(6, floor(quality / 6));

// Children: the 2D profile to flare. Emits the flare wedge in Z = [0, fr]
// where Z = fr is the FACE plane (offset grows to `fr` there, quarter-round
// profile o(z) = fr - sqrt(fr^2 - z^2)) and Z = 0 is the interior end
// (offset 0). Place with translate([0,0,face_z - fr]) for a top face, or
// translate([0,0,fr]) mirror([0,0,1]) for a bottom face. The outermost slice
// overshoots the face by eps so the boolean difference cuts cleanly.
module _rim_flare_2d(fr) {
    _n = _flare_slices();
    for (i = [0 : _n - 1]) {
        _z0 = fr * i / _n;
        _z1 = fr * (i + 1) / _n;
        _o  = fr - sqrt(max(0, fr * fr - _z1 * _z1));
        translate([0, 0, _z0])
            linear_extrude(height = (_z1 - _z0) + eps)
                offset(delta = _o)
                    children();
    }
}

module t_hook_3d() {
    _tfr = min(t_hook_top_bottom_rounding,
               t_hook_base_gap / 2,
               t_hook_holder_length / 2,
               body_thickness / 2);

    translate([0, 0, -eps])
        linear_extrude(height = body_thickness + 2 * eps)
            j_hook_2d();
    if (_tfr > 0) {
        // bottom-face flare (opens toward Z = 0)
        translate([0, 0, _tfr])
            mirror([0, 0, 1])
                _rim_flare_2d(_tfr) j_hook_2d();
        // top-face flare (opens toward Z = body_thickness)
        translate([0, 0, body_thickness - _tfr])
            _rim_flare_2d(_tfr) j_hook_2d();
    }
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

module finger_holes_3d() {
    $fn = quality;
    r     = finger_hole_diameter / 2;
    h_cut = body_thickness + 2 * eps;
    fr    = min(finger_hole_rounding, r, body_thickness / 2);

    module single_hole(x) {
        translate([x, finger_hole_y, -eps]) {
            cylinder(r = r, h = h_cut);
            if (fr > 0) {
                translate([0, 0, eps])
                    fillet_ring(r, fr);
                translate([0, 0, eps + body_thickness])
                    mirror([0, 0, 1])
                        fillet_ring(r, fr);
            }
        }
    }

    single_hole(-finger_hole_spacing / 2);
    single_hole( finger_hole_spacing / 2);
}

module plug_wall_notch_3d() {
    translate([0, 0, -eps])
        linear_extrude(height = body_thickness + 2 * eps)
            plug_wall_notch_2d();
}

// Rail-based zip-tie holes: one pair per station in _zip_centers, flanking
// the plug just outside the pocket wall. A top-face countersink flares each
// hole so the zip-tie head seats flush.
module zip_tie_holes_3d() {
    $fn = quality;
    h_cut = body_thickness + 2 * eps;
    _cs   = min(zip_tie_countersink, body_thickness * 0.6);
    for (c = _zip_centers)
        for (s = [-1, 1]) {
            translate([s * c[0], c[1], -eps])
                cylinder(d = zip_tie_hole_diameter, h = h_cut);
            if (_cs > 0)
                translate([s * c[0], c[1], body_thickness - _cs])
                    cylinder(h = _cs + eps,
                             r1 = zip_tie_hole_diameter / 2,
                             r2 = zip_tie_hole_diameter / 2 + _cs);
        }
}

// ── Wing velcro (v6 default) ──────────────────────────────────────────────
// Keep-out union: the finger circles, the pocket seat + ellipse footprint,
// and the four zip holes, each grown by its web width. The wing region is the
// body interior (inset from the side edge) minus these keep-outs, restricted
// to the Y band between the finger-hole top and the notch. Symmetric inputs
// yield both wings at once.
module _wing_keepouts_2d() {
    for (s = [-1, 1])
        translate([s * finger_hole_spacing / 2, finger_hole_y])
            circle(d = finger_hole_diameter + 2 * FIT_WING_FINGER_WEB, $fn = quality);
    offset(delta = FIT_WING_POCKET_WEB) pocket_ellipse_2d();
    offset(delta = FIT_WING_POCKET_WEB) pocket_seat_2d();
    for (c = _zip_centers)
        for (s = [-1, 1])
            translate([s * c[0], c[1]])
                circle(d = zip_tie_hole_diameter + 2 * FIT_WING_ZIP_WEB, $fn = quality);
    // Centerline keep-out: the finger-circle, pocket, and zip keep-outs do
    // not quite cover the sliver of dead space on the midline (above the
    // finger holes, below the pocket, between the zip columns), so the
    // difference() would leave a spurious third hole there. A band reaching
    // to the innermost zip column merges into the zip keep-outs and stays
    // well inboard of the wings.
    _hw = max([for (c = _zip_centers) c[0]]);
    translate([-_hw, 0])
        square([2 * _hw, puller_length + 1]);
}

module velcro_wing_2d() {
    _r = FIT_WING_ROUND;
    _y_lo = finger_hole_y + finger_hole_diameter / 2;
    _y_hi = puller_length - plug_wall_notch_height - 2;
    // The wing opening must clear the strap: if the natural region is too
    // narrow, the +web pocket keep-out is the only thing that would pinch it,
    // so the strap_width check surfaces as validation W-14 rather than forcing
    // geometry here.
    offset(r = _r) offset(delta = -_r)
        intersection() {
            difference() {
                offset(delta = -FIT_WING_SIDE_INSET) body_outline_2d();
                _wing_keepouts_2d();
            }
            translate([-500, _y_lo]) square([1000, max(eps, _y_hi - _y_lo)]);
        }
}

module velcro_holes_3d() {
    _vfr = min(velcro_top_bottom_rounding,
               velcro_hole_width / 2,
               velcro_hole_length / 2,
               body_thickness / 2);

    module _extrude_flared() {
        translate([0, 0, -eps])
            linear_extrude(height = body_thickness + 2 * eps)
                children();
        if (_vfr > 0) {
            translate([0, 0, _vfr])
                mirror([0, 0, 1])
                    _rim_flare_2d(_vfr) children();
            translate([0, 0, body_thickness - _vfr])
                _rim_flare_2d(_vfr) children();
        }
    }

    module _single_slot(xc, rot) {
        translate([xc, _velcro_y_eff, 0])
            rotate([0, 0, rot])
                _extrude_flared() velcro_slot_2d();
    }

    // Manual placement always slides classic slots (a wing region can't be
    // dialed along the rail); Auto keeps the resolved wing/classic style.
    if (_resolved_velcro_style == "Wing" && !_velcro_slide) {
        _extrude_flared() velcro_wing_2d();
    } else {
        // Classic slots lean parallel to the adjacent body side edges. Left
        // slot rotates CW (-rotation), right slot CCW (+rotation).
        _single_slot(-_velcro_xc_eff, -velcro_hole_rotation);
        _single_slot(_velcro_xc_eff, velcro_hole_rotation);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE CUTOUT GROUP
// ═══════════════════════════════════════════════════════════════════════════════

// Union of all feature cutouts (holes, notches, slots — NOT the pocket).
module plug_puller_cutouts_3d() {
    if (enable_t_hook)     t_hook_3d();
    if (enable_finger_holes)    finger_holes_3d();
    if (enable_plug_wall_notch) plug_wall_notch_3d();
    if (enable_zip_tie_holes)   zip_tie_holes_3d();
    if (enable_velcro_holes)    velcro_holes_3d();
}

// Selective cutout: only the specified feature, ignoring enable toggles.
// Used by the "Only ..." render modes for validation.
module single_cutout_3d(feature) {
    if (feature == "finger_holes")    finger_holes_3d();
    if (feature == "t_hook")     t_hook_3d();
    if (feature == "wall_notch")      plug_wall_notch_3d();
    if (feature == "zip_tie_holes")   zip_tie_holes_3d();
    if (feature == "velcro_holes")    velcro_holes_3d();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSEMBLY MODULES
// ═══════════════════════════════════════════════════════════════════════════════

// Full device: pocketed body - feature cutouts.
module plug_puller_complete() {
    difference() {
        plug_puller_body_pocketed_3d();
        plug_puller_cutouts_3d();
    }
}

// The plug body as measured in Step 1, where it lies in the tool: the
// prong-end width at the plug end (Y = puller_length), the cord-end width
// one plug length back, standing on the pocket floor as tall as the plug is
// thick. Built from the plug's numbers, not the pocket's, so it shows the
// fit rather than repeating the pocket.
module plug_body_1s_3d() {
    module slice(y, w) {
        _r = 0.15 * min(w, _eff_plug_thickness);
        translate([0, y, pocket_floor + _eff_plug_thickness / 2])
            rotate([90, 0, 0])
                linear_extrude(height = 0.01, center = true)
                    offset(r = _r) offset(delta = -_r)
                        square([w, _eff_plug_thickness], center = true);
    }
    hull() {
        slice(puller_length, _eff_plug_width_wall);
        slice(puller_length - _eff_plug_length, _eff_plug_width_cable);
    }
}

// See-through plug for the preview only: the % background modifier keeps it
// out of every render and export.
module plug_preview_1s() {
    if (show_plug_preview)
        %color("SkyBlue", 0.35) plug_body_1s_3d();
}

// Body with all cutouts (identical to the full device; kept as a named
// entry point for the "Body Only" render mode).
module body_with_cutouts() {
    difference() {
        plug_puller_body_pocketed_3d();
        plug_puller_cutouts_3d();
    }
}

// Plain body + a single feature cut — no pocket. Matches the
// research decomposition variants ("No Holes except X"), which are plain
// slabs with one cutout each.
module plug_puller_single_feature(feature) {
    difference() {
        plug_puller_body_3d();
        single_cutout_3d(feature);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MODEL VALIDATION WARNINGS
// ═══════════════════════════════════════════════════════════════════════════════
// Non-fatal sanity checks. When a check fails, the module emits red extruded
// text lying FLAT ON THE PRINT BED (Z = 0, 1 mm thick) just past the plug end
// of the model. The tag deliberately survives STL export (fail-loudly: a bad
// measurement must fail loudly, in the user's own vocabulary, before filament
// is wasted) — and because it sits on the bed, a warned export prints as a
// legible red-flag coupon next to the part instead of airborne spaghetti.
// Every firing warning is also echoed to the console ("WARNING: …") so
// CLI / CI renders surface it in the logs. The geometry of the part itself
// is unaffected — users still see the model they asked for.
//
// Checks (each is independent; all that trip are reported):
//   W-1  a measurement is outside its plausibility window
//        (window = its slider range; catches inch entries like 1.25)
//   W-2  finger holes physically can't fit the hand-derived body
//   W-3  plug wider than the notch clamp ceiling supports
//   W-4  plug longer than the pocket budget — pocket truncated at the
//        120 mm body ceiling
//   W-5  T-hook stem clamped below cord + minimum sliding fit
//   W-6  finger holes collide with the plug pocket
//   W-7  web between the finger holes below 6 mm (weak bridge)
//   W-8  a pocket floor leaves no recess (floor >= body_thickness)
//   W-9  a pocket floor is too thin to print (0 < floor < 1.2)
//   W-10 finger holes overrun the body edge at finger_hole_y
//   W-11 the pocket (seat disc / ellipse) is wider than the body at its Y
//   W-12 plug wall notch wider than the top body edge
//   W-13 zip tie grid below the cord end (Y < 0) or outside body at bottom row
//   W-14 / W-15 wing opening narrower than the strap / collapsed
//   W-16 zip hole too close to a finger bore (wall below 0.5)
//   W-17 zip rows overlapping each other (merged bores)
//   W-18 zip hole breaking into a classic velcro slot
//   W-19 two-station width taper steeper than the plug rail window
//   W-20 plug 24 mm or thicker: a job for the two-sided puller file
//
// Auto-fit (always on for the measured sizes) clamps most inputs into safe
// ranges, so warnings should be quiet under normal use. In the measured
// sizes the messages name the *measurement* to re-check; in Custom they keep
// the precise internal wording for power users.
//
// W-0: when a measured size is active and nothing fires, a green
// preview-only confirmation tag shows the applied measurements
// ($preview-gated — never exported).

WARNING_TEXT_SIZE  = 4.5;
WARNING_TEXT_DEPTH = 1.0;
WARNING_LINE_GAP   = WARNING_TEXT_SIZE + 2;

// True when a measured size is active (selects the measurement-language
// warning variants below). "Medium Defaults" (the one-shot Custom reset)
// ignores measurements, so it uses the engineering wording.
_vw_measured = (_p != "Custom" && _p != "Medium Defaults");

// Boolean checks. Pulled out into named functions so the message list below
// stays narrow enough to read.

// -- W-1: measurement plausibility windows (= slider ranges) ------------------
function _vw_measure_bad(v, lo, hi) = v < lo || v > hi;

// -- W-2 … W-5: measured-mode cross-checks ------------------------------------
function _vw_finger_vs_hand() =
    _fit_finger_width + FIT_GRIP_CLEARANCE > 0.4 * puller_bottom_width;

function _vw_plug_too_wide() =
    _eff_plug_width_wall + 2 * FIT_SLIDE_CLEARANCE > 40;

// W-20: the one-sided puller cannot hold a plug this thick; the two-sided
// puller file can.
function _vw_plug_too_thick_for_one_sided() =
    _vw_measured && _eff_plug_thickness >= 24;

// W-4: the pocket was actually truncated — the plug is longer than the
// depth budget left inside the 120 mm body ceiling (D-19).
function _vw_plug_too_deep() =
    _eff_plug_length - pocket_depth > 0.01;

// W-19: the width stations describe a taper steeper than the plug rail's
// clamp window (D-43) — the pocket walls can no longer follow the plug.
function _vw_plug_taper_steep() =
    _eff_plug_side_angle < -15 || _eff_plug_side_angle > 25;

function _vw_cord_too_thick() =
    t_hook_base_gap < _eff_cord_thickness + 0.5;

// -- W-6: finger-hole / pocket collision ---------------------------------------
// Vertical gap between the pocket's inner end and the finger-hole rim.
function _vw_finger_pocket_collision() =
    enable_finger_holes
    && (_pocket_inner_end_y
            - (finger_hole_y + finger_hole_diameter / 2)
        < (_vw_measured ? 1 : 0));

// -- W-7: finger-hole web ------------------------------------------------------
function _vw_finger_web_too_thin() =
    enable_finger_holes
    && (finger_hole_spacing - finger_hole_diameter < 6);

// -- W-8 / W-9: pocket floor recess and printability ---------------------------
// The two floors are pocket_seat_floor (seat) and pocket_floor (plug recess).
function _vw_floor_no_recess(thickness) =
    thickness >= body_thickness;

function _vw_floor_too_thin(thickness) =
    thickness > 0 && thickness < 1.2;

// -- W-10 … W-13: envelope checks ----------------------------------------------
function _vw_finger_overrun() =
    enable_finger_holes
    && (finger_hole_spacing / 2 + finger_hole_diameter / 2
        > body_half_width_at_y(finger_hole_y));

function _vw_seat_overrun() =
    pocket_seat_diameter > puller_top_width;

function _vw_pocket_overrun() =
    pocket_width / 2
    > body_half_width_at_y(min(_pocket_ellipse_center_y, puller_length));

function _vw_notch_too_wide() =
    enable_plug_wall_notch && plug_wall_notch_width > puller_top_width;

function _vw_zip_below_end() =
    enable_zip_tie_holes
    && (min([for (c = _zip_centers) c[1]]) - zip_tie_hole_diameter / 2 < 0);

function _vw_zip_off_body() =
    enable_zip_tie_holes
    && max([for (c = _zip_centers)
                c[0] + zip_tie_hole_diameter / 2 - body_half_width_at_y(c[1])]) > 0;

// -- W-16: zip / finger-hole barrier --------------------------------------------
// Zip stations flank the plug near the plug face while the finger holes anchor
// toward the cord; a short body or an aggressive manual station can drive them
// together. Fires when the bore-to-bore wall between any zip hole and either
// finger hole drops below 0.5. Auto-fit caps the zip X inside the body, so with
// Auto placement this fires only with auto-fit off or hostile manual stations.
function _vw_zip_hits_fingers() =
    enable_zip_tie_holes && enable_finger_holes
    && min([for (c = _zip_centers, sf = [-1, 1])
                let (dx = c[0] - sf * finger_hole_spacing / 2,
                     dy = c[1] - finger_hole_y)
                sqrt(dx * dx + dy * dy)])
       < finger_hole_diameter / 2 + zip_tie_hole_diameter / 2 + 0.5;

// -- W-17: zip rows overlapping each other ---------------------------------------
// Mis-set Manual positions (or a pathological Auto squeeze) can land two rows
// on top of each other — the holes merge and the tie has nothing to bear on.
// Both columns are checked (same-side pairs and across the centerline).
function _vw_zip_rows_overlap() =
    enable_zip_tie_holes && len(_zip_centers) > 1
    && min([for (i = [0 : len(_zip_centers) - 2],
                 j = [i + 1 : len(_zip_centers) - 1],
                 sf = [-1, 1])
                let (dx = _zip_centers[i][0] - sf * _zip_centers[j][0],
                     dy = _zip_centers[i][1] - _zip_centers[j][1])
                sqrt(dx * dx + dy * dy)])
       < zip_tie_hole_diameter + 0.6;

// -- W-18: zip hole breaking into a classic velcro slot --------------------------
// Only meaningful when rectangular slots are actually rendered (Classic style
// or Manual velcro placement); the wing region already keeps out of the zip
// holes by construction. Distance from a hole center to the rotated slot
// rectangle, evaluated in the slot's own frame.
function _vw_zip_slot_dist(c, sx, sy, rot) =
    let (dx0 = c[0] - sx, dy0 = c[1] - sy,
         lx  =  dx0 * cos(rot) + dy0 * sin(rot),
         ly  = -dx0 * sin(rot) + dy0 * cos(rot),
         qx  = max(abs(lx) - velcro_hole_width / 2, 0),
         qy  = max(abs(ly) - velcro_hole_length / 2, 0))
    sqrt(qx * qx + qy * qy);
function _vw_zip_hits_velcro() =
    enable_zip_tie_holes && enable_velcro_holes
    && (_resolved_velcro_style != "Wing" || _velcro_slide)
    && min([for (c = _zip_centers, sf = [-1, 1])
                _vw_zip_slot_dist([sf * c[0], c[1]],
                                  _velcro_xc_eff, _velcro_y_eff,
                                  velcro_hole_rotation)])
       < zip_tie_hole_diameter / 2 + 0.5;

// -- W-14 / W-15: v6 wing checks -------------------------------------------------
// Lateral opening available for the wing at a given Y: distance from the pocket
// keep-out edge out to the inset body edge (0 where the pocket is absent).
function _pocket_half_at(y) =
    let (dy = y - _pocket_ellipse_center_y,
         t  = 1 - pow(dy / _pocket_ellipse_semi_y, 2))
    (t > 0 ? pocket_width / 2 * sqrt(t) + FIT_WING_POCKET_WEB : 0);
function _wing_open_at(y) =
    body_half_width_at_y(y) - FIT_WING_SIDE_INSET - _pocket_half_at(y);
// The strap threads through the widest part of the wing band, so use the max
// lateral opening between the finger-hole top and the notch as the metric.
function _wing_band_lo() = finger_hole_y + finger_hole_diameter / 2;
function _wing_band_hi() = puller_length - plug_wall_notch_height - 2;
function _vw_wing_opening() =
    max([for (i = [0:8])
            _wing_open_at(_wing_band_lo()
                          + i * (_wing_band_hi() - _wing_band_lo()) / 8)]);
function _vw_wing_too_narrow() =
    enable_velcro_holes && _resolved_velcro_style == "Wing"
    && (_vw_wing_opening() < strap_width_eff + 1);
function _vw_wing_web_collapsed() =
    enable_velcro_holes && _resolved_velcro_style == "Wing"
    && (_vw_wing_opening() < 2);

module validation_warnings() {
    _messages = [
        for (entry = [
            // W-1 — measurement plausibility (measured sizes only). Windows
            // are the slider ranges; the finger/hand rows apply only when
            // the hand sliders are actually in play.
            [_vw_measured && !_pp_active && _vw_measure_bad(measure_plug_length, 12, 85),
             "CHECK PLUG LENGTH MEASUREMENT (MM?)"],
            [_vw_measured && !_pp_active
                && (_vw_measure_bad(measure_plug_width_prong_end, 8, 38)
                    || _vw_measure_bad(measure_plug_width_cord_end, 8, 38)),
             "CHECK PLUG WIDTH MEASUREMENTS (MM?)"],
            [_vw_measured && !_pp_active
                && (_vw_measure_bad(measure_plug_thickness_prong_end, 4, 40)
                    || _vw_measure_bad(measure_plug_thickness_cord_end, 4, 40)),
             "CHECK PLUG THICKNESS MEASUREMENTS (MM?)"],
            [_vw_measured && !_pp_active && _vw_measure_bad(measure_cord_thickness, 1.5, 9),
             "CHECK CORD THICKNESS MEASUREMENT (MM?)"],
            [_vw_measured && size == "Measure my hand"
                && _vw_measure_bad(measure_finger_width, 14, 32),
             "CHECK FINGER WIDTH MEASUREMENT (MM?)"],
            [_vw_measured && size == "Measure my hand"
                && _vw_measure_bad(measure_hand_width, 60, 110),
             "CHECK HAND WIDTH MEASUREMENT (MM?)"],
            // W-2 … W-5 — measured-mode cross-checks
            [_vw_measured && _vw_finger_vs_hand(),
             "FINGER TOO BIG FOR HAND WIDTH - RECHECK BOTH"],
            [_vw_measured && _vw_plug_too_wide(),
             "PLUG TOO WIDE FOR THIS DESIGN (MAX 38MM)"],
            // W-20 — a plug 24 mm or thicker belongs to the two-sided file
            [_vw_plug_too_thick_for_one_sided(),
             "PLUG THICKER THAN 24MM - USE THE TWO-SIDED PULLER FILE"],
            // W-4 fires only when the pocket was actually truncated at the
            // 120 mm body ceiling — the tool still works, but the pocket is
            // shorter than the plug. Preset lengths are trusted reference
            // values yet can still trip this with very large hands.
            [_vw_measured && _vw_plug_too_deep(),
             "PLUG LONGER THAN POCKET LIMIT - POCKET SHORTENED"],
            [_vw_measured && _vw_cord_too_thick(),
             "CORD TOO THICK FOR HOOK SLOT"],
            // W-19 — two-station taper steeper than the rail window
            [_vw_measured && !_pp_active && _vw_plug_taper_steep(),
             "PLUG WIDTH TAPER TOO STEEP - RECHECK BOTH WIDTHS"],
            // W-6 / W-7 — finger-hole safety (all modes)
            [_vw_finger_pocket_collision(),
             "FINGER HOLES HIT PLUG POCKET"],
            [_vw_finger_web_too_thin(),
             "FINGER HOLES TOO CLOSE - WEAK BRIDGE"],
            // W-8 / W-9 — pocket floor recess and printability (all modes)
            [_vw_floor_no_recess(pocket_seat_floor),
             "SEAT HAS NO RECESS - PLUG WONT NEST"],
            [_vw_floor_no_recess(pocket_floor),
             "POCKET HAS NO RECESS - PLUG WONT NEST"],
            [_vw_floor_too_thin(pocket_seat_floor),
             "SEAT FLOOR TOO THIN TO PRINT"],
            [_vw_floor_too_thin(pocket_floor),
             "POCKET FLOOR TOO THIN TO PRINT"],
            // W-10 … W-13 — envelope checks (measurement language in the
            // measured sizes, original wording otherwise)
            [_vw_finger_overrun(),
             _vw_measured ? "FINGER HOLES OUTSIDE BODY - INCREASE HAND WIDTH"
                          : "FINGER HOLES OUTSIDE BODY"],
            [_vw_seat_overrun(),
             _vw_measured ? "PLUG SEAT OVERHANGS BODY - RECHECK PLUG WIDTH"
                          : "POCKET SEAT WIDER THAN TOP EDGE"],
            [_vw_pocket_overrun(),
             _vw_measured ? "PLUG POCKET OVERHANGS BODY - RECHECK PLUG WIDTH"
                          : "POCKET WIDER THAN BODY"],
            [_vw_notch_too_wide(),
             _vw_measured ? "PLUG TOO WIDE FOR TOOL END - CHECK PLUG WIDTH"
                          : "WALL NOTCH WIDER THAN TOP EDGE"],
            [_vw_zip_below_end(),
             "ZIP TIE GRID BELOW CORD END"],
            [_vw_zip_off_body(),
             "ZIP TIE GRID OUTSIDE BODY"],
            // W-16 — zip-grid / finger-hole barrier
            [_vw_zip_hits_fingers(),
             "ZIP TIE HOLES HIT FINGER HOLES"],
            // W-17 / W-18 — zip holes vs each other / classic velcro slots
            [_vw_zip_rows_overlap(),
             "ZIP TIE ROWS OVERLAP EACH OTHER"],
            [_vw_zip_hits_velcro(),
             "ZIP TIE HOLES HIT VELCRO SLOTS"],
            // W-14 / W-15 — v6 wing checks
            [_vw_wing_too_narrow(),
             "WING OPENING SMALLER THAN STRAP WIDTH"],
            [_vw_wing_web_collapsed(),
             "WING WEB COLLAPSED - NO ROOM FOR STRAP"],
        ]) if (entry[0]) entry[1]
    ];

    // Console mirror — CLI / CI renders surface warnings in the log even when
    // nobody looks at the exported mesh.
    for (m = _messages)
        echo(str("WARNING: ", m));

    if (len(_messages) > 0) {
        // Bed-level tag: flat at Z = 0 so a warned export prints as a legible
        // red-flag coupon next to the part (never as floating spaghetti).
        color("red")
            translate([0, puller_length + 8, 0]) {
                linear_extrude(height = WARNING_TEXT_DEPTH)
                    text("WARNING",
                         size  = WARNING_TEXT_SIZE,
                         halign = "center",
                         valign = "baseline",
                         $fn = quality);
                for (i = [0 : len(_messages) - 1]) {
                    translate([0, (i + 1) * WARNING_LINE_GAP, 0])
                        linear_extrude(height = WARNING_TEXT_DEPTH)
                            text(_messages[i],
                                 size   = WARNING_TEXT_SIZE,
                                 halign = "center",
                                 valign = "baseline",
                                 $fn    = quality);
                }
            }
    }

    // W-0 — positive confirmation for measured sizes: green preview-only info
    // tag ("your numbers were applied"). Gated on $preview so it is NEVER
    // part of an exported mesh.
    if (_vw_measured && len(_messages) == 0 && $preview) {
        color("green")
            translate([0, puller_length + 8, 0])
                linear_extrude(height = WARNING_TEXT_DEPTH)
                    text(str(size == "Measure my hand" ? "MEASURED" : size,
                             ": ", _eff_plug_width_wall, "x", _eff_plug_length,
                             " PLUG, ", _fit_finger_width, "MM FINGER"),
                         size   = WARNING_TEXT_SIZE,
                         halign = "center",
                         valign = "baseline",
                         $fn    = quality);
    }

    // Preview-only HUD notices (orange, $preview-gated — unlike the red
    // warnings these NEVER survive export): custom sliders moved while a
    // non-Custom size is active, and auto-fit clamps engaged in Custom mode.
    _hud_notices = concat(
        (len(_ignored_custom) > 0)
            ? ["CUSTOM SLIDERS IGNORED - SET SIZE = CUSTOM"] : [],
        (_p == "Custom" && _auto_fit && len(_autofit_clamped) > 0)
            ? [str("AUTO-FIT ADJUSTED ", len(_autofit_clamped),
                   " VALUES - SEE CONSOLE")] : []
    );
    if ($preview && len(_hud_notices) > 0) {
        color("orange")
            translate([0, puller_length + 8
                          + (len(_messages) + 1) * WARNING_LINE_GAP, 0])
                for (i = [0 : len(_hud_notices) - 1])
                    translate([0, i * WARNING_LINE_GAP, 0])
                        linear_extrude(height = WARNING_TEXT_DEPTH)
                            text(_hud_notices[i],
                                 size   = WARNING_TEXT_SIZE,
                                 halign = "center",
                                 valign = "baseline",
                                 $fn    = quality);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER MODE DISPATCH
// ═══════════════════════════════════════════════════════════════════════════════

$fn = quality;

if (render_mode == "Full") {
    plug_puller_complete();
    plug_preview_1s();
    validation_warnings();
}
else if (render_mode == "Body Only") {
    body_with_cutouts();
}
else if (render_mode == "Body No Cutouts") {
    plug_puller_body_3d();
}
else if (render_mode == "Only Finger Holes") {
    plug_puller_single_feature("finger_holes");
}
else if (render_mode == "Only T Hook") {
    plug_puller_single_feature("t_hook");
}
else if (render_mode == "Only Plug Wall Notch") {
    plug_puller_single_feature("wall_notch");
}
else if (render_mode == "Only Zip Tie Holes") {
    plug_puller_single_feature("zip_tie_holes");
}
else if (render_mode == "Only Velcro Strap Holes") {
    plug_puller_single_feature("velcro_holes");
}
else if (render_mode == "Cutouts Only 2D") {
    color("red") {
        if (enable_t_hook) t_hook_2d();
        if (enable_finger_holes) {
            $fn = quality;
            translate([-finger_hole_spacing / 2, finger_hole_y]) circle(d = finger_hole_diameter);
            translate([ finger_hole_spacing / 2, finger_hole_y]) circle(d = finger_hole_diameter);
        }
        if (enable_plug_wall_notch) plug_wall_notch_2d();
        if (enable_zip_tie_holes) {
            $fn = quality;
            for (c = _zip_centers)
                for (s = [-1, 1])
                    translate([s * c[0], c[1]]) circle(d = zip_tie_hole_diameter);
        }
        if (enable_velcro_holes) {
            if (_resolved_velcro_style == "Wing" && !_velcro_slide) {
                velcro_wing_2d();
            } else {
                translate([-_velcro_xc_eff, _velcro_y_eff])
                    rotate([0, 0, -velcro_hole_rotation])
                        velcro_slot_2d();
                translate([_velcro_xc_eff, _velcro_y_eff])
                    rotate([0, 0, velcro_hole_rotation])
                        velcro_slot_2d();
            }
        }
    }
    color("orange") pocket_seat_2d();
    color("purple") pocket_ellipse_2d();
}
