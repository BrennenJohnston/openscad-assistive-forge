// Written by Volksswitch <www.volksswitch.org>
//
// To the extent possible under law, the author(s) have dedicated all
// copyright and related and neighboring rights to this software to the
// public domain worldwide. This software is distributed without any
// warranty.
//
// You should have received a copy of the CC0 Public Domain Dedication along with this software.
// If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
//
// keyguard.scad would not have been possible without the generous help of the following therapists and makers:
//	Justus Reynolds, Angela Albrigo, Kerri Hindinger, Sarah Winn, Matthew Provost, Jamie Cain Nimtz, Ron VanArsdale, 
//  Michael O Daly, Duane Dominick (JDD Printing), Joanne Roybal, Melissa Hoffmann, Annette M. A. Cooprider, 
//  Ashley Larisey, Janel Comerford, Joy Hyzny
//
//
// Version History:
//
// Version 2: added support for clip-on straps as a mounting method
// Version 3: rewritten to better support portrait mode and to use cuts to create openings to the screen surface rather than defining rails
//				fixed bug in where padding appeared - put it around the grid rather than around the screen
//				increased the depth of Velcro cut-outs to 3 mm, which roughly translates to 2 mm when printed
//				cut for home button is now made at 90 deg. to not encroach on the grid on tablets with narrow borders
// Version 4: added support for circular cut-outs and the option to specify the shape of the cut-outs
//              added support for covering one or more cells
//              added support for merging a cell cut-out and the next cell cut-out
// Version 5: can print out a plug for one of the cells in the keyguard by choosing "cell cover" in the 
//				Special Actions and Settings>generate pull-down
//				can add a fudge factor to the height and width of the tablet to accommodate filaments that shrink slightly when printing
//				can add add padding around the screen to make the keyguard stronger without affecting the grid and bars to account for cases
//                 that go right up to the edge of the screen
// Version 6: can control the slope of the edges of a message/command bar
// Version 7: moved padding options to Grid Layout section of the user interface to clarify that these affect only the grid region of the screen
//              changed the width of the right border of the iPad 5th generation tablet to match width of the left border
//              made some variable value changes so that it is easier to see the choices selected in the Thingiverse Customizer
//              changed cover_home_button and cover_camera to expose_home_button and expose_camera because the original options were confusing
// Version 8: reduced the maximum slide-in tab width from 30 mm to 10 mm
//            added the ability to merge circular cells horizontally and to merge both rectangular and circular cells vertically
// Version 9: added support rounding the corners of the keyguards, when they are placed in a case, to accommodate
//            cases that have rounded corners on their openings
//            combined functionality for both grid-based and free-form keyguards into a single designer
//	          can now create cell openings that are rounded-rectangles
//            can limit the borders of a keyguard to the size of the screen for testing layouts
// Version 10: reduced some code complexity by using the hull() command on hot dogs and rounded rectangles
//             removed options to compensate for height and width shrinkage, upon testing they are too simplistic and keyguards don't 
//                do well with annealing anyway
//             changed "raised tab thickness" to "preferred raised tab thickness" because the raised tab can't be thicker than the
//                keyguard or it won't slice properly - the keyguard will be raised off the print surface by the bottoms of the four
//                raised tabs
// Version 11: added support for iPad 6th Generation, iPad Pro 11-inch, and iPad Pro 12.9 inch 3rd Generation
//             added ability to offset the screen from one side of the case toward the other
//             fixed bug that caused rounded case corners not to appear in portrait mode
//             added ability to create outside corners on hybrid and freeform keyguards
//             added ability to change the width of slide-in and raised tabs and their relative location (changed the meaning of 
//                "width" as well)
// Version 12: extended the upper end of the padding options to 100 mm after seeing a GoTalk Now 2-button layout
//             minor corrections to a couple of iPad Air 2 measurements
//             added support for swapping the camera/home button sides
//             added support for sloped sides on outer arcs
// Version 13: added support for text engraving
// Version 14: added option to control the number of facets used in circles and arcs - the original value was 360 and the default is now
//                 40 which should greatly improve rendering times and eliminate issues for laptops with limited memory
//             separated the tablet data from the statement that selects the data to use with the intent of making it easier to update
//                 and change the data in Excel
//             migrated from using Apple's statement of "active area" dimension to calculating the size of the screen based on number 
//                 of pixels and pixel size - active area dimensions seemed to overestimate the size of the screen - also assume a single
//                 value for number of vertical pixels in a screen shot and therefore a single value for pixel to mm conversion based
//                 on the stated pixel size
//             added the ability to engrave text on the bottom of the keyguard
//             added support for a separate data file to hold cut information that sits outside of the screen area, will always
//                 be measured in millimeters and will always be measured from the lower left corner of the case opening - so now 
//                 there are two files for defining cuts: one for within the screen area and one for outside of the screen
// Version 15: added support for Nova Chat 10 (does not support exposing the camera)
//             cleaned up the logic around when to cut for home and camera to account for lack of a home button or camera on the
//                 face of the tablet
//             added support for additive features like bumps, walls and ridges
//             fixed bug with height and width compensation for tight cases 
//             added support for using clip-on straps with cases
//             added support for printing clips
//             added support for hiding and exposing the status bar at the top of the screen
// Version 16: changed code to use offset() command to create rounded corners rather than cutting the corners
//			   added a small chamfer to the top edge of the keyguard to reduce the chance of injury
//             changed code to add case and screen cuts "after" adding compensation for tight cases
//			   added support for the NOVAchat 10.5 (does not support exposing the camera)
//             changed filename extension of case_cuts and screen_cuts files from .scad to .info to reduce confusion about what is the 
//                main OpenSCAD program
// Version 17: changed code that creates rounded corner slide-in tabs to use the offset() command because original code was confusing the
//                Thingiverse Customizer
//             fixed bug that prevented adding bumps, ridges and walls in the case_openings.info file
//             added acknowledgements for all those who helped bring keyguard.scad to life
// Version 18: added support for splitting the keyguard into two halves for printing on smaller 3D printers
//             put small chamfer at the top edge of all openings including the home button opening
//                  - it's only visible with large edge slopes like 90 degrees
//             separated circle from hotdog when specifying screen and case openings
//             added minimal error checking for data in screen_openings.info and case_openings.info
//             fixed bug when placing additions from case_openings.info
//             moved pedestals for clip-on straps inward slightly to account for chamfer on the outside edge of keyguard
//             fixed bug that produced a static width for the vertical clip-on strap slots
// Version 19: changed upper limits on command and message bars from 25 mm to 40 mm to support large tablets
//             fixed bug that was exposed when adding height and width compensation to the keyguard for tight fitting cases with
//                  very large corner radii
//             made all radii, including those on the outer corners of the keyguard sensitive to the value of "smoothness_of_circles_and_arcs"
//             fixed a bug that clipped the underside of a clip-on pedestal when it is adjacent to a bar
// Version 20: added support for the iPad Air 3 and the Surface Pro 4
// Version 21: fixed bug involving clip-on straps and split keyguards
//			   fixed bug where cut for vertical clip-on strap (no case) was a different depth than the horizontal strap cuts
//             updated pixel sizes of 0.960 mm/pixel to a more accurate value of 0.962 mm/pixel
//             extended the upper bound for added thickness for tight cases from 15 mm to 20 mm
// Version 22: added number of horizontal pixels to the data for each tablet to properly support portrait mode for free-form and hybrid tablets
//             fixed several bugs associated with creating portrait free-form and hybrid tablets
// Version 23: allow raised tabs as thin as 1 mm
//             accounted for thin walls when using clip-on straps
//             added support for the NOVAchat 12
// Version 24: added support for the iPad 7th generation and iPad Mini 5
//	           changed all iPad data to use calculated screen size measurements rather than values of Active Area from Apple
//             added support for bold, italic, and bold-italic font styles to top and bottom text
// Version 25: added support for NovaChat 5 and 8
//             changed dimensions for NovaChat 10 based on feedback from Saltillo
//             added support for all Microsoft Surface tablets
//             fixed bugs with trim to screen and height and width compensation for tight cases
// Version 26: changed name of Surface Pro 2017 to Surface Pro 5
//             added support for the Fujitsu Stylistic Q665 (used in the Grid Pad 11 system)
//             added check for a zero mm/px corner radius used with a cut for a rounded rectangle and changes shape to a rectangle
//             fixed bugs associated with adding height and width compensation for tight cases
//             fixed bugs associated with trimming the keyguard to the size of the screen
//             fixed code so a zero width wall wouldn't appear between the message and command bar if both are exposed
//             modified outer arcs so that their chamfers would match the chamfers of other shapes in size
//             changed option for "slide_in_tab_thickness" to "preferred_slide_in_tab_thickness" and set actual thickness of tab to 
//                 depend on rail height minus outer chamfer
// Version 27: added support for Surface Pro 7 and Surface Pro X
//             added support for negative padding values
//             added support for dovetail joints, for a more reliable joint, when splitting a keyguard to print on a smaller printer
// Version 28: added support for independent widths for horizontal and vertical rails
//             added support for the Accent 1400 (AC14-20 & AC14-30) system
//             added support for systems (like the Accent) for which there is no tablet sizing information
//             added support for non-rectangular perimeters
//             added support for creating both loose and tight dovetail joints
//Version 29: extended tablet data to support non-iPad-style tablets by allowing for cameras and home buttons to be located on the
//                 long edge of the tablet and to have non-circular shapes
//            added support for clip-on straps to attach to long edge of keyguard, short edge, or both
//            added support for tablet-specific corner radii
//Version 30: added clip-on strap mounting pedestals and slide-in tabs to list of items that can be added to a keyguard in the 
//                  case_additions.info file - to make it possible to have a pedestals and tabs outside of the normal keyguard region 
//                  and into the case_additions regions
//            added support for two different "mini" clips - clips that don't wrap around to the underside of the tablet/case so that
//                   the clip won't interfere with the tablet mount
//            extended the spur of the clip an additional mm to better engage the slot in the pedestal
//            changed the width of the slots in clips to be a function of the clip width
//            added support for independently setting the widths of horizontal and vertical clips
//            fixed a bug with rounded-rectangle case additions when the corner radius is 0
//            fixed several bugs associated with creating cell covers
//Version 31: added support for Amazon Fire HD 8 (10th generation)
//            added support for the Accent 1000, the Dynavox 1-12+, and updated camera/home button info for NovaChat 8
//            changed camera and home button locations to be measured from the edge of the screen rather than the edge of the tablet
//            added support for cutting out the entire screen area - primarily to support validating dimensions for new tablets
//            fixed bug that improperly calculated trimming of towers for clips
//            refactored code associated with unequal case opening dimensions
//            added support for tablets where the screen doesn't sit exactly in the middle of the glass
//Version 32: added support for Dynavox Indi
//            added support for engraved and embossed SVG images
//Version 33: added support for Apple iPad models: iPad 8th generation, iPad Pro 12.9-inch 4th Generation, and iPad Air 4
//            fixed home button location and widened the camera opening for the iPad Pro 12.9-inch 3rd Generation
//            fixed bug in "swap camera and home button" when home button is not located on the face of the tablet
//            turned off creation of camera opening and home button opening if tablet is a system that requires a case
//Version 34: fixed bug in vridgef and hridge features
//			  added support for ridges around cells
//            removed support for walls in screen/case openings.info files
//Version 35: enlarged the opening for the home button in the Accent 1000 to make it easier to reach
//            added support for generating SVG/DXF files for laser-cutting a keyguard
//            limited slide-in tab length to 10 mm rather than 20 mm and set the minimum to 4 mm (exactly 3.175 mm for a
//                    laser-cut keyguard
//Version 36: fixed bug that allowed you to choose a mounting method other than slide-in tabs and no mount for a laser-cut keyguards
//            fixed bug that put a chamfer on outer arcs when type of keyguard is Laser-Cut
//            added support for displaying an SVG version of a screenshot below the keyguard
//            changed rules for shape of opening in laser cut keyguards to allow for circles and rounded rectangles with larger corner radii
//            changed rules to allow for SVG generation of first layer of 3D-Printed type of keyguard - used when testing fit of keyguard to screenshot
//Version 37: moved the home button location further from the edge of the screen and increased the height and width of the home button for
//                    the Accent 1000
//            fixed a bug associated with circular openings and cell ridges when changing rail widths
//            added support for the Fujitsu Stylistic 616 which is exactly like the Fujitsu Stylistic 665 and associated both with the GridPad
//            fixed bug that prevented height/width compensation from working with unequal left/bottom case openings
//            added support for adding height/width compensation to one side of the keyguard at a time
//            added a virtual tablet called "blank" that can be used to specify an arbitrary-sized keyguard - largely for laser-cutting
//            changed labels for "unit of measure" and "starting corner for measurements" to reinforce that they only apply to screen openings
//            added option to ignore Laser-Cutting best practices when creating a laser-cut keyguard
//            added ability to trim keyguard to an arbitrary rectangle by specifying the lower left and upper right coordinates relative to the
//                     lower left corner of the case opening
//            added the ability to use a large rectangle or rounded rectangle as an overall case addition
//            added temporary support for the Chat Fusion 10 from PRC/Saltillo, need verification of screen dimensions and camera/home button data
//            changed the x,y anchor point location for manual clip-on strap pedestals
//            fixed bug where engraved SVG images wouldn't rotate
//            added the ability to control the depth of an engraved svg image
//Version 38: added support for the Accent 800
//            fixed options to add compensation for tight cases to use case opening size rather than screen size
//Version 39: added support for the iPad Pro 12.9-inch 5th Generation, iPad Mini 6th Generation, iPad 9th Generation, iPad Pro 11-inch 2nd
//            Generation and iPad Pro 11-inch 3rd Generation
//Version 40: removed "trim_to_rectangle_lower_left" and "trim_to_rectangle_upper_right" from "Special Actions and Settings" section because
//            we can't remember why we added them in the first place and they weren't working predictably.  (The code was kept in place and
//            commented out in case it becomes useful again.) 
//            added support for "Braille inserts".
//Version 41: screen_openings.info is now ignored if the tablet type is "blank", extended functionality associated with "Braille inserts"
//            added "trim_to_rectangle_lower_left" and "trim_to_rectangle_upper_right" back to "Special Actions and Settings" section
//            setting rows and/or columns to 0 will fill in all grid cuts/openings in a grid-based keyguard
//            added support for the Grid Pad 13
//            added the ability to engrave or emboss ttext and control the depth of the engraving/embossing using the "corner radius" field
//            added the ability to put slide-in tabs along the long edge of the keyguard
//Version 42: fixed and modified the behavior of the slide-in tab case additions to disconnect them from the Customizer pane
//            fixed a problem with manually located clip-on strap pedestals
//            fixed a problem with crescent moon case additions
//            generalized the concept of a "Braille insert" to be a generic "cell insert" - just no Braille text and no opening to create 
//                     a "cell cover"
//			  added support to cut out case-opening region of the keyguard to print case-additions separately
//            added support for a DIY "screen protector" or a keyguard "frame" that allows for "friction-fitting" the keyguard
//            widened all camera opening diameters by at least 1.5 mm to make keyguard placement easier
//Version 43: fixed bug that didn't show slide in tabs when keyguard was split
//            added pixel and millimeter measures directly to info files for use in placing openings and additions
//            added support for inputing app layout measurements directly in pixels for greater accuracy
//            removed bar size measurements from the padding_and_bar_size.xlsx file and change its name to padding_size.xlsx
//Version 44: added support for tablet openings (at this time just ASL sensor openings) by introducing a new .info file
//            expanded the camera opening 2.5 mm wider for iPad 7/8/9 to accommodate the ASL sensor in gen 7 and 8
//            reduced camera angle by 5 degrees
//            widened option for raised-tabs to 60 mm
//            modified raised tabs code to better support tabs with only a ramp portion and no flat portion
//            added support for controling the angle of the ramp portion of the raised tab.
//            replaced the two GridPad Fujitsu tablet types with a single GridPad 12   
//            added support for snap-in attachments to keyguard frames
//Version 45: added support to allow horizontal tabs to be different in length from vertical tabs
//            fixed bug to make the tablet coordinate system sensitive to the unequal case opening settings
//            fixed bug in "cut_case_openings" subroutine that was missing a second argument
//            refactored design to make screen elements and tablet elements insensitive to changes in unequal case opening settings
//            removed protection if manually placed clip-on strap pedestals extend into the screen
//            now able to add raised tabs and clip-on strap mounts to a keyguard frame
//            the keyguard frame customization UI has been redesigned
//            reduced the lower limit for the length of slide-in tabs and shelf depth
//            keyguard tightness of fit is now a general value and not just tied to keyguard frame systems
//            refactored the edge compensation code
//            changed the extension of .info files to .txt for compatibility with Printables.com
//Version 46: added support for changing the angle of the bottom edge of rectangular cell openings to provide better visual and manual
//                     access to small cell openings
//            removed reference to "wall" in .txt files becacause it is no longer supported
//            moved most variable calculations from the .txt files to the designer
//Version 47: changed the default size of the case opening and the keyguard in a keyguard frame to better match an iPad 9 and make more
//                      sense when exploring the features of a keyguard frame   
//            added support for rectangular magnets in raised tabs
//            fixed bug in some renderings of slide-in tabs that were weakly attached to the rest of the keyguard
//            fixed bug with slide-in tabs that may result in non-manifold renderings
//            added support for symmetrical camera and home button openings so the keyguard can easily be rotated if the tablet is rotated
//Version 48: fixed bug associated with setting the slope of the bottom edge of a rectangular opening
//            added support for iPad Air 5
//            added support for non-rectangular cell inserts
//            fixed bug in specification of cell insert recess
//            added support for an externally defined new tablet
//Version 49: fixed bug when generating first layer of a keyguard with slide-in tabs
//            added support for variable sloped opening edges for rounded rectangles, hotdogs and circles
//            added ability to change the slopes of the top and bottom edges of cell openings to provide added visibility into cell openings
//                      when looking at tablet at small or very large angle
//            added support for selecting rounded rectangle corners for bars for greater strength
//            small clean-up on trim to screen function
//            cleaned up implementation of edge compensation for tight cases
//            added support for iPad 10, iPad Pro 11 - 4th gen, and iPad Pro 12.9 - 6th gen
//Version 50: send error message to the console if certain a cut is invalid (e.g., rounded rectangle with oversized corner radius)
//            refactored the approach to the compensation for tight cases
//            refactored the approach to portrait orientation
//            added support for these Microsoft Surface tablets: Pro 8, Pro 9 and Go 3
//            added support for the Amazon Fire HD 10 Plus tablet
//            eliminated the "shape of opening" option and now treat all shapes as variants of a rounded-rectangle
//            reorganized the Grid Layout section into two sections to simplify access to the most common options
//            made bar corner radii dependent on whether contiguous bars are exposed
//            increased the top-end number of pixels for setting the app layout from 2000 to 3000 to support very large tablets in portrait
//                      orientation
//Version 51: combined the screen_opengins.txt, case_openings.txt, and case_additions.txt files into a single file called openings and additions.txt
//            eliminated the need for the als_openings.txt file by moving that information into the program
//            added ALS openings for the iPad 1,2,3,5,6 and the iPad Mini 6
//            eliminated the need for the other_tablet.txt file by adding a pair of options in the Special Actions and Settings section.
//Version 52: updated generate>Customizer settings to properly report on Grid Settings
//            updated variables exposed in openings_and_additions.txt to be independent of the settings in the Free-form and Hybrid
//                       Keyguard Settings section
//            removed all code associated with a "Lite" version
//            fixed bug with opening corner radius shapes
//            fixed bugs when slide in tabs and raised tabs are used along with negative tightness of fit values
//            fixed bug when clip-on straps require no pedestal
//Version 53: made the dimensions of the bars independent of any settings in the Free-form and Hybrid Keyguard Settings section
//            changed the color associated with SVG/DXF generated images so they didn't look as much like every rendered keyguard
//            widenend the camera-related cuts associated with a laser-cut keyguard to account for the fact that they can't be sloped,
//                        Home Button, ALS, and cuts created in the TXT file remain unchanged
//            added logic to provide an error message if trying to create a laser-cut keyguard frame or a laser-cut keyguard that goes in a
//                        keyguard frame
//            removed the guardrails from almost all numeric inputs - gets rid of the sliders which are very difficult to use and creates a more
//                        compact UI
//            added additional checks to ensure that App Layout measurements using pixels are internally consistent
//Version 54: added limits for the value of the app layout pixel values because it is the only way to enter values larger than 999
//Version 55: bug fix in the generation of DXF/SVG models
//Version 56: added support for adding a slopped edge to the sides of the Home Button opening to provide easier manual access and made it
//                         the default
//            cleaned up extraneous ALS instruction for iPad 10
//            added support for the TobiiDynavox I-110 (thanks Tee Jay!)
//            fixed bug associated with the size of the camera opening with laser-cut designs
//            added support for mounting posts for systems like the PRC Via Pro
//            moved edge compensation options from Grid Special Settings to Tablet Case section
//            added support for post-based mounting of the keyguard in a keyguard frame
//            added designer version number to Customizer Settings
//            added ability to expose Ambient Light Sensors (or not), exposed by default
//            for visualization of the keyguard and frame together, put [999] in the "other tablet pixel sizes box and generate the keyguard frame
//            made "Shelf" an official keyguard mounting method rather than allowing it only for keyguard frames
//            added the ability to split a keyguard frame
//Version 57: changed the default value of the mini tab height from 2 mm to 1 mm
//            fixed bug in the creation of cell inserts
//            fixed several bugs in the creation of a keyguards mounted to a keyguard frame with posts
//            added support for zero-width rails
//            fixed a minor bug in the creation of posts as a mounting method
//Version 58: fixed bug that prevented generating "first layer for SVG/DXF files" when "type of keyguard" is set to "3D-Printed"
//            ignoring the home button edge slope if add symmetric openings is set to yes
//            added support for the Amazon Fire Max 11
//            prevented symmetric camera/home button openings when using a keyguard frame
//Version 59: added support for horizontal and vertical rail widths, compensation for tight cases to the txt files
//            added support for top/bottom/left/right padding, compensation for tight cases to the txt files
//            added support for angling the display of the keyguard at fixed angles for evaluating keyguard thickness along with screenshot
//            added support for NovaChat 8.5
//            added support for NovaChat 5.3 and 5.4
//            modified the "posts" mounting method to utilize a round post all the way across the top of the keyguard if both the status bar
//                  and the upper message bar are hidden
//            made a similar modification to the posts mounting option for a keyguard frame
//            added support for subtracting plastic from the outer edge of a keyguard like the ability to add plastic
//            fixed bug that swapped the t3 and t4 triangles
//            putting a "#" in the ID column for a screen opening, case opening, or case addition, it will be highlighted in red in the display
//Version 60: added the ability to set the height of the grid region of the keyguard to one height (preferred rail height) and the rest of the 
//					keyguard to a greater height (keyguard height)
//            fixed bug in the emboss/engrave feature
//Version 61: belatedly added keyguard_thickness to the settings displayed when choosing to generate Customizer Settings
//            added support for horizontal and vertical alignment of ttext and btext
//            set the default preferred rail height to 4 mm to match the default keyguard thickness
//Version 62: fixed how "preferred rail height" is reported when generating Customizer Settings
//            fixed bug with recurved edges of slide-in tabs with a length value less than 3 mm
//            rested horizontal and vertical ridges on the bottom of the keyguard and adjust the total height to match
//            added a ridge arc to support manual ridges around merged cells
//            added cell_width (cw), cell_height (ch), and cell corner radius (ccr) to the variables that can be used in the 
//                  openings_and_additions.txt file
//            added height_of_ridge (hor) and thickness_of_ridge (tor) for use in the openings_and_additions.txt file
//            fixed the double-entry of NovaChat 8.5 in the "type of tablet" pull-down list in the Customizer
//            fixed the values for the Posts Info section when generating Customizer Settings
//            added support for the iPad Pro 11-inch (M4), iPad Pro 13-inch (M4), iPad Air 11-inch (M2), and iPad Air 13-inch (M2)
//            fixed a bug where a groove appeared in the bar region even if the associated bar was of zero height
//            fixed some bugs with the creation of posts
//            fixed the camera location on the earlier iPad Pros
//Version 63: cleaned up some artifacts that appear with manual ridge arcs when the ridge thickness is set to larger than 7 mm
//            added minimal support for all 23 Samsung tablets introduced since 2020 (support doesn't include openings for cameras or buttons
//                  on the face of the tablet)
//            changed naming of Accent tablets to match what appears on the PRC website
//            added an entry for Grid Pad 11
//            fixed bugs when adding symetric home button and camera openings
//            corrected the data for the Accent 1400-30
//            fixed bug that allowed laser-cut keyguards to have cells with non-90 degree top and bottom slopes
//            fixed bug that allowed the keyguard shelf to be thicker than the keyguard itself
//            fixed bug that allowed cell inserts to be created via laser-cutting
//            fixed bug that allowed the mini tabs for post mounting to be higher than the thickness of the keyguard
//Version 64: distinguished between two different Accent 1400-30 tablets that impacts their pixel count differences
//Version 65: updated Accent 1400-30a data based on pixel count information from PRC
//            added support for the Accent 1000-20
//            fixed bug when there's an uneven case opening and the keyguard thickness exceeds the rail height
//            fixed bug associated with ALS locations when tablet is oriented in portrait mode
//            added support for engraving/embossing text from within the Customizer
//            exposed the default left and bottom case opening values to make it easier to determine the unequal left/bottom of case value
//            added support for a ridge that can be rotated at any angle, not just horizontal and vertical
//            added support for customization of the slope (chamfer) around the edge of the keyguard
//            added support for customization of the slope (chamfer) at the top edge of a cell (also affects the chamfer on bars)
//            added support for r/rr/c/hd cuts that don't go all the way through the keyguard by putting a number in the "other" column
//            fixed bug that prevented using home button edge slope with keyguard frames
//Version 66: changed the default value of case_width = 220 in Clip-on Strap Info to 275 so a generated horizontal clip would look realistic
//            added support for directly choosing circular openings and moved several of the grid layout options to grid special settings
//            fixed bug that allowed the keyguard thickness of an acrylic keyguard to be other than 3.175 mm thick
//            added support for rectangular and rounded rectangular shapes that are anchored in the center
//            changed section name from "Type of Keyguard" to "Keyguard Basics" to reinforce that this is the section to start with
//            removed some unused modules to clean up the code
//            refactored the creation of a 2D image from a 3D design to avoid arbitrary lines in the SVG file that mess up the laser cut
//            fixed bug in handling svg, ridge, ttext, and btext rotation and other options in the openings_and_additions.txt file
//            added support for the iPad Mini 7 (A17 Pro)
//            fixed bug where echoes of case additions leaked through to keyguards in keyguard frames
//            fixed bug involving keyguard frames and keyguards where the preferred rail height is less than the keyguard thickness
//            moved the generate instruction out of Special Actions and Settings and into Keyguard Basics
//            added support for manual slide-in tab and clip-on strap mounts to keyguard frames
//Version 67: circular cuts in the openings_and_additions.txt file get their diameter from the "height" column, not the "width" column
//            fixed a bug in the generation of the first layer of a laser-cut design that made circles too large
//            the user interface for grid design has changed to set the height and width of rectangular openings directly rather than
//                  indirectly via the widths of the horizontal and vertical rails - this resulted in changing the names of several
//                  options: rail slope > cell edge slope,  preferred rail height > screen area thickness, and
//                  split_line > split_line_location
//            fixed a bug that had slide-in tab thickness depending on the thickness of the rails
//            changed the name of the Grid Layout section to Grid Info for consistency with other sections
//            added grid width in millimeters (gwm), grid height in millimeters (ghm), and keyguard thickness (kt) to the variables available
//                  for use in the openings_and_additions.txt file
//            fixed bug where edge compensation failed to take the cell edge slope into account when determining how much to reduce cell size
//            replaced the "add rounded corners for strength" option with a "bar corner radius option" for simplicity
//            fixed bug involving one slot for a snap-in tab responding to changes in uequal bottom of case opening
//Version 68: added support for rotating mini tabs and manually added slide-in tabs
//            added better handling of designs where the screen area is thinner than the keyguard
//            made the trimming of clip-on strap pedestals sensitive to edge compensation adjustments
//            add support for specifying cell height and width in pixels
//            changed the names of cell width and cell height to xx in mm, the original values are retained in Special Actions and Settings
//            fixed ridges around cells to account for cell edge slope
//            when a keyguard is changed from 3D-Printed to Laser-cut the mounting method is set to No Mount if not already set to Slide-in Tabs
//            fixed bug that trimmed bumps and ridges specified in case_openings if they extended in to the screen area
//            changed code so that small items like ridges in screen_openings are more likely to be seen if px is used as unit when values are mm
//            removed the "h" and "w" variables in openings_and_additions.txt because they're confusing
//            fixed bug that prevented camera and home button opengings as well as ALS opengings from being cut in keyguards with frames and in 
//            		the keyguard frames themselves
//            updated code to enforce that keyguard frames and their keyguards are incompatible with unequal openings as well as symmetric openings
//            added greater precision (0.1 mm) to millimeter measurements that might require extra precision
//            added support for a manual circlular ridge (cridge)
//            added support for a manual rectangular ridge (rridge) that is anchored in the center
//            fixed bug that prevented ALSs to be exposed if the keyguard was thicker than the screen area
//            fixed bug preventing "-" shapes from removing plastic when used with laser-cut designs
//Version 69: fixed bug that prevented outer arcs in case_openings from properly displaying in the first layer of a Laser-Cut keyguard.
//            corrected mislabeling of the keyguard thickness parameter
//            fixed bug that forced ambient light sensors to be exposed if you also select symmetric openings
//            fixed bug that caused the grid to not respond properly to edge compensation settings
//            added support for "engraving" any of the basic shapes into the underside of a keyguard to support the NovaChat 5.3
//            added support for the NovaChat 10.7 which uses a Samsung Galaxy Tab S7 - probably...
//            added logic to limit the bar corner radius for thin bars
//            made some small adjustments to the dimensions of the Accent 800
//            added support for the Via Pro, Via Nano, and Via Mini
//            added ability to hide the grid area to help with setting padding values based on a screenshot
//            added support for the iPad Air M3 11 & 13 inch and for the iPad 11 (A16)
//            added support for the NovaChat 5.3
//            modified the behavior of the rridge shape so that it is anchored in the lower-left corner and introduced the 
//                 crridge shape that is anchored at its center
//            modified the tor and hor variables so that they behave independently of the unit_of_measure_for_screen value
//            added support for tenths of a mm to the "mount to top of opening distance" option in the Posts section
//            added support for the TobiiDynavox I-16
//            modified the behavior of edge compensation to be measured from the edge of the keyguard rather than the edge of the screen
//            added more options to hide snap-ins for in-frame mounting of the keyguard
//            added support for tenths of a millimeter and a slider when setting the split line for split keyguards
//            fixed a bug where unequal border sizes weren't reflected in keyguards without a case
//Version 70: removed the swap camera and home button option in the Tablet section and replaced it with a rotate tablet 180 degrees
//                  option, this allows for tablets with unequal borders to be rotated without changing the standard tablet data
//            updated all tablet data to generate screen sizes based on pixel counts and pixel sizes
//            fixed a bug in setting screen area thickness smaller than keyguard thickness that produced non-manifold STL files
//            added support for keyguards without cases that need to have different corner radii in different corners
//            modified the definition of dovetails for split keyguards to support choosing a specific dovetail size and adjusting their location
//            added support for keyguard frames that go directly on a tablet without a case
//            changed the way that split keyguard frames are generated - now each half is generated independently
//            added support for setting the corner radii of a shelf independent of the corner radii of the keyguard or frame
//            removed support for recommending pre-version 66 Customizer changes in the Console pane
//            changed the behavior of setting cell heights and widths such that the value can't cause cells to overlap - a message is shown in
//                   the Console pane describing the mm and px values actually used by the designer
//            added an error message to the Console when someone uses the "other tablet" but doesn't provide sufficient data
//            fixed bug associated with splitting a keyguard frame for a portrait-oriented keyguard
//Version 71: improved the dimensional information for the Grid Pad 13
//            added support for an OPTIONAL "tablet_openings" vector to the openings_and_additions.txt file
//            added an option to manually set the length of the posts in a post-mounted keyguard/frame system
//            added basic support for the Smartbox Grid Pad 10s, 15, and Touch Pad
//            fixed bug associated with sliding dovetails vertically
//            added basic support for the Surface Go 2, 3, and 4
//            fixed bug that caused render step to fail if slide-in tabs were 2 mm in length and had 0 distance between them
//Version 72: added support for laser-cut text on laser-cut keyguards
//            fixed bug associated with engraving/embossing text in the case region
//            fixed bug that ignored case additions when the screen region was hidden
//            modified the program so it would be usable on the Maker World website - in "lite" form
//            inputs no longer have to be enclosed in square brackets
//            a screenshot file must now be named "default.svg" in order to import into the designer
//            fixed a bug that allowed tablet openings to appear sloped when the type of keyguard is Laser-Cut
//Version 73: reworked the case_addition shapes so that "-" shapes are focused entirely on removing plastic
//            removed the Accent 800 tablet and replaced it with the Accent 800-30 and Accent 800-40
//            fixed bug where older Profiles reported untouched vector input as changes to the default profile
//            added flag to indicate whether the designer is to be run locally or on Maker World
//            Maker World flag allows for 2-dimensional screenshots when run locally to prevent CGAL error
//Version 74: fixed bug that prevented engraved/embossed text from working with split keyguards
//            moved case measurements from Clip-on Straps Info section to the Case Info section
//            moved "unequal side" case measurements from Clip-on Straps Info section to the Special Actions and Settings" section
//            changed name of "starting height" in Raised Tabs Info" section to "raised tabs starting height"
//            added the ability to add a sloped edge to the keyguard as an option for mounting in a typical screen protector with sloped edges
//            changed the names of "mini clip 1" to "mini clip" and "mini clip 2" to "micro clip"
//Version 75: added support for additional case variables to the openings_and_additions.txt file
//            added support for the Tobii-Dynavox I-13 system
//            fixed bug that prevented outer arc cuts from appearing in the case and tablet regions
//            added support for outer arcs to the case_additions section as "-" shapes
//            added support for the Samsung Galaxy Tab S3 and the Tobii-Dynavox T15+
//            changed the keyguard horizontal and vertical tightness of fit options to run from -10 to 10
//            updated measurement data for the GridPad 12 and the Tobii-Dynavox I-110
//            added support for displaying where the keyguard will be split without first generating keyguard halves
//            fixed bug when upper message bar was 0 height  but both the upper status bar and upper command bars were > 0 height
//            adjusted the logic to ignore "App Layout in mm" values if any "App Layout in px" value is > 0
//            moved "split keyguard" options from Special Actions and Settings to its own section
//            added the ability to simultaneously display the keyguard with the frame, removed support for 999 "cheat code"
//
//
//
//
//




//------------------------------------------------------------------
// User Inputs
//------------------------------------------------------------------

/*[Keyguard Basics]*/
type_of_keyguard = "3D-Printed"; // [3D-Printed,Laser-Cut]
//not for use with Laser-Cut keyguards
keyguard_thickness = 4.0; // .1
//cannot exceed the keyguard thickness
screen_area_thickness = 4.0; // .1
generate = "keyguard"; //[keyguard,first half of keyguard,second half of keyguard,horizontal clip,vertical clip,horizontal mini clip,vertical mini clip,horizontal micro clip,vertical micro clip,keyguard frame,first half of keyguard frame,second half of keyguard frame,cell insert,first layer for SVG/DXF file,Customizer settings]


/*[Tablet]*/
type_of_tablet = "iPad 9th generation"; //[iPad, iPad2, iPad 3rd generation, iPad 4th generation, iPad 5th generation,iPad 6th generation, iPad 7th generation, iPad 8th generation, iPad 9th generation, iPad 10th generation, iPad 11th generation A16, iPad Pro 9.7-inch, iPad Pro 10.5-inch, iPad Pro 11-inch 1st Generation, iPad Pro 11-inch 2nd Generation, iPad Pro 11-inch 3rd Generation, iPad Pro 11-inch 4th Generation, iPad Pro 11-inch M4, iPad Pro 12.9-inch 1st Generation, iPad Pro 12.9-inch 2nd Generation, iPad Pro 12.9-inch 3rd Generation, iPad Pro 12.9-inch 4th Generation, iPad Pro 12.9-inch 5th Generation, iPad Pro 12.9-inch 6th Generation, iPad Pro 13-inch M4, iPad mini, iPad mini 2, iPad mini 3, iPad mini 4, iPad mini 5, iPad mini 6, iPad mini 7 A17 Pro, iPad Air, iPad Air 2, iPad Air 3, iPad Air 4, iPad Air 5, iPad Air 11-inch M2, iPad Air 13-inch M2, iPad Air 11-inch M3, iPad Air 13-inch M3, Dynavox I-12+, Dynavox Indi, Tobii-Dynavox I-110, Tobii-Dynavox T-15+, Tobii-Dynavox I-13, Tobii-Dynavox I-16, NovaChat 5, NovaChat 5.3, NovaChat 5.4, NovaChat 8.5, NovaChat 12, Chat Fusion 10, Surface 2, Surface 3, Surface Pro 3, Surface Pro 4, Surface Pro 5, Surface Pro 6, Surface Pro 7, Surface Pro 8, Surface Pro 9, Surface Pro X, Surface Go, Surface Go 3, Accent 800-30, Accent 800-40, Accent 1000-20, Accent 1000-30, Accent 1000-40, Accent 1400-20, Accent 1400-30a, Accent 1400-30b, Via Nano, Via Mini, Via Pro, GridPad 10s, GridPad 11, GridPad 12, GridPad 13, GridPad 15, Samsung Galaxy Tab A 8.4, Samsung Galaxy Tab A7 10.4, Samsung Galaxy Tab A7 Lite, Samsung Galaxy Tab A8, Samsung Galaxy Tab A9, Samsung Galaxy Tab A9+, Samsung Galaxy Tab Active 2, Samsung Galaxy Tab Active 3, Samsung Galaxy Tab Active 5, Samsung Galaxy Tab Active 4 Pro, Samsung Galaxy Tab S3, Samsung Galaxy Tab S6, Samsung Galaxy Tab S6 Lite, Samsung Galaxy Tab S7, Samsung Galaxy Tab S7 FE, Samsung Galaxy Tab S7+, Samsung Galaxy Tab S8, Samsung Galaxy Tab S8 Ultra, Samsung Galaxy Tab S8+, Samsung Galaxy Tab S9, Samsung Galaxy Tab S9 FE, Samsung Galaxy Tab S9 FE+, Samsung Galaxy Tab S9 Ultra, Samsung Galaxy Tab S9+, Amazon Fire HD 7, Amazon Fire HD 8, Amazon Fire HD 8 Plus, Amazon Fire HD 10, Amazon Fire HD 10 Plus, Amazon Fire Max 11, blank, other tablet]
orientation = "landscape"; //[portrait,landscape]
expose_home_button = "yes"; //[yes,no]
home_button_edge_slope = 30;
expose_camera = "yes"; //[yes,no]
rotate_tablet_180_degrees = "no"; //[yes,no]
//cannot be used with unequal case opening sides or with keyguard frames
add_symmetric_openings = "no"; //[yes,no]
expose_ambient_light_sensors = "yes"; //[yes,no]


/*[Tablet Case]*/
have_a_case = "yes"; //[yes,no]
height_of_opening_in_case = 170;
width_of_opening_in_case = 245;
case_opening_corner_radius = 5;
case_height = 220;
case_width = 275;
case_thickness = 15;
case_corner_radius = 20;
case_to_screen_depth = 5.0; //.1
top_edge_compensation_for_tight_cases = 0.0; // .1
bottom_edge_compensation_for_tight_cases = 0.0; // .1
left_edge_compensation_for_tight_cases = 0.0; // .1
right_edge_compensation_for_tight_cases = 0.0; // .1


/*[App Layout in px]*/
bottom_of_status_bar = 0; //[0:10000]
bottom_of_upper_message_bar = 0; //[0:10000]
bottom_of_upper_command_bar = 0; //[0:10000]
top_of_lower_message_bar = 0; //[0:10000]
top_of_lower_command_bar = 0; //[0:10000]


/*[App Layout in mm]*/
status_bar_height = 0.0; // .1
upper_message_bar_height = 0.0; // .1
upper_command_bar_height = 0.0; // .1
lower_message_bar_height = 0.0; // .1
lower_command_bar_height = 0.0; // .1


/*[Bar Info]*/
expose_status_bar = "no"; //[yes,no]
expose_upper_message_bar = "no"; //[yes,no]
expose_upper_command_bar = "no"; //[yes,no]
expose_lower_message_bar = "no"; //[yes,no]
expose_lower_command_bar = "no"; //[yes,no]
bar_edge_slope = 90; 
bar_corner_radius = 2; // .1


/*[Grid Info]*/
number_of_rows = 3;
number_of_columns = 4;
cell_shape = "rectangular"; // [rectangular,circular]
cell_height_in_px = 0;
cell_width_in_px = 0;
cell_height_in_mm = 25;
cell_width_in_mm = 25;
cell_corner_radius = 3;
cell_diameter = 15;


/*[Grid Special Settings]*/
cell_edge_slope = 90;
// example: 3,6,12
cover_these_cells = "";
// example: 5,8 merges cells 5&6 and 8&9
merge_cells_horizontally_starting_at = "";
// example: 3,4 merges cell 3 and the cell above and cell 4 and the cell above
merge_cells_vertically_starting_at = "";
// example: 3,6,12
add_a_ridge_around_these_cells = "";
height_of_ridge = 2.0; // .1
thickness_of_ridge = 2.0; // .1
cell_top_edge_slope = 90;
cell_bottom_edge_slope = 90;
top_padding = 0.0; // .1
bottom_padding = 0.0; // .1
left_padding = 0.0; // .1
right_padding = 0.0; // .1
hide_grid_region = "no"; //[yes,no]


/*[Mounting Method]*/
mounting_method = "No Mount"; // [No Mount,Suction Cups,Velcro,Screw-on Straps,Clip-on Straps,Posts,Shelf,Slide-in Tabs,Raised Tabs]


/*[Velcro Info]*/
velcro_size = 1; // [1:10mm -3/8 in- Dots, 2:16mm -5/8 in- Dots, 3:20mm -3/4 in- Dots, 4:3/8 in Squares, 5:5/8 in Squares, 6:3/4 in Squares]


/*[Clip-on Straps Info]*/
clip_locations="horizontal only"; //[horizontal only, vertical only, horizontal and vertical]
horizontal_clip_width=20;
vertical_clip_width=20;
distance_between_horizontal_clips=60;
distance_between_vertical_clips=40;
clip_bottom_length = 35;


/*[Posts Info]*/
post_diameter = 4.0; // .1
post_length = 5;
mount_to_top_of_opening_distance = 5; // .1
notch_in_post = "yes"; // [yes,no]
add_mini_tabs = "no"; // [yes,no]
mini_tab_width = 10;
mini_tab_length = 2.0; // .1
mini_tab_inset_distance = 20;
mini_tab_height = 1.0; // .1
rotate_mini_tab = 0;


/*[Shelf Info]*/
shelf_thickness = 2.0; // .1
shelf_depth = 3; // .1
shelf_corner_radius = 5;


/*[Slide-in Tabs Info]*/
slide_in_tab_locations="horizontal only"; //[horizontal only, vertical only, horizontal and vertical]
preferred_slide_in_tab_thickness = 2.0; // .1
horizontal_slide_in_tab_length = 4;
vertical_slide_in_tab_length = 4;
horizontal_slide_in_tab_width=20;
vertical_slide_in_tab_width=20;
distance_between_horizontal_slide_in_tabs=60;
distance_between_vertical_slide_in_tabs=60;


/*[Raised Tabs Info]*/
raised_tab_height=6;
raised_tab_length=8;
raised_tab_width=20;
preferred_raised_tab_thickness=2; // .1
raised_tabs_starting_height = 0.0; // .1
ramp_angle = 30;
distance_between_raised_tabs=60;
embed_magnets = "no"; // [yes, no]
magnet_size = "20 x 8 x 1.5"; // [20 x 8 x 1.5, 40 x 10 x 2]


/*[Keyguard Frame Info]*/
have_a_keyguard_frame = "no"; //[yes,no]
keyguard_frame_thickness = 5.0; // .1
keyguard_height = 160;
keyguard_width = 210;
keyguard_corner_radius = 2;
mount_keyguard_with = "snap-in tabs"; //[snap-in tabs, posts]
snap_in_tab_on_top_edge_of_keyguard = "yes"; // [yes,no]
snap_in_tab_on_bottom_edge_of_keyguard = "yes"; // [yes,no]
snap_in_tabs_on_left_and_right_edges_of_keyguard = "yes"; // [yes,no]
//the larger the number the tighter the fit, affects only the keyguard frame
post_tightness_of_fit = 0; //[-10:10]
post_extension_distance = 4; // [1:5]
// set this option to "no" before rendering your design
show_keyguard_with_frame = "no"; //[yes,no]


/*[Split Keyguard Info]*/
split_line_location = 0; // [-300:.1:300]
// set this option to "no" before rendering your design
show_split_line = "no"; //[yes,no]
split_line_type = "flat"; //[flat,dovetails]
dovetail_width = 4.0; //[3:.1:6]
slide_dovetails = 0; // [-3:.1:3]
//smaller numbers are looser, larger numbers are tighter (affects first half of keyguard only)
tightness_of_dovetail_joint = 5; //[0:.1:10]


/*[Sloped Keyguard Edge Info]*/
//can only be applied to 3D-printed, rounded-rectangular keyguards
add_sloped_keyguard_edge = "no"; //[yes,no]
sloped_edge_starting_height = 1.0; //.1
sloped_edge_width = 10.0; //.1
case_to_slope_depth = 0.0; //.1
extend_lip_to_edge_of_case = "no"; //[yes,no]


/*[Engraved/Embossed Text]*/
text = "";
//measured in millimeters
text_height = 5.0; //.1
font_style = "normal"; //[normal,bold,italic,bold italic]
keyguard_location = "top surface"; //[top surface,bottom surface]
show_back_of_keyguard = "no"; // [yes,no]
keyguard_region = "screen region"; //[screen region,case region,tablet region]
//positive numbers for embossed text, only on top surface
text_depth = -2.0; // .1
text_horizontal_alignment = "center"; //[left,center,right]
text_vertical_alignment = "center"; //[bottom,baseline,center,top]
text_angle = "horizontal"; // [vertical downward,horizontal,vertical upward,horizontal inverted]
//% of screen, case opening, or tablet width
slide_horizontally = 0; //[0:100]
//% of screen, case opening, or tablet height
slide_vertically = 0; //[0:100]


/*[Cell Inserts]*/
Braille_location = "above opening"; //[above opening, below opening, above and below opening, left of opening, right of opening, left and right of opening]
//separate Braille elements with a comma and no space
Braille_text = "";
// 10 = standard size Braille
Braille_size_multiplier = 10; //[1:30]
add_circular_opening = "yes"; //[yes,no]
diameter_of_opening = 10; // .1
Braille_to_opening_distance = 5.0; // .1
engraved_text = "";
//the larger the number the tighter the fit
insert_tightness_of_fit = 0; //[-10:10]
insert_recess = 0.0; // .1


/*[Free-form and Hybrid Keyguard Openings]*/
//px = pixels, mm = millimeters
unit_of_measure_for_screen = "px"; //[px,mm]
//which corner is (0,0)?
starting_corner_for_screen_measurements = "upper-left"; //[upper-left, lower-left]


/*[Special Actions and Settings]*/
// set this option to "no" before rendering your design
include_screenshot = "no"; //[yes,no]
keyguard_display_angle = 0; // [0,30,45,60,75,90]
//the larger the number the tighter the fit
keyguard_vertical_tightness_of_fit = 0; // [-10:10]
//the larger the number the tighter the fit
keyguard_horizontal_tightness_of_fit = 0; // [-10:10]
unequal_left_side_of_case_opening = 0.0; // .1
unequal_bottom_side_of_case_opening = 0.0; // .1
unequal_left_side_of_case = 0;
unequal_bottom_side_of_case = 0;
//see instructions in Console pane
move_screenshot_horizontally = 0.0; // [-50:.1:50]
//see instructions in Console pane
move_screenshot_vertically = 0.0; // [-50:.1:50]
//not for use with laser-cut keyguards
keyguard_edge_chamfer = 1.0; // .1
//not for use with laser-cut keyguards
cell_edge_chamfer = 1.0; // .1
hide_screen_region = "no"; //[yes,no]
//assuming 0.2 mm layers for a total of 0.4 mm
first_two_layers_only = "no"; //[yes,no]
//specify the lower left coordinate (example: 10,50)
trim_to_rectangle_lower_left = "";
//specify the upper right coordinate (example: 80,125)
trim_to_rectangle_upper_right = "";
smoothness_of_circles_and_arcs = 40; //[5:360]
use_Laser_Cutting_best_practices = "yes"; // [yes,no]
//21 entries e.g., 190,140,10,150,100,20,20,20,20,5,5,5,2,10,4,4,4,10,10,10,10
other_tablet_general_sizes = "";
//3 entries e.g., 1000,1500,0.100
other_tablet_pixel_sizes = "";
//for use with Maker World's online customizer
my_screen_openings = "";
//for use with Maker World's online customizer
my_case_openings = "";
//for use with Maker World's online customizer
my_case_additions = "";
//for use with Maker World's online customizer
my_tablet_openings = "";
//for use with Maker World's online customizer
screenshot_file = "default.svg";




/*[Hidden]*/

keyguard_designer_version = 75; //*****************************

// if this is the "MW" version for Maker World set this statement to true and comment the include statement before start of Main
MW_version = false;
screenshotcolor = (MW_version) ? "white" : "magenta";

// the "true" outcome of the following line of code is for controling keyguard frame mounting options
// orientation = (generate=="keyguard frame") ? "landscape" : orientation;

fudge = 0.001;
ff = fudge; // i.e. fudge factor
camera_cut_angle = 50;

//laser-cut variables
acrylic_thickness = 3.175;
acrylic_slide_in_tab_thickness = (use_Laser_Cutting_best_practices=="yes") ?  1 : preferred_slide_in_tab_thickness;
horizontal_acrylic_slide_in_tab_length = (use_Laser_Cutting_best_practices=="yes") ?  acrylic_thickness : horizontal_slide_in_tab_length;
vertical_acrylic_slide_in_tab_length = (use_Laser_Cutting_best_practices=="yes") ?  acrylic_thickness : vertical_slide_in_tab_length;
acrylic_case_corner_radius = (use_Laser_Cutting_best_practices=="yes") ?  2 : case_opening_corner_radius;
sat_incl_acrylic = (type_of_keyguard=="Laser-Cut") ? acrylic_thickness : screen_area_thickness;
camera_offset_acrylic = (type_of_keyguard=="Laser-Cut") ? sat_incl_acrylic/tan(camera_cut_angle) : 0;


rs_inc_acrylic = (type_of_keyguard=="3D-Printed") ? cell_edge_slope : 90;

bar_edge_slope_inc_acrylic = (type_of_keyguard=="3D-Printed") ? bar_edge_slope : 90;
m_m = (type_of_keyguard=="3D-Printed")  ? mounting_method :
	(type_of_keyguard=="Laser-Cut" && mounting_method=="Slide-in Tabs") ? "Slide-in Tabs" :
	"No Mount";
hbes = (type_of_keyguard=="3D-Printed") ? home_button_edge_slope : 90;


//Tablet Parameters -- 0:Tablet Width, 1:Tablet Height, 2:Tablet Thickness, 3:Screen Width, 4:Screen Height, 
//                     5:Right Border Width, 6:Left Border Width, 7:Bottom Border Height, 8:Top Border Height, 
//                     9:Distance from edge of screen to Home Button, 10:Home Button Height, 11:Home Button Width, 12:Home Button Location,
//                     13:Distance from edge of screen to Camera, 14:Camera Height, 15:Camera Width, 16:Camera Location,
//                     17:Conversion Factors (# vertical pixels, # horizontal pixels, pixel size (mm)), 
//                     18:Tablet Top Left Corner Radius, 19:Tablet Top Right Corner Radius, 20:Tablet Bottom Left Corner Radius, 21:Tablet Bottom Right Corner Radius
iPad_data=[242.9,189.7,13.4,197.0176,147.7632,22.929,22.929,20.959,20.959,11.329,11.2,11.2,2,12.529,4.5,4.5,4,[768,1024,0.1924],10,10,10,10];
iPad2_data=[241.3,185.8,8.8,197.0176,147.7632,22.129,22.129,19.009,19.009,11.329,11.3,11.3,2,11.029,4.5,4.5,4,[768,1024,0.1924],10,10,10,10];
iPad3rdgeneration_data=[241.3,185.8,9.41,197.0176,147.7632,22.129,22.129,19.009,19.009,11.329,11.3,11.3,2,11.029,4.5,4.5,4,[1536,2048,0.0962],10,10,10,10];
iPad4thgeneration_data=iPad3rdgeneration_data;
iPad5thgeneration_data=[240.0,169.47,6.1,197.0176,147.7632,21.479,21.479,10.844,10.844,11.379,14.6,14.6,2,10.409,12.5,4.5,4,[1536,2048,0.0962],10,10,10,10];
iPad6thgeneration_data=iPad5thgeneration_data;
iPad7thgeneration_data=[250.59,174.08,7.5,207.792,155.844,21.386,21.386,9.108,9.108,11.326,12.6,12.6,2,10.316,12.5,4.5,4,[1620,2160,0.0962],10,10,10,10];
iPad8thgeneration_data=iPad7thgeneration_data;
iPad9thgeneration_data=iPad7thgeneration_data;
iPad10thgeneration_data=[248.63,179.51,7.03,227.032,157.768,10.784,10.784,10.861,10.861,0,0,0,0,5.621,5.621,30,1,[1640,2360,0.0962],10,10,10,10];
iPad11thgeneration_A16_data=iPad10thgeneration_data;
iPadPro97inch_data=[240.0,169.47,6.1,197.0176,147.7632,21.479,21.479,10.844,10.844,11.379,14.6,14.6,2,10.379,4.5,4.5,4,[1536,2048,0.0962],10,10,10,10];
iPadPro105inch_data=[250.59,174.08,6.1,213.9488,160.4616,18.307,18.307,6.799,6.799,9.347,14.6,14.6,2,9.107,4.5,4.5,4,[1668,2224,0.0962],10,10,10,10];
iPadPro11inch1stGeneration_data=[247.64,178.52,5.953,229.7256,160.4616,8.943,8.943,9.019,9.019,0,0.0,0.0,2,4.573,4.5,4.5,4,[1668,2388,0.0962],10,10,10,10];
iPadPro11inch2ndGeneration_data=iPadPro11inch1stGeneration_data;
iPadPro11inch3rdGeneration_data=iPadPro11inch1stGeneration_data;
iPadPro11inch4thGeneration_data=iPadPro11inch1stGeneration_data;
iPadPro11inch_M4_data=[249.7,177.51,5.3,232.804,160.4616,8.4333,8.4333,8.5141,8.5141,0,0.0,0.0,2,3.8041,3.5,42.5,1,[1668,2420,0.0962],10,10,10,10];
iPadPro129inch1stGeneration_data=[305.69,220.58,6.9,262.8184,197.0176,21.419,21.419,11.769,11.769,11.319,14.6,14.6,2,10.319,4.5,4.5,4,[2048,2732,0.0962],10,10,10,10];
iPadPro129inch2ndGeneration_data=iPadPro129inch1stGeneration_data;
iPadPro129inch3rdGeneration_data=[280.66,214.99,5.908,262.8184,197.0176,9.2,9.2,9.18,9.18,0,0,0,0,4.534,33,4.5,4,[2048,2732,0.0962],10,10,10,10];
iPadPro129inch4thGeneration_data=iPadPro129inch3rdGeneration_data;
iPadPro129inch5thGeneration_data=[280.66,214.99,6.44,262.8184,197.0176,9.2,9.2,9.18,9.18,0,0,0,0,4.534,33,4.5,4,[2048,2732,0.0962],10,10,10,10];
iPadPro129inch6thGeneration_data=iPadPro129inch5thGeneration_data;
iPadPro13inch_M4_data=[281.58,215.53,5.3,264.7424,198.5568,8.4021,8.4021,8.4741,8.4741,0,0,0,0,3.7641,3.5,42,1,[2064,2752,0.0962],10,10,10,10];
iPadmini_data=[200.1,134.7,7.2,159.5392,119.6544,20.266,20.266,7.512,7.512,11,10.0,10.0,2,10,12.5,4.5,4,[768,1024,0.1558],10,10,10,10];
iPadmini2_data=[200.1,134.7,7.5,159.5392,119.6544,20.266,20.266,7.512,7.512,11,10.0,10.0,2,10,4.5,4.5,4,[1536,2048,0.0779],10,10,10,10];
iPadmini3_data=iPadmini2_data;
iPadmini4_data=[203.16,134.75,6.1,159.5392,119.6544,21.796,21.796,7.537,7.537,12.286,10.6,10.6,2,11.296,4.5,4.5,4,[1536,2048,0.0779],10,10,10,10];
iPadmini5_data=iPadmini4_data;
iPadmini6_data=[195.43,134.75,6.32,176.5214,115.9152,9.438313,9.438313,9.406902,9.406902,0,0,0,0,5.058313,6,6,4,[1488,2266,0.0779],12,12,12,12];
iPadmini7_A17Pro_data=iPadmini6_data;
iPadAir_data=[240.0,169.5,7.5,197.0176,147.7632,21.479,21.479,10.859,10.859,11.379,10.7,10.7,2,10.379,4.5,4.5,4,[1536,2048,0.0962],10,10,10,10];
iPadAir2_data=[240.0,169.5,6.1,197.0176,147.7632,21.479,21.479,10.844,10.844,11.379,14.6,14.6,2,10.409,4,4,4,[1536,2048,0.0962],10,10,10,10];
iPadAir3_data=[250.59,174.08,6.1,213.9488,160.4616,18.307,18.307,6.799,6.799,9.347,14.6,14.6,2,8.687,4,4,4,[1668,2224,0.0962],10,10,10,10];
iPadAir4_data=[247.64,178.51,6.123,227.032,157.768,10.2697,10.2697,10.3561,10.3561,0,0,0,0,5.03,4.5,4.5,4,[1640,2360,0.0962],12,12,12,12];
iPadAir5_data=iPadAir4_data;
iPadAir11inch_M2_data=[247.64,178.52,6.123,227.032,157.768,10.2897,10.2897,10.3661,10.3661,0,0,0,0,5.8761,4.5,34,1,[1640,2360,0.0962],12,12,12,12];
iPadAir13inch_M2_data=[280.66,215.0,6.1,262.8184,197.0176,8.9042,8.9042,8.9788,8.9788,0,0,0,0,4.7588,3.5,35,1,[2048,2732,0.0962],12,12,12,12];
iPadAir11inch_M3_data=iPadAir11inch_M2_data;
iPadAir13inch_M3_data=iPadAir13inch_M2_data;
surface_2_data=[275.0,173,8.9,234.432,131.868,20.269,20.269,20.558,20.558,0,0.0,0.0,0,6.24,5.0,50.0,1,[1080,1920,0.1221],5,5,5,5];
surface_3_data=[267.0,187,8.6,227.904,151.936,19.556,19.556,17.537,17.537,0,0.0,0.0,6.24,0,5.0,50.0,1,[1280,1920,0.1187],5,5,5,5];
surface_pro_3_data=[290.0,201,9.1,254.016,169.344,18,18,15.833,15.833,0,0.0,0.0,0,6.24,5.0,50.0,1,[1440,2160,0.1176],5,5,5,5];
surface_pro_4_data=[292.1,201.42,8.45,260.1936,173.4624,15.911,15.911,13.95,13.95,0,0.0,0.0,0,6.24,5.0,50.0,1,[1824,2736,0.0951],5,5,5,5];
surface_pro_5_data=[292.0,201,8.5,260.1936,173.4624,15.861,15.861,13.74,13.74,0,0.0,0.0,0,6.24,5.0,50.0,1,[1824,2736,0.0951],5,5,5,5];
surface_pro_6_data=[292.0,201,8.5,260.1936,173.4624,15.861,15.861,13.74,13.74,0,0.0,0.0,0,6.24,5.0,50.0,1,[1824,2736,0.0951],5,5,5,5];
surface_pro_7_data=[292.0,201,8.5,260.1936,173.4624,15.861,15.861,13.74,13.74,0,0.0,0.0,0,6.24,5.0,50.0,1,[1824,2736,0.0951],5,5,5,5];
surface_pro_8_data=[287,208,9.3,273.888,182.592,6.556,6.556,12.704,12.704,0,0.0,0.0,0,6.24,5.0,50.0,1,[1920,2880,0.0951],5,5,5,5];
surface_pro_9_data=[287,209,9.3,273.888,182.592,6.556,6.556,13.204,13.204,0,0.0,0.0,0,6.24,5.0,50.0,1,[1920,2880,0.0951],5,5,5,5];
surface_pro_x_data=[287,208,7.3,273.888,182.592,6.556,6.556,12.704,12.704,0,0.0,0.0,0,6.24,5.0,50.0,1,[1920,2880,0.0951],5,5,5,5];
surface_go_data=[245,175,8.3,210.78,140.52,17.154,17.154,17.27,17.27,0,0.0,0.0,0,0,0.0,0.0,0,[1200,1800,0.1171],5,5,5,5];
surface_go_2_data=[245,175,8.3,221.76,147.84,11.6635,11.6635,13.58,13.58,0,0.0,0.0,0,0,0.0,0.0,0,[1280,1920,0.1155],5,5,5,5];
surface_go_3_data=[245,175,8.3,221.76,147.84,11.6635,11.6635,13.58,13.58,0,0.0,0.0,0,0,0.0,0.0,0,[1280,1920,0.1155],5,5,5,5];
surface_go_4_data=[245,175,8.3,221.76,147.84,11.6635,11.6635,13.58,13.58,0,0.0,0.0,0,0,0.0,0.0,0,[1280,1920,0.1155],5,5,5,5];
accent_800_30_data=[0,0,0,173,108,0,0,0,0,8,10,10,3,8.5,4.5,4.5,1,[1200,1920,0.090],0,0,0,0];
accent_800_40_data=[0,0,0,173,108,0,0,0,0,8,10,10,3,8.5,4.5,4.5,1,[1200,1920,0.090],0,0,0,0];
accent_1000_20_data=[0,0,0,216.7552,135.472,0,0,0,0,10,10,10,3,11,6,6,1,[800,1280,0.16934],0,0,0,0];
accent_1000_30_data=[0,0,0,216.768,135.48,0,0,0,0,10,10,10,3,10,4,4,1,[1200,1920,0.1129],0,0,0,0];
accent_1000_40_data=[0,0,0,216.768,135.48,0,0,0,0,10,10,10,3,10,4,4,1,[1200,1920,0.1129],0,0,0,0];
accent_1400_20_data=[0,0,0,308.736,173.664,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[1080,1920,0.1608],0,0,0,0];
accent_1400_30a_data=[0,0,0,310.784,174.816,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[1440,2560,0.1214],0,0,0,0];
accent_1400_30b_data=[0,0,0,305.664,171.936,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[2160,3840,0.0796],0,0,0,0];
Via_Pro_data=iPadPro11inch2ndGeneration_data;
Via_Mini_data=iPadmini6_data;
Via_Nano_data=[147.64,71.63,7.81,141.0912,65.0808,3.275,3.275,3.275,3.275,0,0,0,0,0,0,0,0,[1179,2556,0.0552],10,10,10,10];
amazon_fire_hd_7_data=[192,115,9.6,152.064,89.1,19.949,19.949,12.939,12.939,0,0.0,0.0,0,7,4.5,4.5,1,[600,1024,0.1485],10,10,10,10];
amazon_fire_hd_8_data=[202,137,9.7,172.032,107.52,14.989,14.989,14.743,14.743,0,0.0,0.0,0,7,4.5,4.5,1,[800,1280,0.1344],10,10,10,10];
amazon_fire_hd_8_plus_data=[202,137,9.7,172.032,107.52,14.989,14.989,14.743,14.743,0,0.0,0.0,0,7,4.5,4.5,1,[800,1280,0.1344],10,10,10,10];
amazon_fire_hd_10_data=[262,157,9.8,217.728,136.08,22.135,22.135,10.46,10.46,0,0.0,0.0,0,7,4.5,4.5,1,[1200,1920,0.1134],10,10,10,10];
amazon_fire_hd_10_plus_data=[247,166,9.2,217.728,136.08,14.635,14.635,14.96,14.96,0,0.0,0.0,0,7,4.5,4.5,1,[1200,1920,0.1134],10,10,10,10];
amazon_fire_max_11_data=[259.1,163.7,7.5,238.4,143.04,10.3,10.3,10.3,10.3,0,0.0,0.0,0,7,4.5,4.5,1,[1200,2000,0.1192],10,10,10,10];
dynavox_i_12_plus_data=[288,222.5,23,246.3744,184.7808,21,21,13,24,0,0.0,0.0,0,14.5,5,5,1,[768,1024,0.2406],10,10,10,10];
dynavox_indi_data=[239,165,20,216.576,135.36,11.6,11.6,14,16,7,8,8,3,10,3.5,3.5,1,[1200,1920,0.1128],10,10,10,10];
tobii_t_15Plus_data=[352,276,0,307.5,230.5,23,21.5,17,31,0,0,0,0,17,6,6,1,[768,1024,0.3001],17,17,5,5];
tobii_i_110_data=[0,0,0,216.576,135.36,0,0,0,0,10,10,10,3,10,6,35,1,[1200,1920,0.1128],0,0,0,0];
tobii_i_13_data=[322.5,210,0,293.5,165,14.5,14.5,26,16,0,0,0,0,10,5,5,1,[1080,1920,0.1528],10,10,2,2];
tobii_i_16_data=[376,236,0,344.352,193.698,15.5,15.5,25,17,0,0,0,0,10,8.5,8.5,1,[1080,1920,0.17935],10,10,2,2];
gridpad_10s_data=[0,0,0,216.96,135.6,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[1200,1920,0.113],0,10,10,10];
gridpad_11_data=[0,0,0,257.088,144.612,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[1080,1920,0.1339],5,5,5,5];
gridpad_12_data=[0,0,0,276.1,155.306,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[1080,1920,0.1438],5,5,5,5];
gridpad_13_data=[333,228,17,294.912,165.888,19,19,44,19,0,0,0,0,0,0,0,0,[1080,1920,0.1536],15,15,15,15];
gridpad_15_data=[0,0,0,343,193,0,0,0,0,0,0,0,0,0,0,0,0,[1080,1920,0.1787],4,4,4,4];
SamsungGalaxyTabS3_data=[237.3,169,6,197.0424,147.7818,20.129,20.129,10.609,10.609,0,0.0,0.0,0,0,0.0,0.0,0,[1536,2048,0.0962],5,5,5,5];
SamsungGalaxyTabA84_data=[202,125.2,7.1,180.6222,112.8889,10.689,10.689,6.156,6.156,0,0,0,0,0,0,0,0,[1200,1920,0.094074074],10,10,10,10];
SamsungGalaxyTabA7104_data=[247.6,157.4,7,226.7857,136.0714,10.407,10.407,10.664,10.664,0,0,0,0,0,0,0,0,[1200,2000,0.113392857],10,10,10,10];
SamsungGalaxyTabA7Lite_data=[212.5,124.7,8,190.1453,113.5196,11.177,11.177,5.59,5.59,0,0,0,0,0,0,0,0,[800,1340,0.141899441],10,10,10,10];
SamsungGalaxyTabA8_data=[246.8,161.9,6.9,225.7778,141.1111,10.511,10.511,10.394,10.394,0,0,0,0,0,0,0,0,[1200,1920,0.117592593],10,10,10,10];
SamsungGalaxyTabA9_data=[211,124.7,8,190.1453,113.5196,10.427,10.427,5.59,5.59,0,0,0,0,0,0,0,0,[800,1340,0.141899441],10,10,10,10];
SamsungGalaxyTabA9Plus_data=[257.1,168.7,6.9,236.7379,147.9612,10.181,10.181,10.369,10.369,0,0,0,0,0,0,0,0,[1200,1920,0.123300971],10,10,10,10];
SamsungGalaxyTabActive5_data=[213.8,126.8,10.1,172.3251,107.7032,20.737,20.737,9.548,9.548,0,0,0,0,0,0,0,0,[1200,1920,0.08975265],10,10,10,10];
SamsungGalaxyTabActive3_data=[213.8,126.8,9.9,172.3251,107.7032,20.737,20.737,9.548,9.548,0,0,0,0,0,0,0,0,[1200,1920,0.08975265],10,10,10,10];
SamsungGalaxyTabActive2_data=[214.7,127.6,9.9,172.0212,107.5132,21.3394,21.3394,10.0434,10.0434,0,0,0,0,0,0,0,0,[1200,1920,0.1344],10,10,10,10];
SamsungGalaxyTabActive4Pro_data=[242.9,170.2,10.2,217.7143,136.0714,12.593,12.593,17.064,17.064,0,0,0,0,0,0,0,0,[1200,1920,0.113392857],10,10,10,10];
SamsungGalaxyTabS6_data=[244.5,159.5,5.7,226.5645,141.6028,8.968,8.968,8.949,8.949,0,0,0,0,0,0,0,0,[1600,2560,0.088501742],10,10,10,10];
SamsungGalaxyTabS6Lite_data=[244.5,154.3,7,226.7857,136.0714,8.857,8.857,9.114,9.114,0,0,0,0,0,0,0,0,[1200,2000,0.113392857],10,10,10,10];
SamsungGalaxyTabS7_data=[253.8,165.3,6.3,237.3139,148.3212,8.243,8.243,8.489,8.489,0,0,0,0,0,0,0,0,[1600,2560,0.09270073],10,10,10,10];
SamsungGalaxyTabS7FE_data=[284.8,185,6.3,267.5885,167.2428,8.606,8.606,8.879,8.879,0,0,0,0,0,0,0,0,[1600,2560,0.104526749],10,10,10,10];
SamsungGalaxyTabS7Plus_data=[285,185,5.7,267.3684,167.2962,8.816,8.816,8.852,8.852,0,0,0,0,0,0,0,0,[1752,2800,0.095488722],10,10,10,10];
SamsungGalaxyTabS8_data=[253.8,165.3,6.3,237.3139,148.3212,8.243,8.243,8.489,8.489,0,0,0,0,0,0,0,0,[1600,2560,0.09270073],10,10,10,10];
SamsungGalaxyTabS8Ultra_data=[326.4,208.6,5.5,313.2667,195.58,6.567,6.567,6.51,6.51,0,0,0,0,0,0,0,0,[1848,2960,0.105833333],10,10,10,10];
SamsungGalaxyTabS8Plus_data=[285,185,5.7,267.3684,167.2962,8.816,8.816,8.852,8.852,0,0,0,0,0,0,0,0,[1752,2800,0.095488722],10,10,10,10];
SamsungGalaxyTabS9_data=[254.3,165.8,5.9,237.3139,148.3212,8.493,8.493,8.739,8.739,0,0,0,0,0,0,0,0,[1600,2560,0.09270073],10,10,10,10];
SamsungGalaxyTabS9FE_data=[254.3,165.8,6.5,235.0265,146.8916,9.637,9.637,9.454,9.454,0,0,0,0,0,0,0,0,[1440,2304,0.102008032],10,10,10,10];
SamsungGalaxyTabS9FEPlus_data=[285.4,185.4,6.5,267.5885,167.2428,8.906,8.906,9.079,9.079,0,0,0,0,0,0,0,0,[1600,2560,0.104526749],10,10,10,10];
SamsungGalaxyTabS9Ultra_data=[326.4,208.6,5.5,314.5774,196.3983,5.911,5.911,6.101,6.101,0,0,0,0,0,0,0,0,[1848,2960,0.106276151],10,10,10,10];
SamsungGalaxyTabS9Plus_data=[285.4,185.4,5.7,267.3684,167.2962,9.016,9.016,9.052,9.052,0,0,0,0,0,0,0,0,[1752,2800,0.095488722],10,10,10,10];
novachat_5_data=[156.2,76.2,5,121.536,68.364,17.292,17.292,3.896,3.896,0,0.0,0.0,0,0,0.0,0.0,0,[1080,1920,0.0633],5,5,5,5];
novachat_5_3_data=[0,0,0,125.952,70.848,0,0,0,0,0,0,0,0,0,0,0,0,[1440,2560,0.0492],0,0,0,0];
novachat_5_4_data=[0,0,0,121.6128,68.4072,0,0,0,0,0,0,0,0,0,0,0,0,[1080,1920,0.06334],0];
novachat_8_5_data=[0,0,0,172.416,107.76,0,0,0,0,0,0,0,0,0,0,0,0,[1200,1920,0.0898],0,0,0,0];
novachat12_data=[295.6,204,8,263.168,164.48,16.172,16.172,19.733,19.733,0,0.0,0.0,0,0,0.0,0.0,0,[1600,2560,0.1028],5,5,5,5];
chatfusion10_data=[0,0,0,218.496,136.56,0,0,0,0,0,0.0,0.0,0,0,0.0,0.0,0,[1200,1920,0.1138],0,0,0,0];
blank_data=[200,60,3,200,60,0,0,0,0,0,0,0,0,0,0,0,0,[60,200,1],0,0,0,0];
catch_all_data=[400,100,20,216.576,135.36,11.6,11.6,14,16,7,8,8,3,10,3.5,3.5,1,[1200,1920,0.1128],10,10,10,10];


tablet_params = 
    (type_of_tablet=="iPad")? iPad_data
  : (type_of_tablet=="iPad2")? iPad2_data
  : (type_of_tablet=="iPad 3rd generation")? iPad3rdgeneration_data
  : (type_of_tablet=="iPad 4th generation")? iPad4thgeneration_data
  : (type_of_tablet=="iPad 5th generation")? iPad5thgeneration_data
  : (type_of_tablet=="iPad 6th generation")? iPad6thgeneration_data
  : (type_of_tablet=="iPad 7th generation")? iPad7thgeneration_data
  : (type_of_tablet=="iPad 8th generation")? iPad8thgeneration_data
  : (type_of_tablet=="iPad 9th generation")? iPad9thgeneration_data
  : (type_of_tablet=="iPad 11th generation A16")? iPad11thgeneration_A16_data
  : (type_of_tablet=="iPad 10th generation")? iPad10thgeneration_data
  : (type_of_tablet=="iPad Pro 9.7-inch")? iPadPro97inch_data
  : (type_of_tablet=="iPad Pro 10.5-inch")? iPadPro105inch_data
  : (type_of_tablet=="iPad Pro 11-inch 1st Generation")? iPadPro11inch1stGeneration_data
  : (type_of_tablet=="iPad Pro 11-inch 2nd Generation")? iPadPro11inch2ndGeneration_data
  : (type_of_tablet=="iPad Pro 11-inch 3rd Generation")? iPadPro11inch3rdGeneration_data
  : (type_of_tablet=="iPad Pro 11-inch 4th Generation")? iPadPro11inch4thGeneration_data
  : (type_of_tablet=="iPad Pro 11-inch M4")? iPadPro11inch_M4_data
  : (type_of_tablet=="iPad Pro 12.9-inch 1st Generation")? iPadPro129inch1stGeneration_data
  : (type_of_tablet=="iPad Pro 12.9-inch 2nd Generation")? iPadPro129inch2ndGeneration_data
  : (type_of_tablet=="iPad Pro 12.9-inch 3rd Generation")? iPadPro129inch3rdGeneration_data
  : (type_of_tablet=="iPad Pro 12.9-inch 4th Generation")? iPadPro129inch4thGeneration_data
  : (type_of_tablet=="iPad Pro 12.9-inch 5th Generation")? iPadPro129inch5thGeneration_data
  : (type_of_tablet=="iPad Pro 12.9-inch 6th Generation")? iPadPro129inch6thGeneration_data
  : (type_of_tablet=="iPad Pro 13-inch M4")? iPadPro13inch_M4_data
  : (type_of_tablet=="iPad mini")? iPadmini_data
  : (type_of_tablet=="iPad mini 2")? iPadmini2_data
  : (type_of_tablet=="iPad mini 3")? iPadmini3_data
  : (type_of_tablet=="iPad mini 4")? iPadmini4_data
  : (type_of_tablet=="iPad mini 5")? iPadmini5_data
  : (type_of_tablet=="iPad mini 6")? iPadmini6_data
  : (type_of_tablet=="iPad mini 7 A17 Pro")? iPadmini7_A17Pro_data
  : (type_of_tablet=="iPad Air")? iPadAir_data
  : (type_of_tablet=="iPad Air 2")? iPadAir2_data
  : (type_of_tablet=="iPad Air 3")? iPadAir3_data
  : (type_of_tablet=="iPad Air 4")? iPadAir4_data
  : (type_of_tablet=="iPad Air 5")? iPadAir5_data
  : (type_of_tablet=="iPad Air 11-inch M2")? iPadAir11inch_M2_data
  : (type_of_tablet=="iPad Air 13-inch M2")? iPadAir13inch_M2_data
  : (type_of_tablet=="iPad Air 11-inch M3")? iPadAir11inch_M3_data
  : (type_of_tablet=="iPad Air 13-inch M3")? iPadAir13inch_M3_data
  : (type_of_tablet=="NovaChat 5")? novachat_5_data
  : (type_of_tablet=="NovaChat 5.3")? novachat_5_3_data
  : (type_of_tablet=="NovaChat 5.4")? novachat_5_4_data
  : (type_of_tablet=="NovaChat 8.5")? novachat_8_5_data
  : (type_of_tablet=="NovaChat 12")? novachat12_data
  : (type_of_tablet=="Chat Fusion 10")? chatfusion10_data
  : (type_of_tablet=="Surface 2")? surface_2_data
  : (type_of_tablet=="Surface 3")? surface_3_data
  : (type_of_tablet=="Surface Pro 3")? surface_pro_3_data
  : (type_of_tablet=="Surface Pro 4")? surface_pro_4_data
  : (type_of_tablet=="Surface Pro 5")? surface_pro_5_data
  : (type_of_tablet=="Surface Pro 6")? surface_pro_6_data
  : (type_of_tablet=="Surface Pro 7")? surface_pro_7_data
  : (type_of_tablet=="Surface Pro 8")? surface_pro_8_data
  : (type_of_tablet=="Surface Pro 9")? surface_pro_9_data
  : (type_of_tablet=="Surface Pro X")? surface_pro_x_data
  : (type_of_tablet=="Surface Go")? surface_go_data
  : (type_of_tablet=="Surface Go 2")? surface_go_2_data
  : (type_of_tablet=="Surface Go 3")? surface_go_3_data
  : (type_of_tablet=="Surface Go 4")? surface_go_4_data
  : (type_of_tablet=="Accent 800-30")? accent_800_30_data
  : (type_of_tablet=="Accent 800-40")? accent_800_40_data
  : (type_of_tablet=="Accent 1000-20")? accent_1000_20_data
  : (type_of_tablet=="Accent 1000-30")? accent_1000_30_data
  : (type_of_tablet=="Accent 1000-40")? accent_1000_40_data
  : (type_of_tablet=="Accent 1400-20")? accent_1400_20_data
  : (type_of_tablet=="Accent 1400-30a")? accent_1400_30a_data
  : (type_of_tablet=="Accent 1400-30b")? accent_1400_30b_data
  : (type_of_tablet=="Via Nano")? Via_Nano_data
  : (type_of_tablet=="Via Mini")? Via_Mini_data
  : (type_of_tablet=="Via Pro")? Via_Pro_data
  : (type_of_tablet=="Amazon Fire HD 7")? amazon_fire_hd_7_data
  : (type_of_tablet=="Amazon Fire HD 8")? amazon_fire_hd_8_data
  : (type_of_tablet=="Amazon Fire HD 8 Plus")? amazon_fire_hd_8_plus_data
  : (type_of_tablet=="Amazon Fire HD 10")? amazon_fire_hd_10_data
  : (type_of_tablet=="Amazon Fire HD 10 Plus")? amazon_fire_hd_10_plus_data
  : (type_of_tablet=="Amazon Fire Max 11")? amazon_fire_max_11_data
  : (type_of_tablet=="Dynavox I-12+")? dynavox_i_12_plus_data
  : (type_of_tablet=="Tobii-Dynavox T-15+")? tobii_t_15Plus_data
  : (type_of_tablet=="Tobii-Dynavox I-110")? tobii_i_110_data
  : (type_of_tablet=="Tobii-Dynavox I-13")? tobii_i_13_data
  : (type_of_tablet=="Tobii-Dynavox I-16")? tobii_i_16_data
  : (type_of_tablet=="Dynavox Indi")? dynavox_indi_data
  : (type_of_tablet=="GridPad 10s") ? gridpad_10s_data
  : (type_of_tablet=="GridPad 11") ? gridpad_11_data
  : (type_of_tablet=="GridPad 12") ? gridpad_12_data
  : (type_of_tablet=="GridPad 13") ? gridpad_13_data
  : (type_of_tablet=="GridPad 15") ? gridpad_15_data
  : (type_of_tablet=="Samsung Galaxy Tab A 8.4")? SamsungGalaxyTabA84_data
  : (type_of_tablet=="Samsung Galaxy Tab A7 10.4")? SamsungGalaxyTabA7104_data
  : (type_of_tablet=="Samsung Galaxy Tab A7 Lite")? SamsungGalaxyTabA7Lite_data
  : (type_of_tablet=="Samsung Galaxy Tab A8")? SamsungGalaxyTabA8_data
  : (type_of_tablet=="Samsung Galaxy Tab A9")? SamsungGalaxyTabA9_data
  : (type_of_tablet=="Samsung Galaxy Tab A9+")? SamsungGalaxyTabA9Plus_data
  : (type_of_tablet=="Samsung Galaxy Tab Active 5")? SamsungGalaxyTabActive5_data
  : (type_of_tablet=="Samsung Galaxy Tab Active 3")? SamsungGalaxyTabActive3_data
  : (type_of_tablet=="Samsung Galaxy Tab Active 2")? SamsungGalaxyTabActive2_data
  : (type_of_tablet=="Samsung Galaxy Tab Active 4 Pro")? SamsungGalaxyTabActive4Pro_data
  : (type_of_tablet=="Samsung Galaxy Tab S3")? SamsungGalaxyTabS3_data
  : (type_of_tablet=="Samsung Galaxy Tab S6")? SamsungGalaxyTabS6_data
  : (type_of_tablet=="Samsung Galaxy Tab S6 Lite")? SamsungGalaxyTabS6Lite_data
  : (type_of_tablet=="Samsung Galaxy Tab S7")? SamsungGalaxyTabS7_data
  : (type_of_tablet=="Samsung Galaxy Tab S7 FE")? SamsungGalaxyTabS7FE_data
  : (type_of_tablet=="Samsung Galaxy Tab S7+")? SamsungGalaxyTabS7Plus_data
  : (type_of_tablet=="Samsung Galaxy Tab S8")? SamsungGalaxyTabS8_data
  : (type_of_tablet=="Samsung Galaxy Tab S8 Ultra")? SamsungGalaxyTabS8Ultra_data
  : (type_of_tablet=="Samsung Galaxy Tab S8+")? SamsungGalaxyTabS8Plus_data
  : (type_of_tablet=="Samsung Galaxy Tab S9")? SamsungGalaxyTabS9_data
  : (type_of_tablet=="Samsung Galaxy Tab S9 FE")? SamsungGalaxyTabS9FE_data
  : (type_of_tablet=="Samsung Galaxy Tab S9 FE+")? SamsungGalaxyTabS9FEPlus_data
  : (type_of_tablet=="Samsung Galaxy Tab S9 Ultra")? SamsungGalaxyTabS9Ultra_data
  : (type_of_tablet=="Samsung Galaxy Tab S9+")? SamsungGalaxyTabS9Plus_data  : (type_of_tablet=="blank") ? blank_data
  : catch_all_data;
  

//logic to handle strings/vectors as input - primarily for use on Maker World
c_t_c = parse_csv_mixed_top(cover_these_cells); // same call handles plain CSV
m_cell_h = parse_csv_mixed_top(merge_cells_horizontally_starting_at); // same call handles plain CSV
m_c_v = parse_csv_mixed_top(merge_cells_vertically_starting_at); // same call handles plain CSV
a_r_a = parse_csv_mixed_top(add_a_ridge_around_these_cells); // same call handles plain CSV

t_t_r_ll = parse_csv_mixed_top(trim_to_rectangle_lower_left); // same call handles plain CSV
t_t_r_ur = parse_csv_mixed_top(trim_to_rectangle_upper_right); // same call handles plain CSV
o_t_g_s = parse_csv_mixed_top(other_tablet_general_sizes); // same call handles plain CSV
o_t_p_s = parse_csv_mixed_top(other_tablet_pixel_sizes); // same call handles plain CSV
	
	
// Tablet variables
ot_test = (type_of_tablet=="other tablet" && len(o_t_g_s)==21) && (len(o_t_p_s)==3);

st_tablet_width = (orientation=="landscape") ? tablet_params[0] : tablet_params[1];
ot_tablet_width = (orientation=="landscape") ? o_t_g_s[0] : o_t_g_s[1];
tablet_width = (ot_test) ? ot_tablet_width : st_tablet_width;
tablet_width_l = (ot_test) ? o_t_g_s[0] : tablet_params[0]; //in landscape mode

st_tablet_height = (orientation=="landscape") ? tablet_params[1] : tablet_params[0];
ot_tablet_height = (orientation=="landscape") ? o_t_g_s[1] : o_t_g_s[0];
tablet_height = (ot_test) ? ot_tablet_height : st_tablet_height;
tablet_height_l = (ot_test) ? o_t_g_s[1] : tablet_params[1]; //in landscape mode

th = tablet_height;	// height of tablet in millimeters
tw = tablet_width;	// width of tablet in millimeters

st_tablet_tl_corner_radius = tablet_params[18];
ot_tablet_tl_corner_radius = o_t_g_s[17]; //this vector is one value shorter than the standard tablet data vector
tablet_tl_corner_radius = (ot_test) ? ot_tablet_tl_corner_radius : st_tablet_tl_corner_radius;

st_tablet_tr_corner_radius = tablet_params[19];
ot_tablet_tr_corner_radius = o_t_g_s[18]; //this vector is one value shorter than the standard tablet data vector
tablet_tr_corner_radius = (ot_test) ? ot_tablet_tr_corner_radius : st_tablet_tr_corner_radius;

st_tablet_bl_corner_radius = tablet_params[20];
ot_tablet_bl_corner_radius = o_t_g_s[19]; //this vector is one value shorter than the standard tablet data vector
tablet_bl_corner_radius = (ot_test) ? ot_tablet_bl_corner_radius : st_tablet_bl_corner_radius;

st_tablet_br_corner_radius = tablet_params[21];
ot_tablet_br_corner_radius = o_t_g_s[20]; //this vector is one value shorter than the standard tablet data vector
tablet_br_corner_radius = (ot_test) ? ot_tablet_br_corner_radius : st_tablet_br_corner_radius;

st_tablet_thickness = tablet_params[2];
ot_tablet_thickness = o_t_g_s[2];
tablet_thickness = (ot_test) ? ot_tablet_thickness : st_tablet_thickness;

st_right_border_width = (orientation=="landscape") ? tablet_params[5] : tablet_params[8];
ot_right_border_width = (orientation=="landscape") ? o_t_g_s[5] : o_t_g_s[8];
pre_right_border_width = (ot_test) ? ot_right_border_width : st_right_border_width;

st_left_border_width = (orientation=="landscape") ? tablet_params[6] : tablet_params[7];
ot_left_border_width = (orientation=="landscape") ? o_t_g_s[6] : o_t_g_s[7];
pre_left_border_width = (ot_test) ? ot_left_border_width : st_left_border_width;

st_top_border_height = (orientation=="landscape") ? tablet_params[8] : tablet_params[6];
ot_top_border_height = (orientation=="landscape") ? o_t_g_s[8] : o_t_g_s[6];
pre_top_border_height = (ot_test) ? ot_top_border_height : st_top_border_height;

st_bottom_border_height = (orientation=="landscape") ? tablet_params[7] : tablet_params[5];
ot_bottom_border_height = (orientation=="landscape") ? o_t_g_s[7] : o_t_g_s[5];
pre_bottom_border_height = (ot_test) ? ot_bottom_border_height : st_bottom_border_height;

right_border_width = (rotate_tablet_180_degrees=="no") ? pre_right_border_width : pre_left_border_width;
left_border_width = (rotate_tablet_180_degrees=="no") ? pre_left_border_width : pre_right_border_width;
top_border_height = (rotate_tablet_180_degrees=="no") ? pre_top_border_height : pre_bottom_border_height;
bottom_border_height = (rotate_tablet_180_degrees=="no") ? pre_bottom_border_height : pre_top_border_height;

st_distance_from_screen_to_home_button = tablet_params[9];
ot_distance_from_screen_to_home_button = o_t_g_s[9];
distance_from_screen_to_home_button = (ot_test) ? ot_distance_from_screen_to_home_button : st_distance_from_screen_to_home_button;

st_home_button_height = (orientation=="landscape") ? tablet_params[10] : tablet_params[11];
ot_home_button_height = (orientation=="landscape") ? o_t_g_s[10] : o_t_g_s[11];
home_button_height = (ot_test) ? ot_home_button_height : st_home_button_height;

st_home_button_width = (orientation=="landscape") ? tablet_params[11] : tablet_params[10];
ot_home_button_width = (orientation=="landscape") ? o_t_g_s[11] : o_t_g_s[10];
home_button_width = (ot_test) ? ot_home_button_width : st_home_button_width;

st_hb_loc = tablet_params[12];
ot_hb_loc = o_t_g_s[12];
st_home_loc = (orientation=="landscape") ? st_hb_loc : search(st_hb_loc,[0,4,1,2,3])[0];
ot_home_loc = (orientation=="landscape") ? ot_hb_loc : search(ot_hb_loc,[0,4,1,2,3])[0];
home_loc = (ot_test) ? ot_home_loc : st_home_loc;

st_distance_from_screen_to_camera = tablet_params[13];
ot_distance_from_screen_to_camera = o_t_g_s[13];
distance_from_screen_to_camera = (ot_test) ? ot_distance_from_screen_to_camera : st_distance_from_screen_to_camera;

st_camera_height = (orientation=="landscape") ? tablet_params[14] : tablet_params[15];
ot_camera_height = (orientation=="landscape") ? o_t_g_s[14] : o_t_g_s[15];
camera_height = (ot_test) ? ot_camera_height : st_camera_height;

st_camera_width = (orientation=="landscape") ? tablet_params[15] : tablet_params[14];
ot_camera_width = (orientation=="landscape") ? o_t_g_s[15] : o_t_g_s[14];
camera_width = (ot_test) ? ot_camera_width : st_camera_width;

st_c_loc = tablet_params[16];
ot_c_loc = o_t_g_s[16];
st_cam_loc = (orientation=="landscape") ? st_c_loc : search(st_c_loc,[0,4,1,2,3])[0];
ot_cam_loc = (orientation=="landscape") ? ot_c_loc : search(ot_c_loc,[0,4,1,2,3])[0];
cam_loc = (ot_test) ? ot_cam_loc : st_cam_loc;

swap=[0,3,4,1,2];
home_button_location = (rotate_tablet_180_degrees=="no") ? home_loc : swap[home_loc];
camera_location = (rotate_tablet_180_degrees=="no") ? cam_loc : swap[cam_loc];

case_opening_corner_radius_incl_acrylic = (type_of_keyguard=="3D-Printed") ? case_opening_corner_radius : max(case_opening_corner_radius,acrylic_case_corner_radius);


// Case and Screen variables
coh = (have_a_case == "yes") ? height_of_opening_in_case : 0;
cow = (have_a_case == "yes") ? width_of_opening_in_case : 0;
cocr = case_opening_corner_radius_incl_acrylic;

c_h = case_height;
c_w = case_width;
c_cr = case_corner_radius;
ctsd = case_to_screen_depth;

vtf = keyguard_vertical_tightness_of_fit/10;
htf = keyguard_horizontal_tightness_of_fit/10;

//overall keyguard measurements - not, necessarily, the size of the keyguard opening in a keyguard frame
kw = (have_a_case == "no" && have_a_keyguard_frame=="no") ? tablet_width : 
	 (have_a_case == "yes" && have_a_keyguard_frame=="no") ? cow+htf :
															 keyguard_width+htf;
kh = (have_a_case == "no" && have_a_keyguard_frame=="no") ? tablet_height : 
	 (have_a_case == "yes" && have_a_keyguard_frame=="no") ? coh+vtf :
															 keyguard_height+vtf;
tt1cr = tablet_tl_corner_radius;
ttrcr = tablet_tr_corner_radius;
tb1cr = tablet_bl_corner_radius;
tbrcr = tablet_br_corner_radius;

r180 = rotate_tablet_180_degrees; // boolean, is camera on right and home button on left
tcr	= (r180=="no") ? [tt1cr,ttrcr,tb1cr,tbrcr] : [tbrcr,tb1cr,ttrcr,tt1cr];

cocria = case_opening_corner_radius_incl_acrylic;

kcrf = keyguard_corner_radius;  // the keyguard corner radius when in a frame 

kcr = (have_a_case == "no" && have_a_keyguard_frame=="no") ? tcr : 
	 (have_a_case == "yes" && have_a_keyguard_frame=="no") ? [cocria,cocria,cocria,cocria] :
															 [kcrf,kcrf,kcrf,kcrf];

fw = (have_a_case=="yes" && have_a_keyguard_frame=="yes") ? cow : 
      (have_a_case=="no" && have_a_keyguard_frame=="yes") ? tw :
	  0;
fh = (have_a_case=="yes" && have_a_keyguard_frame=="yes") ? coh : 
      (have_a_case=="no" && have_a_keyguard_frame=="yes") ? th :
	  0;
fcr = (have_a_case=="yes" && have_a_keyguard_frame=="yes") ? [cocria,cocria,cocria,cocria] : 
      (have_a_case=="no" && have_a_keyguard_frame=="yes") ? tcr :
	  [0,0,0,0];

st_screen_width = (orientation=="landscape") ? tablet_params[3] : tablet_params[4];
ot_screen_width = (orientation=="landscape") ? o_t_g_s[3] : o_t_g_s[4];
screen_width = (ot_test) ? ot_screen_width : st_screen_width;
swm = screen_width;

st_screen_height = (orientation=="landscape") ? tablet_params[4] : tablet_params[3];
ot_screen_height = (orientation=="landscape") ? o_t_g_s[4] : o_t_g_s[3];
screen_height = (ot_test) ? ot_screen_height : st_screen_height;
shm = screen_height;

st_ps = tablet_params[17]; //pixel settings
ot_ps = (ot_test) ? o_t_p_s : [0,0,0]; //pixel settings

ps = (type_of_tablet=="other tablet") ? ot_ps : st_ps; //pixel settings
shp = (orientation=="landscape") ? ps[0] : ps[1]; // screen height in pixels
swp = (orientation=="landscape") ? ps[1] : ps[0]; // screen width in pixels
mpp =  ps[2]; // millimeters per pixel
ppm = 1/mpp; // pixels per millimeter

lec = (have_a_keyguard_frame=="no") ? left_edge_compensation_for_tight_cases : 0;  // you won't use a frame if the case opening is tight to the screen
rec = (have_a_keyguard_frame=="no") ? right_edge_compensation_for_tight_cases : 0;
bec = (have_a_keyguard_frame=="no") ? bottom_edge_compensation_for_tight_cases : 0;
tec = (have_a_keyguard_frame=="no") ? top_edge_compensation_for_tight_cases : 0;

equal_tablet_border_left = (tablet_width-swm)/2;
equal_tablet_border_bottom = (tablet_height-shm)/2;
equal_co_border_left = (cow-swm)/2;
equal_co_border_bottom = (coh-shm)/2;

unequal_tablet_left_side_offset = left_border_width-equal_tablet_border_left;
unequal_tablet_bottom_side_offset = bottom_border_height-equal_tablet_border_bottom;

unequal_co_left_side_offset = (unequal_left_side_of_case_opening>0) ? unequal_left_side_of_case_opening-equal_co_border_left : 0;
unequal_co_bottom_side_offset = (unequal_bottom_side_of_case_opening>0) ? unequal_bottom_side_of_case_opening-equal_co_border_bottom : 0;
						
unequal_left_side_offset = (have_a_case == "no") ? unequal_tablet_left_side_offset : unequal_co_left_side_offset;
unequal_bottom_side_offset = (have_a_case == "no") ? unequal_tablet_bottom_side_offset : unequal_co_bottom_side_offset;
							
// the size of the case borders accounting for edge compensation							
adj_case_border_left = (unequal_left_side_of_case_opening>0) ? unequal_left_side_of_case_opening : equal_co_border_left;
adj_case_border_right = cow-swm-adj_case_border_left;	

adj_case_border_bottom = (unequal_bottom_side_of_case_opening>0) ? unequal_bottom_side_of_case_opening : equal_co_border_bottom;
adj_case_border_top = coh-shm-adj_case_border_bottom;	
		
msh = move_screenshot_horizontally/10;
if (msh != 0){
	slide_h = round(equal_co_border_left + msh);
	echo();
	echo(str("Set 'unequal left side of case opening' to ", slide_h, " then set 'move screen horizontally' to 0"));
	echo();
}
msv = move_screenshot_vertically/10;
if (msv != 0){
	slide_v = round(equal_co_border_bottom + msv);
	echo();
	echo(str("Set 'unequal bottom side of case opening' to ", slide_v, " then set 'move screen vertically' to 0"));
	echo();
}
							
// origin location variables
tablet_x0 = -tablet_width/2;
tablet_y0 = -tablet_height/2;

case_x0 = -cow/2;
case_y0 = -coh/2;

screen_x0 = -swm/2;
screen_y0 = -shm/2;

keyguard_x0 = (have_a_case == "no") ? tablet_x0 : -kw/2;
keyguard_y0 = (have_a_case == "no") ? tablet_y0 : -kh/2;

generate_keyguard = generate=="keyguard" || generate=="first half of keyguard" || generate=="second half of keyguard" || generate=="first layer for SVG/DXF file";


// origin location abbreviations
tx0 = tablet_x0-unequal_tablet_left_side_offset;
ty0 = tablet_y0-unequal_tablet_bottom_side_offset;

cox0 = case_x0;
coy0 = case_y0;

kx0 = keyguard_x0;
ky0 = keyguard_y0;

// kfx0 = keyguard_frame_x0;
// kfy0 = keyguard_frame_y0;

sx0 = screen_x0;
sy0 = screen_y0;


//** Variables for use in txt files and here
//tablet and case variables
	sxo = (r180=="no") ? 1 : -1; // sign of x offset
	syo = (r180=="no") ? 1 : -1; // sign of y offset
	
	xtls = (r180=="no") ? 0: tablet_width_l; // x location of the left side of the tablet adjusted for swapping camera and home button
	xtrs = (r180=="no") ? tablet_width_l: 0; // x location of the right side of the tablet adjusted for swapping camera and home button
	ytbs = (r180=="no") ? 0: tablet_height_l; // y location of the bottom side of the tablet adjusted for swapping the camera and home button
	ytts = (r180=="no") ? tablet_height_l: 0; // y location of the top side of the tablet adjusted for swapping the camera and home button
	
	xols = (r180=="no") ? 0 : cow+keyguard_horizontal_tightness_of_fit/10-ff; // x location of the left side of the case opening adjusted for swapping camera and home button
	xors = (r180=="no") ? cow+keyguard_horizontal_tightness_of_fit/10-ff : 0; // x location of the right side of the case opening adjusted for swapping camera and home button
	yobs = (r180=="no") ? 0 : coh+keyguard_vertical_tightness_of_fit/10-ff; // y location of the bottom side of the case opening adjusted for swapping the camera and home button
	yots = (r180=="no") ? coh+keyguard_vertical_tightness_of_fit/10-ff : 0; // y location of the top side of the case opening adjusted for swapping the camera and home button
	
	lcow = (cow-swm)/2; // the default width of the left side of case opening when in landscape mode
	bcoh = (coh-shm)/2; // the default height of the bottom side of case opening when in landscape mode

//screen variables
	//test whether the app measurements have been provided in pixels based on a screenshot
	// px_measurements = ((bottom_of_status_bar>0 || bottom_of_upper_message_bar>0 || bottom_of_upper_command_bar>0 || top_of_lower_message_bar>0 ||
		// top_of_lower_command_bar>0) && ((bottom_of_status_bar>=bottom_of_upper_message_bar && bottom_of_upper_message_bar>=bottom_of_upper_command_bar && bottom_of_upper_command_bar>=top_of_lower_message_bar && top_of_lower_message_bar>=top_of_lower_command_bar) || (bottom_of_status_bar<=bottom_of_upper_message_bar && bottom_of_upper_message_bar<=bottom_of_upper_command_bar && bottom_of_upper_command_bar<=top_of_lower_message_bar && top_of_lower_message_bar<=top_of_lower_command_bar))); 
	px_measurements = ((bottom_of_status_bar>0 || bottom_of_upper_message_bar>0 || bottom_of_upper_command_bar>0 || top_of_lower_message_bar>0 || top_of_lower_command_bar>0)); 
	
	//if app measurements been provided in pixels have they been taken from the top or bottom of the screenshot?
	px_measurements_start = (bottom_of_status_bar < top_of_lower_command_bar) ? "top" : "bottom";
	
	nc = number_of_columns;
	nr = number_of_rows;
	
	//the following values depend on the setting in the Freeform and hybrid Openings section
	sh = (unit_of_measure_for_screen=="px") ? shp : shm;
	sw = (unit_of_measure_for_screen=="px") ? swp : swm;
	
// app variables - used in opentings_and_additions.txt file

	sbbp = bottom_of_status_bar; //status bar bottom in pixels
	umbbp = bottom_of_upper_message_bar; //upper message bar bottom in pixels
	ucbbp = bottom_of_upper_command_bar; //upper command bar bottom in pixels
	lmbtp = top_of_lower_message_bar; //top of lower message bar in pixels
	lcbtp = top_of_lower_command_bar; //top of lower command bar in pixels
	// lmbbp = top_of_lower_command_bar; //lower message bar bottom in pixels
	// lcbbp = (px_measurements_start=="top") ?  shp : 0; //lower command bar bottom in pixels
	

	sbhp = (px_measurements_start=="top") ? sbbp : shp - sbbp; // height of status bar in pixels
	umbhp = (px_measurements_start=="top") ? umbbp - sbbp : sbbp - umbbp; // height of upper message bar in pixels
	ucbhp = (px_measurements_start=="top") ? ucbbp - umbbp : umbbp - ucbbp; // height of upper command bar in pixels
	lmbhp = (px_measurements_start=="top") ? lcbtp - lmbtp : lmbtp - lcbtp; // height of lower message bar in pixels
	lcbhp = (px_measurements_start=="top") ? shp - lcbtp : lcbtp; // height of lower command bar in pixelscel
	
	sbh = (px_measurements && unit_of_measure_for_screen=="px") ? sbhp :
	      (px_measurements && unit_of_measure_for_screen=="mm") ? sbhp * mpp : 
		  (!px_measurements && unit_of_measure_for_screen=="mm") ? status_bar_height : 
		  status_bar_height * ppm; // status bar height
	umbh = (px_measurements && unit_of_measure_for_screen=="px") ? umbhp :
	      (px_measurements && unit_of_measure_for_screen=="mm") ? umbhp * mpp : 
		  (!px_measurements && unit_of_measure_for_screen=="mm") ? upper_message_bar_height : 
		  upper_message_bar_height * ppm; //  upper message bar height
	ucbh = (px_measurements && unit_of_measure_for_screen=="px") ? ucbhp :
	      (px_measurements && unit_of_measure_for_screen=="mm") ? ucbhp * mpp : 
		  (!px_measurements && unit_of_measure_for_screen=="mm") ? upper_command_bar_height : 
		  upper_command_bar_height * ppm; // command bar height
	lmbh = (px_measurements && unit_of_measure_for_screen=="px") ? lmbhp :
	      (px_measurements && unit_of_measure_for_screen=="mm") ? lmbhp * mpp : 
		  (!px_measurements && unit_of_measure_for_screen=="mm") ? lower_message_bar_height : 
		  lower_message_bar_height * ppm; // lower message bar height
	lcbh = (px_measurements && unit_of_measure_for_screen=="px") ? lcbhp :
	      (px_measurements && unit_of_measure_for_screen=="mm") ? lcbhp * mpp : 
		  (!px_measurements && unit_of_measure_for_screen=="mm") ? lower_command_bar_height : 
		  lower_command_bar_height * ppm; // lower command bar height


	sbb = (starting_corner_for_screen_measurements=="upper-left") ? sbh : sh - (sbh); //status bar bottom
	umbb = (starting_corner_for_screen_measurements=="upper-left") ?  sbh + umbh : sh - (sbh + umbh); // upper message bar bottom
	ucbb = (starting_corner_for_screen_measurements=="upper-left") ? sbh + umbh + ucbh : sh - (sbh + umbh + ucbh); // upper command bar bottom
	lmbt = (starting_corner_for_screen_measurements=="upper-left") ? sh - lcbh - lmbh : lcbh + lmbh; // lower message bar top
	lmbb = (starting_corner_for_screen_measurements=="upper-left") ? sh - lcbh : lcbh; // lower message bar bottom
	lcbb = (starting_corner_for_screen_measurements=="upper-left") ? sh : 0; // lower command bar bottom

	hloc = home_loc;  // home button location: 1,2,3,4 (adjusted for orientation)
	hbd = distance_from_screen_to_home_button;
	hbh = home_button_height;
	hbw = home_button_width;
	cloc = cam_loc;  // camera location: 1,2,3,4 (adjusted for orientation)
	cmd = distance_from_screen_to_camera;
	cmh = camera_height;
	cmw = camera_width;
	
// variables for laying out the bars and the grid - all in millimeters
sbhm = (px_measurements) ? sbhp * mpp : status_bar_height; // status bar height
umbhm = (px_measurements) ? umbhp * mpp : upper_message_bar_height; // upper message bar height
ucbhm = (px_measurements) ? ucbhp * mpp : upper_command_bar_height; // upper command bar height
lmbhm = (px_measurements) ? lmbhp * mpp : lower_message_bar_height; /// lower message bar height
lcbhm = (px_measurements) ? lcbhp * mpp : lower_command_bar_height; /// lower command bar height

// if keyguard will go in a case, determine if edge compensation will affect bar width and by how much
adj_lec = (have_a_case=="yes") ? max(lec-adj_case_border_left,0) : 0;  // positive if lec is larger than the left border
adj_rec = (have_a_case=="yes") ? max(rec-adj_case_border_right,0) : 0;  // positive if rec is larger than the right border

bar_width = swm - adj_lec - adj_rec;

// if keyguard will go in a case, determine if edge compensation will affect bar height and by how much
adj_tec =(have_a_case=="yes") ?  max(tec-adj_case_border_top,0) : 0;  // positive if tec is larger than the top border
adj_bec = (have_a_case=="yes") ? max(bec-adj_case_border_bottom,0) : 0;  // positive if tec is larger than the bottom border

sbh_adjust = (adj_tec>0) ? sbhm - adj_tec : sbhm;
umbh_adjust = (adj_tec>sbhm) ? umbhm-(adj_tec-sbhm)  : umbhm;
ucbh_adjust = (adj_tec>sbhm+umbhm) ? ucbhm - (adj_tec - sbhm - umbhm) : ucbhm;
lmbh_adjust = (adj_bec>lcbhm) ? lmbhm - (adj_bec - lcbhm) : lmbhm;
lcbh_adjust = (adj_bec>0) ? lcbhm - adj_bec : lcbhm;

bcr = bar_corner_radius;

//Grid variables in millimeters
grid_width = swm - left_padding - right_padding;
grid_height = shm - sbhm - umbhm - ucbhm - top_padding - bottom_padding - lmbhm - lcbhm;

grid_x0 = screen_x0 + left_padding;
grid_y0 = screen_y0 + bottom_padding + lmbhm + lcbhm;

	gw = (unit_of_measure_for_screen=="mm") ? grid_width : grid_width * ppm;
	gh = (unit_of_measure_for_screen=="mm") ? grid_height : grid_height * ppm;
	gt = ucbb;  // grid top
	gb = lmbt;  // grid bottom
	
	gwm = grid_width;  // grid width in millimeters
	ghm = grid_height;  // grid height in millimeters
	
	tp = (px_measurements) ? top_padding * ppm : top_padding; // top padding for txt files
	bp = (px_measurements) ? bottom_padding * ppm : bottom_padding; // bottom padding for txt files
	lp = (px_measurements) ? left_padding * ppm : left_padding; // left padding for txt files
	rp = (px_measurements) ? right_padding * ppm : right_padding; // right padding for txt files
		
chamfer_angle_stop = 45;

//next instruction doesn't allow for acrylic sheets that are other than 3.15 mm thick - but only impacts display of keyguard since laser cutting uses
//   only the first layer for SVG/DXF file export
kt = (type_of_keyguard=="Laser-Cut") ? 3.175: 
     (have_a_keyguard_frame=="yes" && keyguard_thickness > keyguard_frame_thickness) ? keyguard_frame_thickness :
	 keyguard_thickness;
	 
//misc variables
kec = (keyguard_thickness > keyguard_edge_chamfer) ? keyguard_edge_chamfer : keyguard_thickness -.1;
chamfer_slices = keyguard_edge_chamfer/.2;
chamfer_slice_size = .2;

$fn=smoothness_of_circles_and_arcs;


//handle the instance where a system like an Accent
system_with_no_case = ((tablet_width==0) || (tablet_height == 0)) && (have_a_case=="no");

//cell variables
column_count = (system_with_no_case || hide_screen_region == "yes") ? 0 : number_of_columns;
row_count = (system_with_no_case || hide_screen_region == "yes") ? 0 : number_of_rows;

max_cell_width = grid_width/column_count;
max_cell_height = grid_height/row_count;
minimum__acrylic_rail_width = (use_Laser_Cutting_best_practices=="no") ?  1 : 2;

cell_w = (cell_width_in_mm==0) ? cell_width_in_px*mpp : cell_width_in_mm;
cell_h = (cell_height_in_mm==0) ? cell_height_in_px*mpp : cell_height_in_mm;
cw = (cell_w*number_of_columns>gwm) ? floor(gwm/number_of_columns)-1 : cell_w;
ch = (cell_h*number_of_rows>ghm) ? floor(ghm/number_of_rows)-1 : cell_h;

if((cw!=cell_w) || (ch!=cell_h) && (column_count!=0 && row_count!=0)){
	echo();
	if(ch!=cell_h) echo(str("The cell height has been adjusted to ", ch, " mm (or ", round(ch*ppm), " px) in order to fit properly."));
	if(cw!=cell_w) echo(str("The cell width has been adjusted to ", cw, " mm (or ", round(cw*ppm), " px) in order to fit properly."));
	echo();
}

vrw = grid_width/number_of_columns - cw;
hrw = grid_height/number_of_rows - ch;

// // this module should go away after "n" releases or "m" months when people have had a chance to move beyond 66- versions
// echo_upgrade_recommendations(cw,ch,cell_edge_slope,screen_area_thickness);

	ccr = cell_corner_radius;
	
	hor = (unit_of_measure_for_screen=="px") ? height_of_ridge * ppm : height_of_ridge;
	tor = (unit_of_measure_for_screen=="px") ? thickness_of_ridge * ppm : thickness_of_ridge;

min_actual_cell_dim = min(cw,ch);
acrylic_cell_corner_radius = max(min_actual_cell_dim/10,cell_corner_radius);
first_ocr = (type_of_keyguard=="Laser-Cut" && use_Laser_Cutting_best_practices=="yes") ? acrylic_cell_corner_radius : cell_corner_radius;
ocr = min(first_ocr, min_actual_cell_dim/2);

sata = sat_incl_acrylic;
sat = min(kt,sata); // thiness of the grid and bar region of the keyguard which can't exceed the overall keyguard Thickness

horizontal_slide_in_tab_length_incl_acrylic = (type_of_keyguard=="3D-Printed") ? horizontal_slide_in_tab_length : horizontal_acrylic_slide_in_tab_length;
vertical_slide_in_tab_length_incl_acrylic = (type_of_keyguard=="3D-Printed") ? vertical_slide_in_tab_length : vertical_acrylic_slide_in_tab_length;
slide_in_tab_thickness = (type_of_keyguard=="3D-Printed") ? min(kt-0.65, preferred_slide_in_tab_thickness) : acrylic_slide_in_tab_thickness;

col_first_trim = (lec>left_padding+vrw/2+adj_case_border_left && have_a_case=="yes") ? lec-left_padding-vrw/2-adj_case_border_left : 0;
col_last_trim = (rec>right_padding+vrw/2+adj_case_border_right && have_a_case=="yes") ? rec-right_padding-vrw/2-adj_case_border_right: 0;
row_first_trim = (bec>bottom_padding+lmbhm+lcbhm+hrw/2+adj_case_border_bottom && have_a_case=="yes") ? bec - bottom_padding - lmbhm - lcbhm - hrw/2 -adj_case_border_bottom: 0;
row_last_trim = (tec>top_padding+sbhm+umbhm+ucbhm+hrw/2+adj_case_border_top && have_a_case=="yes") ? tec-top_padding-sbhm-umbhm-ucbhm-hrw/2-adj_case_border_top : 0;


cts = (type_of_keyguard=="Laser-Cut") ? 90 :
		(type_of_keyguard=="3D-Printed" && cell_top_edge_slope == 90) ? cell_edge_slope : cell_top_edge_slope;  
cbs = (type_of_keyguard=="Laser-Cut") ? 90 :
		(type_of_keyguard=="3D-Printed" && cell_bottom_edge_slope == 90) ? cell_edge_slope : cell_bottom_edge_slope;  
		
cell_top_offset = screen_area_thickness*cos(cell_edge_slope); //this is actually the maximum value since edge compensation can override
		
cec = cell_edge_chamfer;


//home button and camera location variables
home_x_loc = (home_button_location==1) ? screen_x0+swm/2 
	: (home_button_location==2) ? screen_x0+swm+distance_from_screen_to_home_button 
	: (home_button_location==3) ? screen_x0+swm/2 
	: screen_x0-distance_from_screen_to_home_button;

home_y_loc = (home_button_location==1) ? screen_y0+shm+distance_from_screen_to_home_button 
	: (home_button_location==2) ? screen_y0+shm/2
	: (home_button_location==3) ? screen_y0-distance_from_screen_to_home_button 
	: screen_y0+shm/2 ;
	
cam_x_loc = (camera_location==1) ? screen_x0+swm/2 
	: (camera_location==2) ? screen_x0+swm+distance_from_screen_to_camera 
	: (camera_location==3) ? screen_x0+swm/2 
	: screen_x0-distance_from_screen_to_camera ;
	
cam_y_loc = (camera_location==1) ? screen_y0+shm+distance_from_screen_to_camera 
	: (camera_location==2) ? screen_y0+shm/2 
	: (camera_location==3) ? screen_y0-distance_from_screen_to_camera 
	: screen_y0+shm/2;

//velcro variables
velcro_diameter = 
    (velcro_size==1)? 10
  : (velcro_size==2)? 16
  : (velcro_size==3)? 20
  : (velcro_size==4)? 10
  : (velcro_size==5)? 16
  : 20;
  
strap_cut_to_depth = 9.25 - 3.1 - 3.5; // length of bolt - thickness of acrylic mount - height of nut

//sloped keyguard edge variables
sew = sloped_edge_width;


// general case mount veriables
ulos = unequal_left_side_offset;
ulbs = unequal_bottom_side_offset;


//clip-on strap variables
horizontal_pedestal_width = horizontal_clip_width + 10;
vertical_pedestal_width = vertical_clip_width + 10;

horizontal_slot_width = horizontal_clip_width+2;
vertical_slot_width = vertical_clip_width+2;

pedestal_height = (have_a_case=="no")? 0 : 
				  (have_a_keyguard_frame=="no") ? max(case_to_screen_depth - kt,0) :
				  max(case_to_screen_depth - keyguard_frame_thickness,0);
vertical_offset = (have_a_keyguard_frame=="no") ? kt/2 + pedestal_height-3+ff : // bottom of cut for clip-on strap
												  keyguard_frame_thickness/2 + pedestal_height-3+ff;
h_clip_reach = (have_a_case=="no")? 6 :
			 (add_sloped_keyguard_edge=="no")? (case_width-kw)/2+5 :
			 (extend_lip_to_edge_of_case=="no")? (case_width-cow)/2-sew+6 :
			 7;
v_clip_reach = (have_a_case=="no")? 6 :
			 (add_sloped_keyguard_edge=="no")? (case_height-kh)/2+5 :
			 (extend_lip_to_edge_of_case=="no")? (case_height-coh)/2-sew+6 :
			 7;
no_clips = (add_sloped_keyguard_edge=="yes" && keyguard_thickness<case_to_screen_depth); //the keyguard has to reach to the top of the case edge if using sloped edges

// slide-in tab variables

// raised-tab variables

//shelf variables
shelf_t = (have_a_keyguard_frame=="no") ? min(shelf_thickness,keyguard_thickness) : min(shelf_thickness,keyguard_frame_thickness);
scr = shelf_corner_radius;


// bar variables

// keyguard frame variables
groove_size = 1.2;
groove_width = 30;
snap_in_size = .8;
snap_in_width = 25;
post_len = post_extension_distance;

//Braille and cell insert variables
bsm = Braille_size_multiplier/10; //Braille size multiplier
braille_a = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
braille_d = [0,32,40,48,52,36,56,60,44,24,28,34,42,50,54,38,58,62,46,26,30,35,43,29,51,55,39,32,40,48,52,36,56,60,44,24,28,34,42,50,54,38,58,62,46,26,30,35,43,29,51,55,39];
insert_thickness = sat-insert_recess;
e_t = engraved_text;

// // // //Blissymbol parameter from customizer
// // // //concept must match STL filename (without the .stl)
// // // Bliss_concept = "";

// // // //Blissymbol variables
// // // apos2 = search("'", Bliss_concept)[0];
// // // bycw = apos2 == undef ? Bliss_concept :
	 // // // apos2 > 0 ?
		// // // strcat(concat(substr(Bliss_concept,0,apos2),substr(Bliss_concept,apos2 + 1))):
		// // // "";
// // // path = (Bliss_concept !="") ? "Bliss concepts/" : "";
// // // filename = (Bliss_concept !="") ? bycw : "";
// // // path_and_filename = (path != "" && filename != "") ? str(path,filename,".stl") : "";

///**** these next two lines should be derivable or replaced by values above
case_thick = (have_a_case=="no")? tablet_thickness+kt : case_thickness+max(kt-case_to_screen_depth,0);

//currently only openings for ambient light sensors - may need to become specific to ALS if other types of openings are added - especially if they don't map to tablet models in the same way that ALS openings do
als_openings=[  
	/* iPad 1st generation */
	[[  "1ALS1", xtls+sxo*10.4,   ytbs+syo*94.9,   0,      2.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad 2nd, 3rd, & 4th generation */
	[[  "23ALS1", xtls+sxo*6.7,   ytbs+syo*92.9,   0,      2.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad 5th & 6th generation */
	[[ "56ALS1", xtls+sxo*11.07, ytbs+syo*80.34,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad 7th & 8th generation */
	[[ "78ALS1", xtls+sxo*11.03, ytbs+syo*82.64,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad 9th generation */
	// the first entry copied for consistency with ready-made-designs
	[[ "78ALS1", xtls+sxo*11.03, ytbs+syo*82.64,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "9ALS1", xtls+sxo*11.03, ytbs+syo*21.83,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "9ALS2", xtls+sxo*11.03, ytts-syo*21.53,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad 10th & 11th generation */
	[[ "10ALS1", xtls+sxo*35.02,      ytts-syo*4.53,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "10ALS2", xtls+sxo*(tw-111.15), ytts-syo*5.24,   0,    3.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 9.7-inch */
	[[ "9.7ALS1", xtls+sxo*13.55,   ytbs+syo*18.86,   0,     3.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "9.7ALS2", xtls+sxo*13.55,   ytts-syo*18.86,   0,     3.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 10.5-inch */
	[[ "10.5ALS1", xtls+sxo*9.62,   ytbs+syo*18.72,   0,     2.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "10.5ALS2", xtls+sxo*9.62,   ytts-syo*18.72,   0,     2.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 11, 1st & 2nd generation  & Via Pro*/
	[[ "11-12ALS1", xtls+sxo*4.37,   ytbs+syo*30.73,   0,      3.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "11-12ALS2", xtls+sxo*4.37,   ytts-syo*30.73,   0,      3.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 11, 3rd & 4th generation */
	[[ "11-34ALS1", xtls+sxo*3.60,   ytbs+syo*43.49,   0,      4.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "11-34ALS2", xtls+sxo*3.60,   ytts-syo*43.49,   0,      4.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 12.9, 1st generation */
	[[ "12.9-1ALS1", xtls+sxo*13.41,   ytbs+syo*18.48,   0,    2.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "12.9-1ALS2", xtls+sxo*13.41,   ytts-syo*18.48,   0,    2.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 12.9, 2nd generation */
	[[ "12.9-2ALS1", xtls+sxo*11.07,   ytbs+syo*22.38,   0,    2.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "12.9-2ALS2", xtls+sxo*11.07,   ytts-syo*22.38,   0,    2.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 12.9, 3rd generation */
	[[ "12.9-3ALS1", xtls+sxo*4.37,   ytbs+syo*30.73,   0,    3.8,   "c",        60,           60,         60,          60,            0,         ],
	[ "12.9-3ALS2", xtls+sxo*4.37,   ytts-syo*30.73,   0,    3.8,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 12.9, 4th generation */
	[[ "12.9-4ALS1", xtls+sxo*3.5,   ytbs+syo*30.72,   0,    3.8,   "c",        60,           60,         60,          60,            0,         ],
	[ "12.9-4ALS2", xtls+sxo*3.5,   ytts-syo*30.72,   0,    3.8,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 12.9, 5th & 6th generation */
	[[ "12.9-56ALS1", xtls+sxo*4.13,  ytbs+syo*43.49,   0,    3.8,   "c",        60,           60,         60,          60,            0,         ],
	[ "12.9-56ALS2", xtls+sxo*4.13,  ytts-syo*43.49,   0,    3.8,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Mini */
	[[ "MiniALS1", xtls+sxo*10.7,   ytts-syo*71.8,   0,      2.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Mini, 2nd & 3rd generation */
	[[ "Mini-23ALS1", xtls+sxo*10.7,   ytts-syo*71.7,   0,      2.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Mini, 4th generation */
	[[ "Mini-4ALS1", xtls+sxo*5.14,   ytbs+syo*16.46,   0,      4.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "Mini-4ALS2", xtls+sxo*5.14,   ytts-syo*16.46,   0,      4.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Mini, 5th generation */
	[[ "Mini-5ALS1", xtls+sxo*13.57,   ytbs+syo*18.60,   0,      4.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "Mini-5ALS2", xtls+sxo*13.57,   ytts-syo*18.60,   0,      4.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Mini, 6th, 7th A17 generation & Via Mini*/
	[[ "Mini-67ALS1", xtls+sxo*4.38,   ytts-syo*23.99,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "Mini-67ALS2", xtls+sxo*16.61,   ytts-syo*3.34,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "Mini-67ALS3", xtrs-sxo*40.24,   ytts-syo*3.34,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Air */
	[[ "AirALS1", xtls+sxo*11.1,   ytts-syo*89.1,   0,      2.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Air, 2nd generation */
	[[ "Air-2ALS1", xtls+sxo*5.14,   ytbs+syo*16.44,   0,      2.5,   "c",        60,           60,         60,          60,            0,         ],
	[ "Air-2ALS2", xtls+sxo*5.14,   ytts-syo*16.44,   0,      2.5,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Air, 3rd generation */
	[[ "Air-3ALS1", xtls+sxo*9.62,   ytbs+syo*18.72,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[ "Air-3ALS2", xtls+sxo*9.62,   ytts-syo*18.72,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Air, 4th & 5th generation */
	[[ "Air-45ALS1", xtls+sxo*4.62,   ytbs+syo*22.13,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Air-45ALS2", xtls+sxo*4.62,   ytbs+syo*51.40,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Air-45ALS3", xtls+sxo*4.62,   ytts-syo*26.47,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 11-inch M4 */
	[[ "Pro-11M4ALS1", xtls+sxo*4.71,   ytbs+syo*88.76,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Pro-11M4ALS2", xtls+sxo*124.85,  ytts-syo*4.71,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Pro 13-inch M4 */
	[[ "Pro-13M4ALS1",   xtls+sxo*4.71,  ytbs+syo*107.76,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Pro-13M4ALS2", xtls+sxo*140.79,    ytts-syo*4.71,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Air 11-inch M2 & M3 */
	[[ "Air-11M23ALS1",   xtls+sxo*4.62,   ytbs+syo*22.13,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Air-11M23ALS2",   xtls+sxo*4.62,   ytbs+syo*51.40,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Air-11M23ALS3", xtls+sxo*138.92,    ytts-syo*4.49,   0,      3.7,   "c",        60,           60,         60,          60,            0,         ]],

	/* iPad Air 13-inch M2 & M3 */
	[[ "Air-13M23ALS1", xtls+tw/2-sxo*94.66,   ytts-syo*4.22,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ],
	[  "Air-13M23ALS2", xtls+tw/2+sxo*15.56,   ytts-syo*4.22,   0,      3.0,   "c",        60,           60,         60,          60,            0,         ]],
	
	/* Tobii I-16 */
	[[ "Tobii-I16ALS1",     xtls+sxo*63,     ytts-syo*10.75,    0,      5.0,   "c",        50,           50,         50,          50,            0,       ],
	[  "Tobii-I16ALS1",     xtls+sxo*81,     ytts-syo*10.75,    0,      3.0,   "c",        50,           50,         50,          50,            0,       ],
	[  "Tobii-I16ALS1",     xtls+sxo*91,     ytts-syo*10.75,    0,      3.0,   "c",        50,           50,         50,          50,            0,       ]],
];

//this tablet's abient light sensor openings
ttao = 
    (type_of_tablet=="iPad")? als_openings[0]
  : (type_of_tablet=="iPad2")? als_openings[1]
  : (type_of_tablet=="iPad 3rd generation")? als_openings[1]
  : (type_of_tablet=="iPad 4th generation")? als_openings[1]
  : (type_of_tablet=="iPad 5th generation")? als_openings[2]  
  : (type_of_tablet=="iPad 6th generation")? als_openings[2]  
  : (type_of_tablet=="iPad 7th generation")? als_openings[3]
  : (type_of_tablet=="iPad 8th generation")? als_openings[3]
  : (type_of_tablet=="iPad 9th generation")? als_openings[4]
  : (type_of_tablet=="iPad 10th generation")? als_openings[5]
  : (type_of_tablet=="iPad 11th generation A16")? als_openings[5]
  : (type_of_tablet=="iPad Pro 9.7-inch")? als_openings[6]
  : (type_of_tablet=="iPad Pro 10.5-inch")? als_openings[7]
  : (type_of_tablet=="iPad Pro 11-inch 1st Generation")? als_openings[8]
  : (type_of_tablet=="iPad Pro 11-inch 2nd Generation")? als_openings[8]
  : (type_of_tablet=="iPad Pro 11-inch 3rd Generation")? als_openings[9]
  : (type_of_tablet=="iPad Pro 11-inch 4th Generation")? als_openings[9]
  : (type_of_tablet=="iPad Pro 12.9-inch 1st Generation")? als_openings[10]
  : (type_of_tablet=="iPad Pro 12.9-inch 2nd Generation")? als_openings[11]
  : (type_of_tablet=="iPad Pro 12.9-inch 3rd Generation")? als_openings[12]
  : (type_of_tablet=="iPad Pro 12.9-inch 4th Generation")? als_openings[13]
  : (type_of_tablet=="iPad Pro 12.9-inch 5th Generation")? als_openings[14]
  : (type_of_tablet=="iPad Pro 12.9-inch 6th Generation")? als_openings[14]
  : (type_of_tablet=="iPad mini")? als_openings[15]
  : (type_of_tablet=="iPad mini 2")? als_openings[16]
  : (type_of_tablet=="iPad mini 3")? als_openings[16]
  : (type_of_tablet=="iPad mini 4")? als_openings[17]
  : (type_of_tablet=="iPad mini 5")? als_openings[18]
  : (type_of_tablet=="iPad mini 6")? als_openings[19]  
  : (type_of_tablet=="iPad mini 7 A17 Pro")? als_openings[19] 
  : (type_of_tablet=="iPad Air")? als_openings[20]
  : (type_of_tablet=="iPad Air 2")? als_openings[21]
  : (type_of_tablet=="iPad Air 3")? als_openings[22]
  : (type_of_tablet=="iPad Air 4")? als_openings[23]
  : (type_of_tablet=="iPad Air 5")? als_openings[23] 
  : (type_of_tablet=="iPad Pro 11-inch M4")? als_openings[24] 
  : (type_of_tablet=="iPad Pro 13-inch M4")? als_openings[25] 
  : (type_of_tablet=="iPad Air 11-inch M2")? als_openings[26] 
  : (type_of_tablet=="iPad Air 13-inch M2")? als_openings[27] 
  : (type_of_tablet=="iPad Air 11-inch M3")? als_openings[26] 
  : (type_of_tablet=="iPad Air 13-inch M3")? als_openings[27] 
  : (type_of_tablet=="Via Mini")? als_openings[19]  
  : (type_of_tablet=="Via Pro")? als_openings[8]
  : (type_of_tablet=="TobiiDynavox I-16")? als_openings[28] 
  : []; // all other tablets
  
// All variables that can be used in the openings an additions file called out here for Maker World customizer
// Put this *above* where you parse user input.
// Add every variable name you want resolvable.
RESOLVE_NAMES  = ["bcoh","bp","ccr","ch","cloc","cmd","cmh","cmw","cocr","coh","cow","cw","gb","gh","gt","gw","hbd","hbh","hbw","hloc","hor","hrw","kcr","kh","kw","lcbb","lcbh","lcow","lmbb","lmbh","lmbt","lp","mpp","nc","nr","ppm","r180","rp","sbb","sbh","sh","shp","sw","swm","swp","sxo","syo","tcr","th","tor","tp","tw","ucbb","ucbh","umbb","umbh","vrw","xols","xors","yobs","yots"];
RESOLVE_VALUES = [bcoh,bp,ccr,ch,cloc,cmd,cmh,cmw,cocr,coh,cow,cw,gb,gh,gt,gw,hbd,hbh,hbw,hloc,hor,hrw,kcr,kh,kw,lcbb,lcbh,lcow,lmbb,lmbh,lmbt,lp,mpp,nc,nr,ppm,r180,rp,sbb,sbh,sh,shp,sw,swm,swp,sxo,syo,tcr,th,tor,tp,tw,ucbb,ucbh,umbb,umbh,vrw,xols,xors,yobs,yots]; 

m_s_o = parse_user_vector(my_screen_openings, /*strict=*/true);
m_c_o = parse_user_vector(my_case_openings, /*strict=*/true);
m_c_a = parse_user_vector(my_case_additions, /*strict=*/true);
m_t_o = parse_user_vector(my_tablet_openings, /*strict=*/true);


//**********************************************************************

	include <openings_and_additions.txt>
	
//**********************************************************************


// ----------------------Main-----------------------------
$vpd = (keyguard_display_angle>0 && orientation=="landscape") ? 500 : 
	   (keyguard_display_angle>0 && orientation=="portrait") ? 620 :
	   $vpd;
$vpt = (keyguard_display_angle>0) ? [1,1,1] : 
	   $vpt;
$vpr = (show_back_of_keyguard=="no" && keyguard_display_angle > 0) ? [90-keyguard_display_angle,0,0] :
       (show_back_of_keyguard=="yes") ? [0,180,0] : 
	   $vpr;
	   
if (system_with_no_case){
	echo();
	echo();
	text_string1 = str("The ",type_of_tablet," system requires case-opening measurements.");
	text_string2 = "Set 'have a case' to 'yes' in the Tablet Case section,";
	text_string3 = "and provide measurements for the case-opening.";
	echo("**************************************************************************************************");
	echo(text_string1);
	echo(text_string2);
	echo(text_string3);
	echo("**************************************************************************************************");
	echo();
	echo();
}
else if (type_of_tablet=="other tablet" && (len(o_t_g_s)!=21 || len(o_t_p_s)!=3)){
	echo();
	echo();
	echo("**************************************************************************************************");
	echo("The 'other tablet' option requires:");
	if (len(o_t_g_s)!=21) echo("21 entries in the 'other tablet general sizes' input box");
	if (len(o_t_p_s)!=3) echo("3 entries in the 'other tablet pixel sizes' input box");
	echo("**************************************************************************************************");
	echo();
	echo();
}
else if (add_sloped_keyguard_edge=="yes" && type_of_keyguard=="Laser-Cut"){
	echo();
	echo();
	echo("************ Laser-cut keyguards cannot have a sloped edge ************");
	echo();
	echo();
}
else if (type_of_keyguard=="3D-Printed" && (generate=="keyguard" || generate=="first half of keyguard" || generate=="second half of keyguard")){
	color("Turquoise")
	keyguard("no");
	
	if (include_screenshot=="yes"){
		if (MW_version){
			show_screenshotMW(kt);
		}
		else{
			show_screenshot(kt);
		}
	}
	
	if (show_split_line=="yes"){
		show_line_split_location();
	}
}
else if (type_of_keyguard=="Laser-Cut" && generate=="keyguard" && have_a_keyguard_frame=="no" && (m_m=="No Mount" || m_m=="Slide-in Tabs")){
	color("Khaki")
	keyguard("no");
	issues();

	if (include_screenshot=="yes"){
		if (MW_version){
			show_screenshotMW(3.175);
		}
		else{
			show_screenshot(3.175);
		}
	}
}
else if (type_of_keyguard=="Laser-Cut" && generate=="first layer for SVG/DXF file" && have_a_keyguard_frame=="no" && (mounting_method=="No Mount" || mounting_method=="Slide-in Tabs")){
	color("DarkSeaGreen")
	render()
	lc_keyguard();
	issues();
	key_settings();

	if (include_screenshot=="yes"){
		if (MW_version){
			show_screenshotMW(3.175);
		}
		else{
			show_screenshot(3.175);
		}
	}
}
else if (generate=="horizontal clip"){
	color("lime")
	if (unequal_left_side_of_case == 0){
		create_clip(h_clip_reach,horizontal_clip_width);
	}
	else{  //if unequal_left_side_of_case>0 then assume that there is a case
		clip_reach_left = unequal_left_side_of_case + 5;

		clip_reach_right = case_width-kw-unequal_left_side_of_case+5;

		//left side clip
		translate([-35,0,horizontal_clip_width])
		rotate([0,180,0])
		translate([0,case_thickness/2+10,0])
		create_clip(clip_reach_left,horizontal_clip_width);
		
		//right side clip
		translate([0,-case_thickness/2-10,0])
		create_clip(clip_reach_right,horizontal_clip_width);
	}
}
else if (generate=="vertical clip"){
	color("lime")
	if (unequal_bottom_side_of_case == 0){
		create_clip(v_clip_reach,vertical_clip_width);
	}
	else{  //if unequal_bottom_side_of_case>0 then assume that there is a case
		clip_reach_bottom = unequal_bottom_side_of_case + 5;

		clip_reach_top = case_height-kh-unequal_bottom_side_of_case+5;

		//top side clip
		translate([-35,0,vertical_clip_width])
		rotate([0,180,0])
		translate([0,case_thickness/2+10,0])
		create_clip(clip_reach_bottom,vertical_clip_width);
		
		//bottom side clip
		translate([0,-case_thickness/2-10,0])
		create_clip(clip_reach_top,vertical_clip_width);
	}
}
else if (generate=="horizontal mini clip"){
	color("lime")
	if (unequal_left_side_of_case == 0){
		create_mini_clip1(h_clip_reach,horizontal_clip_width);
	}
	else{  //if unequal_left_side_of_case>0 then assume that there is a case
		clip_reach_left = unequal_left_side_of_case + 5;

		clip_reach_right = case_width-kw-unequal_left_side_of_case+5;

		//left side clip
		translate([-35,0,horizontal_clip_width])
		rotate([0,180,0])
		translate([0,case_thickness/2+10,0])
		create_mini_clip1(clip_reach_left,horizontal_clip_width);
		
		//right side clip
		translate([0,-case_thickness/2-10,0])
		create_mini_clip1(clip_reach_right,horizontal_clip_width);
	}
}
else if (generate=="vertical mini clip"){
	color("lime")
	if (unequal_bottom_side_of_case == 0){
		create_mini_clip1(v_clip_reach,vertical_clip_width);
	}
	else{  //if unequal_bottom_side_of_case>0 then assume that there is a case
		clip_reach_bottom = unequal_bottom_side_of_case + 5;

		clip_reach_top = case_height-kh-unequal_bottom_side_of_case+5;

		//left side clip
		translate([-35,0,vertical_clip_width,vertical_clip_width])
		rotate([0,180,0])
		translate([0,case_thickness/2+10,0])
		create_mini_clip1(clip_reach_bottom,vertical_clip_width);
		
		//right side clip
		translate([0,-case_thickness/2-10,0])
		create_mini_clip1(clip_reach_top,vertical_clip_width);
	}
}
else if (generate=="horizontal micro clip"){
	color("lime")
	if (unequal_left_side_of_case == 0){
		create_mini_clip2(h_clip_reach,horizontal_clip_width);
	}
	else{  //if unequal_left_side_of_case>0 then assume that there is a case
		clip_reach_left = unequal_left_side_of_case + 5;

		clip_reach_right = case_width-kw-unequal_left_side_of_case+5;

		//left side clip
		translate([-35,0,horizontal_clip_width])
		rotate([0,180,0])
		translate([0,case_thickness/2+10,0])
		create_mini_clip2(clip_reach_left,horizontal_clip_width);
		
		//right side clip
		translate([0,-case_thickness/2-10,0])
		create_mini_clip2(clip_reach_right,horizontal_clip_width);
	}
}
else if (generate=="vertical micro clip"){
	color("lime")
	if (unequal_bottom_side_of_case == 0){
		create_mini_clip2(v_clip_reach,vertical_clip_width);
	}
	else{  //if unequal_bottom_side_of_case>0 then assume that there is a case
		clip_reach_bottom = unequal_bottom_side_of_case + 5;

		clip_reach_top = case_height-kh-unequal_bottom_side_of_case+5;

		//left side clip
		translate([-35,0,vertical_clip_width,vertical_clip_width])
		rotate([0,180,0])
		translate([0,case_thickness/2+10,0])
		create_mini_clip2(clip_reach_bottom,vertical_clip_width);
		
		//right side clip
		translate([0,-case_thickness/2-10,0])
		create_mini_clip2(clip_reach_top,vertical_clip_width);
	}
}
else if (generate=="keyguard frame" && have_a_keyguard_frame=="yes" && type_of_keyguard!="Laser-Cut"){
	color("Turquoise")
	keyguard_frame("no");
	
	if (show_keyguard_with_frame == "yes"){
		color("red")
		translate([0,0,-(keyguard_frame_thickness/2-kt/2)])
		keyguard("yes");
	}
	
	if (include_screenshot=="yes"){
		if (MW_version){
			show_screenshotMW(keyguard_frame_thickness);
		}
		else{
			show_screenshot(keyguard_frame_thickness);
		}
	}
}
else if (generate=="keyguard frame" && have_a_keyguard_frame=="no"){
	echo();
	echo();
	echo("************ 'have a keyguard frame' is set to 'no' ************");
	echo();
	echo();
}
else if (generate=="first half of keyguard frame" && type_of_keyguard!="Laser-Cut"){
	color("Turquoise")
	{
		difference(){
			keyguard_frame("no");
			split_keyguard_frame("first");
		}	
	}
}
else if (generate=="second half of keyguard frame" && type_of_keyguard!="Laser-Cut"){
	color("Turquoise")
	{
		difference(){
			keyguard_frame("no");
			split_keyguard_frame("second");
		}
	}
}
else if ((generate=="first half of keyguard" || generate=="second half of keyguard") && type_of_keyguard=="Laser-Cut"){
	echo();
	echo();
	echo("************ Laser-cut keyguards cannot be split ************");
	echo();
	echo();
}
else if ((generate=="keyguard frame" || generate=="first half of keyguard frame" || generate=="second half of keyguard frame") && type_of_keyguard=="Laser-Cut"){
	echo();
	echo();
	echo("************ Laser-cut keyguard frames are not supported ************");
	echo();
	echo();
}
else if (generate=="keyguard" && type_of_keyguard=="Laser-Cut" && have_a_keyguard_frame=="yes"){
	echo();
	echo();
	echo("************ Laser-cut keyguards, going in a keyguard frame, are not supported ************");
	echo();
	echo();
}
else if (type_of_keyguard=="3D-Printed" && generate=="first layer for SVG/DXF file"){
	echo();
	echo();
	echo("************ First layer for SVG/DXF filee is not supported for a 3D-Printed keyguard ************");
	echo();
	echo();
}
else if (generate=="cell insert" && type_of_keyguard!="Laser-Cut"){ //cell inserts
	rotation = (Braille_text=="") ? -90 : 0;
	color("LawnGreen")
	rotate([rotation,0,0])
	create_cell_insert();
}
else { //Customizer settings
	echo_settings();
}

  

// ---------------------Modules----------------------------

module keyguard(cheat){
	unequal_opening = (have_a_keyguard_frame=="no") ? [-unequal_left_side_offset,-unequal_bottom_side_offset,0] : [0,0,0];
	difference(){
		union(){
			difference(){
				union(){
					difference(){
						//slide case opening plastic based on unequal case opening settings
						translate(unequal_opening)
						//base keyguard with  manual  and customizer mounting points and some added plastic in case region, no grid
						difference(){
							union(){
								//base object: tablet body slab or case opening along with case additions if any that can be chamfered
								base_keyguard(kw,kh,kcr,kt,cheat);
													
								//add slide-in & raised tabs
								if (have_a_case=="yes" && have_a_keyguard_frame=="no" && (m_m=="Slide-in Tabs" || m_m=="Raised Tabs")){
									case_mounts(kt);
								}
								
								//add shelf as a mounting method
								if (have_a_case=="yes" && have_a_keyguard_frame=="no" && m_m=="Shelf" && cheat=="no") {
									shelf_height = coh+2*shelf_depth;
									shelf_width = cow+2*shelf_depth;
					
									translate([0 ,0,-kt/2])
									linear_extrude(height=shelf_t)
									build_addition(shelf_width, shelf_height, "crr", scr);
								}
								
								// adding manual slide-in tabs, other shapes not full keyguard height, and pedestals for clip-on straps
								if(!is_undef(case_additions)){
									if(have_a_case=="yes" && len(case_additions)>0){
										if (have_a_keyguard_frame=="no" || 
										   (have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no")
										   ){
										   
											add_flex_height_shapes(case_additions);
											
											if(type_of_keyguard!="Laser-Cut"){
												add_manual_mount_pedestals(case_additions);
											}
										}
									}
								}

								if(len(m_c_a)>0 && have_a_case=="yes" && (have_a_keyguard_frame=="no" || 
											(have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no"))){
									add_flex_height_shapes(m_c_a);
									
									if(type_of_keyguard!="Laser-Cut"){
										add_manual_mount_pedestals(m_c_a);
									}
								}

								
								//add embossed text to case region
								if (text!="" && keyguard_region=="case region" && text_depth>0){
									engrave_emboss_instruction();
								}
								
								//add pedestals for clip-on straps and ensure pedestals don't extend into screen area
								if (have_a_case=="yes" && m_m=="Clip-on Straps" && 
								    !(generate=="keyguard" && have_a_keyguard_frame=="yes") &&
									!(generate=="keyguard frame" && have_a_keyguard_frame=="yes") &&
									!no_clips){
									case_mounts(kt);
								}
							
								// add mounting posts and small tabs
								if(have_a_case=="yes" && m_m=="Posts"){
									add_mounting_posts();
								}
							
							}
							
							
							//*** cut away from keyguard blank those things that will be moved when the case opening is unequal
							
							// cut case openings
							if(!is_undef(case_openings)){
								if(have_a_case=="yes" && len(case_openings)>0 && !(have_a_keyguard_frame=="yes" && generate=="keyguard") && cheat=="no"){
									cut_case_openings(case_openings,kt);
								}
							}
								
							if(len(m_c_o)>0 && have_a_case=="yes" && !(have_a_keyguard_frame=="yes" && generate=="keyguard") && cheat=="no"){
								cut_case_openings(m_c_o,kt);
							}
						
							//add engraved text to case region
							if (text!="" && keyguard_region=="case region" && text_depth<0){
								engrave_emboss_instruction();
							}

							//add cuts for suction cups, velcro, clip-on straps and screw-on straps
							if (have_a_case=="no" && hide_screen_region=="no" && type_of_keyguard=="3D-Printed"){
								mounting_points();
							}
									
							//cut out slots for customizer added clip-on straps
							if (have_a_case=="yes" && m_m=="Clip-on Straps" && 
								    !(generate=="keyguard" && have_a_keyguard_frame=="yes") &&
									!(generate=="keyguard frame" && have_a_keyguard_frame=="yes") &&
									!no_clips){
								clip_on_straps_groove();
							}							

							// "-" shapes not full keyguard height
							if(!is_undef(case_additions)){
								if(have_a_case=="yes" && len(case_additions)>0){
									if (have_a_keyguard_frame=="no" || 
									   (have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no")
									   ){
									   
										sub_flex_height_shapes(case_additions);
										
									}
								}
							}
							
							if(len(m_c_a)>0 && have_a_case=="yes" && (have_a_keyguard_frame=="no" || 
										(have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no"))){
								sub_flex_height_shapes(m_c_a);
							}	

							// add slots to manually added clip-on strap pedestals
							if(!is_undef(case_additions)){
								if(have_a_case=="yes" && len(case_additions)>0 && type_of_keyguard!="Laser-Cut" && cheat=="no"){
									cut_manual_mount_pedestal_slots(case_additions);
								}
							}
							
							if(len(m_c_a)>0 && have_a_case=="yes" && type_of_keyguard!="Laser-Cut" && cheat=="no"){
								cut_manual_mount_pedestal_slots(m_c_a);
							}
						}
						
						//*** cut things/areas that are part of the screen area and unaffected by unequal case opening
						
						// remove the screen area of the keyguard if it is thinner than the rest of the keyguard
						//    and cut out all things that enter into the screen area - can be overwritten later by things like bumps and ridges
						al = max(adj_lec,0);
						ar = max(adj_rec,0);
						at = max(adj_tec,0);
						ab = max(adj_bec,0);
						translate([al/2-ar/2,ab/2-at/2,kt/2+ff])
						hole_cutter2(screen_width+cec*2-al-ar+cell_top_offset*2, screen_height+cec*2-at-ab+cell_top_offset*2, 90,90,90,90,bcr+cec/2,kt-sat);


						//cut bars and grid cells - which don't move with unequal case opening
						if (column_count>0 && row_count>0){
							translate([0,0,sat/2 - kt/2])
							bars(sat);
						}
						
						//cut openings for cells
						if (column_count>0 && row_count>0){
							translate([0,0,-ff-(kt-sat)/2])
							bounded_cells(sat);
						}
						
						//home button and camera are cut for both case and no_case configurations
						home_camera(kt);
						
						// symmetric openings are not supported for unequal openings or keyguard frames
						if(add_symmetric_openings=="yes" && have_a_keyguard_frame=="no" && unequal_left_side_offset==0 && unequal_bottom_side_offset==0){
							rotate([0,0,180])
							home_camera(kt);
							
							if (expose_ambient_light_sensors=="yes" && len(ttao)>0){
								rotate([0,0,180])
								cut_als_openings(ttao,sat);
							}
						}

						// make cuts associated with the tablet like ALS openings and symmetric camera/home button slots that are as deep as the keyguard
						//    - can affect slide-in tabs and raised tabs (in particular)

						// cut tablet openings
						if (!is_undef(tablet_openings)){
							if(tablet_height>0 && tablet_width>0 && len(tablet_openings)>0 && cheat=="no"){
								cut_tablet_openings(tablet_openings,kt);
							}
						}

						if(len(m_t_o)>0 && tablet_height>0 && tablet_width>0 && cheat=="no"){
							cut_tablet_openings(m_t_o,kt);
						}
						
						// ambient light sensors
						if (expose_ambient_light_sensors=="yes" && len(ttao)>0){
							cut_als_openings(ttao,kt);
						}
						
						//add embossed text to tablet region
						if (text!="" && keyguard_region=="tablet region" && text_depth<0){
							engrave_emboss_instruction();
						}
					
						//cut screen openings
						if(!is_undef(screen_openings)){
							if(len(screen_openings)>0 && type_of_tablet!="blank"){
								cut_screen_openings(screen_openings,sat);
							}
						}
						
						if(len(m_s_o)>0 && type_of_tablet!="blank"){
							cut_screen_openings(m_s_o,sat);
						}
						
						// add engraved text in the screen region
						if (text!="" && keyguard_region=="screen region" && text_depth < 0){
							engrave_emboss_instruction();
						}
						 						
						// add engraved text in the tablet region
						if (text!="" && keyguard_region=="tablet region" && text_depth < 0){
							engrave_emboss_instruction();
						}

						//if the keyguard will be trimmed to a specific pair of x,y locations
						if (len(t_t_r_ll)==2 && len(t_t_r_ur)==2 && hide_screen_region=="no"){
							trim_to_rectangle();
						}
					}

					//*** add items screen elements  and case elements that will override screen cutouts
					
					//add cell ridges	
					if (column_count>0 && row_count>0 && type_of_keyguard=="3D-Printed"){
						cell_ridges();
					}

					//add bumps and ridges
					if(!is_undef(screen_openings)){
						if(type_of_keyguard=="3D-Printed" && len(screen_openings)>0){
							adding_plastic(screen_openings,"screen");
						}
					}
					
					if(len(m_s_o)>0 && type_of_keyguard=="3D-Printed"){
						adding_plastic(m_s_o,"screen");
					}
						
					//add bumps and ridges from case_openings file and adjust for unequal case opening
					if(!is_undef(case_openings)){
						translate(unequal_opening)
						if(type_of_keyguard=="3D-Printed" && have_a_case=="yes" && have_a_keyguard_frame=="no" && len(case_openings)>0 && cheat=="no"){
							adding_plastic(case_openings,"case");
						}
					}
					
					if(len(m_c_o)>0){
						translate(unequal_opening)
						if(type_of_keyguard=="3D-Printed" && have_a_case=="yes" && have_a_keyguard_frame=="no" && cheat=="no"){
							adding_plastic(m_c_o,"case");
						}
					}

					// add embossed text
					if (text!="" && keyguard_region=="screen region" && text_depth > 0){
						engrave_emboss_instruction();
					}
				}
				
				//*** add cuts that should override anything added to the screen
				
				// remove parts of keyguard frame above posts
				if(have_a_case=="yes" && have_a_keyguard_frame=="yes" && mount_keyguard_with=="posts"){
					trim_keyguard_to_bar();
				}
										
				//cut away the screen region
				if (hide_screen_region == "yes"){
					cut_screen();
				}
				//cut away the grid region
				if (hide_grid_region == "yes"){
					cut_grid();
				}
			}
			
			//*** add specialized elements for special configurations - like a snap-in keyguard to a keyguard frame
			
			// add snap-in tabs
			if (have_a_keyguard_frame=="yes" && hide_screen_region == "no"){
				add_snap_ins();
			}
					
			//add the posts themselves
			if(have_a_case=="yes" && have_a_keyguard_frame=="yes" && mount_keyguard_with=="posts"){
				add_keyguard_frame_posts();
			}	
		}
		//*** last minute cuts
		
		//splitting the keyguard
		if (generate=="first half of keyguard" || generate=="second half of keyguard"){
			split_keyguard();
		}
		
		//trim down to the first two layers
		if (first_two_layers_only=="yes"){
			translate([0,0,50-kt/2+0.4])
			cube([1000,1000,100],center=true);
		}
	}
}


// create 2D image of keyguard for laser cutting
module lc_keyguard(){
	unequal_opening = [-unequal_left_side_offset,-unequal_bottom_side_offset,0];
	difference(){
		union(){
			difference(){
				union(){
					difference(){
						//slide case opening plastic based on unequal case opening settings
						translate(unequal_opening)
						//base keyguard with  manual  and customizer mounting points and some added plastic in case region, no grid
						difference(){ // here only for consistency with keyguard()
							union(){
								//base object: tablet body slab or case opening along with case additions if any that can be chamfered
								base_keyguard(kw,kh,kcr,0,"no");
													
								//add slide-in & raised tabs
								if (have_a_case=="yes" && have_a_keyguard_frame=="no" && m_m=="Slide-in Tabs"){
									case_mounts(0);
								}
							}
							//*** cut away from keyguard blank those things that will be moved when the case opening is unequal

							// cut case openings
							if(!is_undef(case_openings)){
								if(have_a_case=="yes" && len(case_openings)>0 && !(have_a_keyguard_frame=="yes" && generate=="keyguard")){
									cut_case_openings(case_openings,0);
								}
							}
							
							if(len(m_c_o)>0){
								if(have_a_case=="yes" && !(have_a_keyguard_frame=="yes" && generate=="keyguard")){
									cut_case_openings(m_c_o,0);
								}
							}

							//*** cut away from keyguard blank those things that will be moved when the case opening is unequal
							
							// nothing of this type to delete for a laser-cut keyguard
							
						} // here only for consistency with keyguard()
						
						//*** cut things/areas that are part of the screen area and unaffected by unequal case opening
						
						//cut bars and grid cells - which doesn't move with unequal case opening
						if (column_count>0 && row_count>0){
							bars(0);
						}
						
						if (column_count>0 && row_count>0){
							translate([0,0,0])
							cells(0);
						}
						
						//home button and camera are cut for both case and no_case configurations
						home_camera(0);
						
						// symmetric openings are not supported for unequal sides
						if(add_symmetric_openings=="yes" && unequal_left_side_offset==0 && unequal_bottom_side_offset==0){
							rotate([0,0,180])
							home_camera(0);
							
							rotate([0,0,180])
							cut_als_openings(ttao,0);
						}
					
						// make cuts associated with the tablet like ALS openings and symmetric camera/home button slots that are as deep as the keyguard - can affect slide-in tabs and raised tabs (in particular)
						
						// ambient light sensors
						if (expose_ambient_light_sensors=="yes" && len(ttao)>0){
							cut_als_openings(ttao,0);
						}
											
						// cut tablet openings
						if (!is_undef(tablet_openings)){
							if(tablet_height>0 && tablet_width>0 && len(tablet_openings)>0){
								cut_tablet_openings(tablet_openings,0);
							}
						}
						
						if(len(m_t_o)>0){
							if(tablet_height>0 && tablet_width>0){
								cut_tablet_openings(m_t_o,0);
							}
						}

						//cut screen openings
						if(!is_undef(screen_openings)){
							if(len(screen_openings)>0 && type_of_tablet!="blank"){
								cut_screen_openings(screen_openings,0);
							}
						}
						
						if(len(m_s_o)>0 && type_of_tablet!="blank"){
							cut_screen_openings(m_s_o,0);
						}

					}
					
					//*** add items screen elements and case elements that will override screen cutouts
					
					// nothing of this type to add for a laser-cut keyguard
					
				}
				//*** add cuts that should override anything added to the screen
				
				// nothing of this type to delete for a laser-cut keyguard
				
			}
			
			//*** add specialized elements for special configurations - like a snap-in keyguard to a keyguard frame
			
			// nothing of this type to add for a laser-cut keyguard

		}
		//*** last minute cuts
		
		// nothing of this type to delete for a laser-cut keyguard

		
	}
}

module keyguard_frame(cheat){
	unequal_border = [-unequal_tablet_left_side_offset,-unequal_tablet_bottom_side_offset,0];

	trans = (have_a_case=="yes") ? [-unequal_left_side_offset,-unequal_bottom_side_offset,0] : unequal_border;
	difference(){
		translate(trans)
		difference(){
			union(){
				if (m_m=="Shelf") {
					shelf_height = coh+2*shelf_depth;
					shelf_width = cow+2*shelf_depth;
	
					translate([0 ,0,-keyguard_frame_thickness/2])
					linear_extrude(height=shelf_t)
					build_addition(shelf_width, shelf_height, "crr", scr);
				}
				base_keyguard(fw,fh,fcr,keyguard_frame_thickness,"no");

				case_mounts(keyguard_frame_thickness);
											
				//add bumps and ridges from case_openings file
				if(!is_undef(case_openings)){
					if (len(case_openings)>0){
						adding_plastic(case_openings,"case");
					}
				}
				
				if(len(m_c_o)>0){
					adding_plastic(m_c_o,"case");
				}

				// adding manual slide-in tabs and pedestals for clip-on straps
				if(!is_undef(case_additions)){
					if(len(case_additions)>0){
						if (have_a_keyguard_frame=="no" || 
						   (have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no")
						   ){
						   
							add_flex_height_shapes(case_additions);
							
							add_manual_mount_pedestals(case_additions);
						}
					}
				}
				
				if(len(m_c_a)>0 && (have_a_keyguard_frame=="no" || 
				   (have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no"))){
				   
					add_flex_height_shapes(m_c_a);
					
					add_manual_mount_pedestals(m_c_a);
				}

				//add engraved text
				// not supported?? What if I put text in the case region of the openings and additions file?
			}
			
			//cut case openings
			if(!is_undef(case_openings)){
				if(len(case_openings)>0){
					cut_case_openings(case_openings,keyguard_frame_thickness);
				}
			}
			
			if(len(m_c_o)>0){
				cut_case_openings(m_c_o,keyguard_frame_thickness);
			}

			if (m_m=="Clip-on Straps" && !no_clips){
				clip_on_straps_groove();
			}
			
			// add slots to manually added clip-on strap pedestals
			if(!is_undef(case_additions)){
				if(len(case_additions)>0 && type_of_keyguard!="Laser-Cut" && cheat=="no"){
					cut_manual_mount_pedestal_slots(case_additions);
				}
			}
			if(len(m_c_a)>0 && type_of_keyguard!="Laser-Cut" && cheat=="no"){
				cut_manual_mount_pedestal_slots(m_c_a);
			}

		}

		// cut_out_opening for keyguard
		hole_cutter(keyguard_width,keyguard_height,90,90,90,90,kcr[0],keyguard_frame_thickness);
		
		//cut clip-on strap pedestals (manual or otherwise) if they extend into the space for the keyguard
		// translate([0,0,keyguard_frame_thickness/2+pedestal_height/2-ff])
		translate([0,0,keyguard_frame_thickness/2])
		linear_extrude(height=pedestal_height+10)
		offset(r=kcr[0])
		square([keyguard_width+cec*2-kcr[0]*2,keyguard_height+cec*2-kcr[0]*2], center=true);

		// cut slots for snap-in tabs on keyguard edges
		snap_in_tab_grooves();
		
		//camera and home button openings
		home_camera(keyguard_frame_thickness);
		
		// cut tablet openings
		if (!is_undef(tablet_openings)){
			if(len(tablet_openings)>0 && tablet_height>0 && tablet_width>0 && cheat=="no"){
				cut_tablet_openings(tablet_openings,kt);
			}
		}

		if(len(m_t_o)>0 && tablet_height>0 && tablet_width>0 && cheat=="no"){
			cut_tablet_openings(m_t_o,kt);
		}
		
		// remove non-full height "-" shapes
		if(!is_undef(case_additions)){
			if(len(case_additions)>0){
				if (have_a_keyguard_frame=="no" || 
				   (have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no")
				   ){
					sub_flex_height_shapes(case_additions);
				}
			}
		}
		
		if(len(m_c_a)>0 && (have_a_keyguard_frame=="no" || 
		   (have_a_keyguard_frame=="yes" && generate=="keyguard frame" && cheat=="no"))){
			sub_flex_height_shapes(m_c_a);
		}


		//tablet openings for ALS
		if(expose_ambient_light_sensors=="yes" && len(ttao)>0){
			cut_als_openings(ttao,keyguard_frame_thickness);
		}
			
		// symmetric openings are not supported for keyguard frames
		
		if (mount_keyguard_with=="posts"){
			post_cl = (expose_upper_message_bar == "yes" && expose_upper_command_bar == "yes") ? shm/2-sbhm-umbhm-ucbhm :
					  (expose_upper_message_bar == "yes" && expose_upper_command_bar == "no") ? shm/2-sbhm-umbhm :	
					  shm/2-sbhm;

			translate([keyguard_width/2+post_len/2-5,post_cl,-keyguard_frame_thickness/2-ff])
			add_keyguard_frame_post_slots();

			translate([keyguard_width/2+post_len/2-5,-post_cl,-keyguard_frame_thickness/2-ff])
			add_keyguard_frame_post_slots();
			
			translate([-keyguard_width/2-post_len/2+5,post_cl,-keyguard_frame_thickness/2-ff])
			add_keyguard_frame_post_slots();
			
			translate([-keyguard_width/2-post_len/2+5,-post_cl,-keyguard_frame_thickness/2-ff])
			add_keyguard_frame_post_slots();
		}
	}
}


module add_keyguard_frame_post_slots(){
	hole_dia = kt - post_tightness_of_fit/10;

	translate([0,0,(hole_dia/2)/2])
	cube([post_len+10,hole_dia,hole_dia/2],center=true);

	translate([0,0,(hole_dia)/2])
	rotate([0,90,0])
	cylinder(d=hole_dia,h=post_len+10,center=true);
}


module add_keyguard_frame_posts(){
	post_dia = kt;
	post_cl = (expose_upper_message_bar == "yes" && expose_upper_command_bar == "yes") ? shm/2-sbhm-umbhm-ucbhm+kt/2 :
              (expose_upper_message_bar == "yes" && expose_upper_command_bar == "no") ? shm/2-sbhm-umbhm+kt/2 :	
			  shm/2-sbhm+kt/2;
	post_l = kw+post_len*2;
	
	translate([0,post_cl-kt/2,0])
	rotate([0,90,0])
	cylinder(d=post_dia,h=post_l,center=true);
}


module trim_keyguard_to_bar(){				
	post_cl = (expose_upper_message_bar == "yes" && expose_upper_command_bar == "yes") ? shm/2-sbhm-umbhm-ucbhm :
              (expose_upper_message_bar == "yes" && expose_upper_command_bar == "no") ? shm/2-sbhm-umbhm :	
			  shm/2-sbhm;

	//remove top portion of keyguard
	translate([0,50+post_cl,0])
	cube([keyguard_width+10,100,kt+10],center=true);
}


module add_mounting_posts(){
	pd = (have_a_keyguard_frame=="yes") ? kt : post_diameter;
	p_l = (expose_status_bar=="yes" || expose_upper_message_bar=="yes") ? post_length : width_of_opening_in_case+post_length*2;

	bdr = (cow-swm)/2;

	post_height = coh/2 - mount_to_top_of_opening_distance;
	post_len_r = p_l + bdr + rec;
	post_len_l = p_l + bdr + lec;
	
	post_r0 = cow/2 + post_len_r/2 -bdr - rec;
	post_l0 = -cow/2 - post_len_l/2 + bdr + lec;
	
	cut_angle = 17;
	offset_angle = 38;
	ofset = pd/2 * sin(offset_angle);

	difference(){
		if (p_l > 0){
			if (expose_status_bar=="yes" || expose_upper_message_bar=="yes"){
				translate([post_l0,post_height,(pd-kt)/2])
				rotate([-cut_angle,0,0])
				difference(){
					rotate([0,90,0])
					cylinder(d=pd,h=post_len_l,center=true);
				
					if (notch_in_post=="yes"){
						translate([cow/2,10+ofset,0])
						cube([cow+100,20,20],center=true);
					}
				}

				translate([post_r0,post_height,(pd-kt)/2])
				rotate([-cut_angle,0,0])
				difference(){
					rotate([0,90,0])
					cylinder(d=pd,h=post_len_r,center=true);
				
					if (notch_in_post=="yes"){
						translate([cow/2,10+ofset,0])
						cube([cow+100,20,20],center=true);
					}
				}
			}
			else{
				translate([0,post_height,(pd-kt)/2])
				difference(){
					rotate([0,90,0])
					cylinder(d=post_diameter,h=p_l,center=true);

					if (notch_in_post=="yes"){
						rotate([-cut_angle,0,0])
						translate([0,10+ofset,0])
						cube([cow+100,20,20],center=true);
					}
				}
			}
		}
	}
	
	if(add_mini_tabs == "yes"){
		tab = [
			[1,cow/2,coh/2,  mini_tab_width,   mini_tab_length,  "rr3",  1, -999, -999, -999, -999, 1],
		];
		
		translate([-cow/2+mini_tab_inset_distance+mini_tab_width/2,-coh/2,min(mini_tab_height,keyguard_thickness-2)])
		rotate([0,0,-rotate_mini_tab])
		add_flex_height_shapes(tab);
		
		translate([cow/2-mini_tab_inset_distance-mini_tab_width/2,-coh/2,min(mini_tab_height,keyguard_thickness-2)])
		rotate([0,0,rotate_mini_tab])
		add_flex_height_shapes(tab);
	}
}

module split_keyguard(){
	half = (generate == "first half of keyguard") ? "first" : "second";
	
	if (orientation=="landscape"){
		maskwidth = (have_a_case == "no") ? tablet_width : kw;
		maskheight = (have_a_case == "no") ? tablet_height : kh;
		
		if (split_line_location==0 && row_count > 0 && column_count > 0){
			odd_num_columns = column_count/2 - floor(column_count/2) > 0;
			max_cell_w=grid_width/column_count;
			cut_line = (odd_num_columns) ? 
				(column_count/2 + 0.5)*max_cell_w :
				(column_count/2)*max_cell_w;
			split_x0 = (generate=="first half of keyguard")?
				grid_x0+cut_line:
				grid_x0+cut_line-(maskwidth*2);
			if (split_line_type=="flat"){
				translate([maskwidth+split_x0,0,0])
				cube([maskwidth*2,maskheight*2,100],center=true);
			}
			else{
				translate([maskwidth+split_x0-1,slide_dovetails,0])
				difference(){
					union(){
						cube([maskwidth*2,maskheight*2,100],center=true);
						translate([maskwidth+1-ff,0,0])
						rotate([0,0,90])
						dovetails(half);
					}
					translate([-maskwidth+1-ff,0,0])
					rotate([0,0,90])
					dovetails(half);
				}
			}
		}
		else{
			split_x0 = (generate=="first half of keyguard")? (maskwidth*2)/2 + split_line_location : -(maskwidth*2)/2 + split_line_location;
			if (split_line_type=="flat"){
				translate([split_x0,0,0])
				cube([maskwidth*2,maskheight*2,100],center=true);
			}
			else{
				translate([split_x0-1,slide_dovetails,0])
				difference(){
					union(){
						cube([maskwidth*2,maskheight*2,100],center=true);
						translate([maskwidth+1-ff,0,0])
						rotate([0,0,90])
						dovetails(half);
					}
					translate([-maskwidth+1-ff,0,0])
					rotate([0,0,90])
					dovetails(half);
				}
			}
		}
	}
	else{
		maskwidth = (have_a_case == "no") ? tablet_width : kw;
		maskheight = (have_a_case == "no") ? tablet_height : kh;

		if (split_line_location==0 && row_count > 0 && column_count > 0){
			odd_num_rows = row_count/2 - floor(row_count/2) > 0;
			max_cell_h=grid_height/row_count;
			cut_line = (odd_num_rows) ? 
				(row_count/2 + 0.5)*max_cell_h :
				(row_count/2)*max_cell_h;
				
			split_y0 = (generate=="first half of keyguard")? -maskwidth+grid_y0+cut_line : maskwidth+grid_y0+cut_line;

			if (split_line_type=="flat"){
				translate([0,split_y0,0])
				cube([maskheight*2,maskwidth*2,100],center=true);
			}
			else{
				translate([slide_dovetails,split_y0+0.5,0])
				difference(){
					union(){
						cube([maskheight*2,maskwidth*2,100],center=true);
						translate([0,-maskwidth+ff,0])
						rotate([0,0,0])
						dovetails(half);
					}
					translate([0,maskwidth+ff,0])
					rotate([0,0,0])
					dovetails(half);
				}
			}
		}
		else{
			split_y0 = (generate=="first half of keyguard")? -(maskwidth*2)/2 + split_line_location : (maskwidth*2)/2 + split_line_location;
			if (split_line_type=="flat"){
				translate([0,split_y0,0])
				cube([maskheight*2,maskwidth*2,100],center=true);
			}
			else{
				translate([slide_dovetails,split_y0+1,0])
				difference(){
					union(){
						cube([maskheight*2,maskwidth*2,100],center=true);
						translate([0,-maskwidth-1+ff,0])
						rotate([0,0,0])
						dovetails(half);
					}
					translate([0,maskwidth-1-ff,0])
					rotate([0,0,0])
					dovetails(half);
				}
			}
		}
	}
}

module show_line_split_location(){
	if (orientation=="landscape"){

		if (split_line_location==0 && row_count > 0 && column_count > 0){
			odd_num_columns = column_count/2 - floor(column_count/2) > 0;
			max_cell_w=grid_width/column_count;
			cut_line = (odd_num_columns) ? 
				(column_count/2 + 0.5)*max_cell_w :
				(column_count/2)*max_cell_w;
			split_x0 = cut_line-grid_width/2;

			translate([split_x0,0,0])
			#cube([1,kh+10,10],center=true);
		}
		else{
			translate([split_line_location,0,0])
			#cube([1,kh+10,10],center=true);
		}
	}
	else{
		if (split_line_location==0 && row_count > 0 && column_count > 0){
			odd_num_rows = row_count/2 - floor(row_count/2) > 0;
			max_cell_h=grid_height/row_count;
			cut_line = (odd_num_rows) ? 
				(row_count/2 + 0.5)*max_cell_h :
				(row_count/2)*max_cell_h;
				
			split_y0 = cut_line-grid_height/2;

			translate([0,split_y0,0])
			#cube([kw+10,1,10],center=true);
		}
		else{
			translate([0,split_line_location,0])
			#cube([kw+10,1,10],center=true);
		}
	}
}



module split_keyguard_frame(half){
	maskwidth = fw;
	maskheight = fh;
		
	rot = (orientation=="landscape") ? [0,0,0] : [0,0,-90];
	split_x0 = (half=="first")? maskwidth + split_line_location : -maskwidth + split_line_location;
	
	rotate(rot)
	if (split_line_type=="flat"){
		translate([split_x0,0,0])
		cube([maskwidth*2,maskheight*2,100],center=true);
	}
	else{
		translate([split_x0-1,slide_dovetails,0])
		difference(){
			union(){
				cube([maskwidth*2,maskheight*2,100],center=true);
				translate([maskwidth+1-ff,0,0])
				rotate([0,0,90])
				dovetails(half);
			}
			translate([-maskwidth+1-ff,0,0])
			rotate([0,0,90])
			dovetails(half);
		}
	}
}

module dovetails(half){
	cutLen = (have_a_case=="no") ? tablet_height*2+ff*2 : kh*2+ff*2 ;
	doveTailWidth=dovetail_width;
	doveTailHeight = 100;
	gap = (half == "first") ? -(tightness_of_dovetail_joint - 5)/10 : 0;
	for (i=[-cutLen/2+doveTailWidth/2-1:doveTailWidth*2-2:cutLen/2]){
		translate([i,-1,-doveTailHeight/2])
		linear_extrude(height=doveTailHeight)
		polygon([[0+gap,0],[doveTailWidth-gap,0],[doveTailWidth-1-gap,2],[1+gap,2]]);
	}
}

module case_mounts(depth) {
	//add mounting points for cases
	if (m_m=="Slide-in Tabs"){
		if (depth>0){
			translate([0,0,-depth/2])
			linear_extrude(height = slide_in_tab_thickness)
			add_2d_slide_in_tabs();
		}
		else{
			add_2d_slide_in_tabs();
		}
	}
	else if (m_m=="Raised Tabs" && type_of_keyguard=="3D-Printed" && depth > 0){
		add_raised_tabs(depth);
	}
	else if (m_m=="Clip-on Straps" && type_of_keyguard=="3D-Printed" && depth > 0 && !no_clips){
		add_clip_on_strap_pedestals(depth);
	}
}

module add_2d_slide_in_tabs() {
	h_sitlen = horizontal_slide_in_tab_length_incl_acrylic;
	v_sitlen = vertical_slide_in_tab_length_incl_acrylic;
	h_sitwid = horizontal_slide_in_tab_width;
	v_sitwid = vertical_slide_in_tab_width;
	// if the length of tabs = 2 and the distance between them is 0 then the render step fails separateh them by ff
	h_sitdist = (h_sitlen == 2 && distance_between_horizontal_slide_in_tabs == 0) ? distance_between_horizontal_slide_in_tabs + ff : distance_between_horizontal_slide_in_tabs;
	v_sitdist = (v_sitlen == 2 && distance_between_vertical_slide_in_tabs == 0) ? distance_between_vertical_slide_in_tabs + ff : distance_between_vertical_slide_in_tabs;
		
	if(slide_in_tab_locations == "horizontal only" || slide_in_tab_locations == "horizontal and vertical"){
		left_slide_in_tab_offset = -kw/2+ff;
		
		translate([left_slide_in_tab_offset,-h_sitdist/2-h_sitwid/2+ulbs])
		mirror([1,0,0])
		create_2D_slide_in_tab(h_sitlen,h_sitwid);
		
		translate([left_slide_in_tab_offset,h_sitdist/2+h_sitwid/2+ulbs])
		mirror([1,0,0])
		create_2D_slide_in_tab(h_sitlen,h_sitwid);
		
		right_slide_in_tab_offset = kw/2-ff;
		
		translate([right_slide_in_tab_offset,-h_sitdist/2-h_sitwid/2+ulbs])
		create_2D_slide_in_tab(h_sitlen,h_sitwid);

		translate([right_slide_in_tab_offset,h_sitdist/2+h_sitwid/2+ulbs])
		create_2D_slide_in_tab(h_sitlen,h_sitwid);
	}
	if(slide_in_tab_locations == "vertical only" || slide_in_tab_locations == "horizontal and vertical"){
		bottom_slide_in_tab_offset = -kh/2+ff;
		
		translate([-v_sitdist/2-v_sitwid/2+ulos, bottom_slide_in_tab_offset])
		rotate([0,0,-90])
		create_2D_slide_in_tab(v_sitlen,v_sitwid);

		translate([v_sitdist/2+v_sitwid/2+ulos,bottom_slide_in_tab_offset])
		rotate([0,0,-90])
		create_2D_slide_in_tab(v_sitlen,v_sitwid);

		top_slide_in_tab_offset = kh/2-ff;

		translate([-v_sitdist/2-v_sitwid/2+ulos, top_slide_in_tab_offset])
		rotate([0,0,90])
		create_2D_slide_in_tab(v_sitlen,v_sitwid);

		translate([v_sitdist/2+v_sitwid/2+ulos, top_slide_in_tab_offset])
		rotate([0,0,90])
		create_2D_slide_in_tab(v_sitlen,v_sitwid);
	}
}

module create_2D_slide_in_tab(tab_length,tab_width){
	x1_offset = -tab_length/2;
	x2_offset = tab_length/2-2;
	
	translate([x2_offset,0,0])
	difference(){
		offset(r=2)
		square([tab_length,tab_width-4],center=true);
		
		translate([x1_offset,0,0])
		square([4,tab_width+2],center=true);
	}
	
	if (tab_length>=3){
		translate([1.5,tab_width/2+1.44,0])
		difference(){
			square(3,center=true);
			circle(d=3);
			
			translate([.75,0,0])
			square([1.51,3.01],center=true);
			
			translate([0,.75,0])
			square([3.01,1.51],center=true);
		}
		
		translate([1.5,-tab_width/2-1.44,0])
		difference(){
			square(3,center=true);
			circle(d=3);
			
			translate([.75,0,0])
			square([1.51,3.01],center=true);
			
			translate([0,-.75,0])
			square([3.01,1.51],center=true);
		}
	}
}

module add_clip_on_strap_pedestals(depth){
	xloc = cow;
	yloc = coh;

	if(clip_locations=="horizontal only" || clip_locations=="horizontal and vertical"){
		translate([-xloc/2+4.3, -distance_between_horizontal_clips/2-horizontal_pedestal_width/2+4+ulbs, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([7,horizontal_pedestal_width],center=true);
				
		translate([-xloc/2+4.3 , distance_between_horizontal_clips/2+horizontal_pedestal_width/2-4+ulbs, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([7,horizontal_pedestal_width],center=true);
		
		translate([xloc/2-4.3, -distance_between_horizontal_clips/2-horizontal_pedestal_width/2+4+ulbs, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([7,horizontal_pedestal_width],center=true);
		
		translate([xloc/2-4.3, distance_between_horizontal_clips/2+horizontal_pedestal_width/2-4+ulbs, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([7,horizontal_pedestal_width],center=true);
	}
	if(clip_locations=="vertical only" || clip_locations=="horizontal and vertical"){
		translate([-distance_between_vertical_clips/2-vertical_pedestal_width/2+4+ulos, -yloc/2+4.3, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([vertical_pedestal_width,7],center=true);
		
		translate([distance_between_vertical_clips/2+vertical_pedestal_width/2-4+ulos, -yloc/2+4.3, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([vertical_pedestal_width,7],center=true);
		
		translate([-distance_between_vertical_clips/2-vertical_pedestal_width/2+4+ulos, yloc/2-4.3, depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([vertical_pedestal_width,7],center=true);
		
		translate([distance_between_vertical_clips/2+vertical_pedestal_width/2-4+ulos, yloc/2-4.3 , depth/2])
		linear_extrude(height=pedestal_height,scale=.8)
		square([vertical_pedestal_width,7],center=true);
	}
}



module add_raised_tabs(depth) {
	s = (raised_tabs_starting_height < depth - 1) ? raised_tabs_starting_height : depth - 1;
	
	dim = (orientation=="landscape") ? cow : coh;
	r = (orientation=="landscape") ? 0 : 90;
	
	rotate([0,0,r])
	union(){
		translate([-dim/2, -raised_tab_width-distance_between_raised_tabs/2+ulbs, -depth/2+s])
		mirror([1,0,0])
		raised_tab(depth);

		translate([-dim/2, distance_between_raised_tabs/2+ulbs, -depth/2+s])
		mirror([1,0,0])
		raised_tab(depth);

		translate([dim/2, -raised_tab_width-distance_between_raised_tabs/2+ulbs, -depth/2+s])
		raised_tab(depth);
		
		translate([dim/2, distance_between_raised_tabs/2+ulbs, -depth/2+s])
		raised_tab(depth);
	}
}

module raised_tab(depth){
	a = raised_tab_length;
	b = raised_tab_height;
	s = (raised_tabs_starting_height < depth - 1) ? raised_tabs_starting_height : depth - 1;
	angle = ramp_angle;
	e = min((depth-s+1)*cos(angle),preferred_raised_tab_thickness);
	r_h = a * tan(angle);
		
	// magnet variables
	ml = (magnet_size=="20 x 8 x 1.5") ? 20 : 
		 (magnet_size=="40 x 10 x 2") ? 40 : 
		 0;
		 
	mw = (magnet_size=="20 x 8 x 1.5") ? 8 : 
		 (magnet_size=="40 x 10 x 2") ? 10 : 
		 0;

	mh = (magnet_size=="20 x 8 x 1.5") ? 1.5 : 
		 (magnet_size=="40 x 10 x 2") ? 2 : 
		 0;
		 
	th1 = (embed_magnets=="no") ? e : max(e, mh+1);

	if (r_h > b){  //tread exists
		f = (sin(angle)!=0) ? (b-s)/sin(angle) : a;
		h1 = (b-s)/tan(angle);

		tangle = 90-(180-angle)/2;
		x = sin(tangle)*e;
		g = a - h1 + x;
		r = f + x;
		
		difference(){
			union(){
				difference(){
					rotate([0,-angle,0])
					translate([-2,0,0])
					cube([r+2,raised_tab_width,e]);
				
					translate([-5,-ff,-5])
					cube([5,raised_tab_width+2*ff,5]);
				}
					
				translate([h1-x-50*ff,0,b-s])
				difference(){
					union(){
						cube([g-2.5,raised_tab_width,th1]);
						
						translate([g-2.5,2.5,0])
						cube([2.5,raised_tab_width-5,th1]);
						
						translate([g-2.5,0,0])
						difference(){
							union(){
								translate([0,2.5,0])
								cylinder(h=th1,r=2.5);
								
								translate([0,raised_tab_width-2.5,0])
								cylinder(h=th1,r=2.5);
							}
							translate([-6,-ff,-ff])
							cube([6,raised_tab_width+2*ff,th1+2*ff]);
						}
					}
			
					translate([g+ff,0,th1/2])
					rotate([0,-45,0])
					cube([th1,raised_tab_width,th1]);
				}
			}
			
			if(embed_magnets=="yes"){
				translate([h1-x+2,(raised_tab_width-ml)/2,b-s+.4])
				union(){
					cube([mw,ml+(raised_tab_width-ml)/2+1,mh]);
					#cube([mw,ml,mh]);
				}
			}
			
			translate([-6,-ff,depth-s])
			cube([5,raised_tab_width+2*ff,5]);
			
			translate([0,-ff,e])
			rotate([0,-ramp_angle,0])
			translate([-5,0,0])
			cube([r+10,raised_tab_width+2*ff,3]);
		}
	}
	else{ // tread doesn't exist
		h1 = a;
		f = h1/cos(angle);
		
		difference(){
			rotate([0,-angle,0])
			difference(){
				union(){
					translate([-2,0,0])
					cube([f+2-2.5,raised_tab_width,th1+1]);
					
					translate([f-2.5,2.5,0])
					cube([2.5,raised_tab_width-5,th1+1]);
					
					translate([f-2.5,2.5,0])
					cylinder(h=th1+1,r=2.5);
				
					translate([f-2.5,raised_tab_width-2.5,0])
					cylinder(h=th1+1,r=2.5);
				}
				
				translate([f+ff,0,(th1+1)/2])
				rotate([0,-45,0])
				cube([th1+1,raised_tab_width,th1+1]);

				translate([-th1-1+2-ff,-ff,depth/2])
				rotate([0,-45,0])
				cube([th1+1,raised_tab_width+2*ff,th1+1]);
				

				if(embed_magnets=="yes"){
					translate([2,(raised_tab_width-ml)/2,.6])
					union(){
						cube([mw+.5,ml+(raised_tab_width-ml)/2-.5,mh+.5]);
						#cube([mw+.5,ml,mh+.5]);
						translate([(mw-1)/2,0,0])
						cube([1,ml+(raised_tab_width-ml)/2+1,mh+.5]);
					}
				}
			}
			
			translate([-5,-ff,-5])
			cube([5,raised_tab_width+2*ff,5]);
			
			translate([-5-1.25,-ff,depth/2-.5])
			cube([5,raised_tab_width+2*ff,5]);
		}
	}
}

module create_cutting_tool(rotation,diameter,thickness,slope,type){
	rotate([0,0,rotation])
	difference(){
		translate([0,0,-thickness/2-ff/2])
		cube(size=[diameter/2+ff*2,diameter/2+ff*2,thickness+ff]);
		intersection(){
			cylinder(h=thickness+ff*4,r1=diameter/2,r2=diameter/2-(thickness/tan(slope)),center=true);
			if (type=="oa" && type_of_keyguard=="3D-Printed"){ //outer arcs are chamfered
				chamfer_circle_radius1 = diameter/2+(tan(45)*(thickness-.6)); // bottom radius
				chamfer_circle_radius2 = diameter/2 -.6; //top radius
				cylinder(h=thickness+ff*2,r1=chamfer_circle_radius1,r2=chamfer_circle_radius2,center=true);
			}
		}
	}
}

module create_cutting_tool_2d(rotation,diameter){
	rotate([0,0,rotation])
	difference(){
		translate([0,0])
		square([diameter/2+ff*2,diameter/2+ff*2]);

		circle(r=diameter/2);
	}
}

module home_camera(depth){
	//deal with home button
	if (home_button_location!=0 && expose_home_button=="yes" && home_button_height > 0 && home_button_width > 0){
		translate([home_x_loc,home_y_loc,0])
		if (home_button_height==home_button_width){
			if(home_button_location==2 || home_button_location==4){
				hole_cutter(home_button_height,home_button_height,hbes,hbes,90,90,home_button_height/2,depth);
			}
			else{
				hole_cutter(home_button_height,home_button_height,90,90,hbes,hbes,home_button_height/2,depth);
			}
		}
		else{
			m = min(home_button_width,home_button_height);
			if(home_button_location==2 || home_button_location==4){
				hole_cutter(home_button_width,home_button_height,hbes,hbes,90,90,m/2,depth);
			}
			else{
				hole_cutter(home_button_width,home_button_height,90,90,hbes,hbes,m/2,depth);
			}
		}
	}
	//deal with camera
	coa = camera_offset_acrylic;
	if (camera_location!=0 && expose_camera=="yes" && camera_height > 0 && camera_width > 0){
		translate([cam_x_loc,cam_y_loc,0])
		if (camera_height==camera_width){
			if (type_of_keyguard=="3D-Printed"){
				hole_cutter(camera_height,camera_height,camera_cut_angle,camera_cut_angle,camera_cut_angle,camera_cut_angle,camera_height/2,depth);
			}
			else{
				hole_cutter(camera_height+coa*2,camera_height+coa*2,90,90,90,90,(camera_height+coa*2)/2,depth);
			}
		}
		else{
			if (type_of_keyguard=="3D-Printed"){
				m = min(camera_width,camera_height);
				hole_cutter(camera_width,camera_height,camera_cut_angle,camera_cut_angle,camera_cut_angle,camera_cut_angle,m/2,depth);
			}
			else{
				m = min(camera_width,camera_height);
				hole_cutter(camera_width+coa*2,camera_height+coa*2,90,90,90,90,(m+coa*2)/2,depth);
			}
		}
	}
}

module mounting_points(){
	if (m_m=="Suction Cups"){
		suction_cups();
	}
	else if (m_m=="Velcro"){
		velcro();
	}
	else if (m_m=="Screw-on Straps"){
		screw_on_straps();
	}
	else if (m_m=="Clip-on Straps" && !no_clips){
		clip_on_straps_groove();
	}
	else {
		//No Mount option
	}
}

module suction_cups(){
	major_dim = max(tablet_width,tablet_height);

	translate([-major_dim/2+left_border_width/2, 40, 0])
	cylinder(h=kt*3, d=7.5, center=true);
	translate([-major_dim/2+left_border_width/2, 40-5, 0])
	cylinder(h=kt*3, d=4.5, center=true);
	
	translate([-major_dim/2+left_border_width/2, -40, 0])
	cylinder(h=kt*3, d=7.5, center=true);
	translate([-major_dim/2+left_border_width/2, -40+5, 0])
	cylinder(h=kt*3, d=4.5, center=true);
	
	translate([major_dim/2-right_border_width/2, 40, 0])
	cylinder(h=kt*3, d=7.5, center=true);
	translate([major_dim/2-right_border_width/2, 40-5, 0])
	cylinder(h=kt*3, d=4.5, center=true);
	
	translate([major_dim/2-right_border_width/2, -40, 0])
	cylinder(h=kt*3, d=7.5, center=true);
	translate([major_dim/2-right_border_width/2, -40+5, 0])
	cylinder(h=kt*3, d=4.5, center=true);
	
	translate([-major_dim/2+left_border_width/2-5, 30.5,-kt/2+2])
	cube(size=[10,15,kt]);
	
	translate([-major_dim/2+left_border_width/2-5, -45.5,-kt/2+2])
	cube(size=[10,15,kt]);

	translate([major_dim/2-right_border_width/2-5, 30.5,-kt/2+2])
	cube(size=[10,15,kt]);
	
	translate([major_dim/2-right_border_width/2-5, -45.5,-kt/2+2])
	cube(size=[10,15,kt]);
}

module velcro(){
	major_dim = max(tablet_width,tablet_height);

	//create recessed shapes on the bottom of the surround to mount velcro
	if (m_m=="Velcro"){
		if (velcro_size<=3){ //round velcros
			translate([-major_dim/2+velcro_diameter/2+2, 30, -kt/2+.5])
			cylinder(h=2.5, d=velcro_diameter, center=true);
			
			translate([-major_dim/2+velcro_diameter/2+2, -30, -kt/2+.5])
			cylinder(h=2.5, d=velcro_diameter, center=true);
			
			translate([major_dim/2-velcro_diameter/2-2, 30, -kt/2+.5])
			cylinder(h=2.5, d=velcro_diameter, center=true);
			
			translate([major_dim/2-velcro_diameter/2-2, -30, -kt/2+.5])
			cylinder(h=2.5, d=velcro_diameter, center=true);
		}
		else{ //square velcros
			translate([-major_dim/2+velcro_diameter/2+2, 30, -kt/2+.5])
			cube(size=[velcro_diameter,velcro_diameter,2.5],center=true);
			
			translate([-major_dim/2+velcro_diameter/2+2, -30, -kt/2+.5])
			cube(size=[velcro_diameter,velcro_diameter,2.5],center=true);
			
			translate([major_dim/2-velcro_diameter/2-2, 30, -kt/2+.5])
			cube(size=[velcro_diameter,velcro_diameter,2.5],center=true);
			
			translate([major_dim/2-velcro_diameter/2-2, -30, -kt/2+.5])
			cube(size=[velcro_diameter,velcro_diameter,2.5],center=true);
		}
	}
}

module screw_on_straps(){
	major_dim = max(tablet_width,tablet_height);

	//drill holes for screw-on straps and cut slots if needed for thick keyguards
	if (strap_cut_to_depth<kt) {  //cuts slot and flanges (the cylinders) for Keyguard AT's acrylic tabs
		translate([-major_dim/2-1,34.5,-kt/2+strap_cut_to_depth])
		cube(size=[12,11,kt]);
		translate([-major_dim/2-1,34.5,-kt/2+strap_cut_to_depth])
		cylinder(h=kt,d=7,$fn=3);
		translate([-major_dim/2-1,45.5,-kt/2+strap_cut_to_depth])
		cylinder(h=kt,d=7,$fn=3);
		
		translate([-major_dim/2-1,-45.5,-kt/2+strap_cut_to_depth])
		cube(size=[12,11,kt]);
		translate([-major_dim/2-1,-45.5,-kt/2+strap_cut_to_depth])
		cylinder(h=kt,d=7,$fn=3);
		translate([-major_dim/2-1,-34.5,-kt/2+strap_cut_to_depth])
		cylinder(h=kt,d=7,$fn=3);

		translate([major_dim/2-11,34.5,-kt/2+strap_cut_to_depth])
		cube(size=[12,11,kt]);
		translate([major_dim/2,34.5,-kt/2+strap_cut_to_depth])
		rotate([0,0,180])
		cylinder(h=kt,d=7,$fn=3);
		translate([major_dim/2,45.5,-kt/2+strap_cut_to_depth])
		rotate([0,0,180])
		cylinder(h=kt,d=7,$fn=3);
		
		translate([major_dim/2-11,-45.5,-kt/2+strap_cut_to_depth])
		cube(size=[12,11,kt]);
		translate([major_dim/2,-45.5,-kt/2+strap_cut_to_depth])
		rotate([0,0,180])
		cylinder(h=kt,d=7,$fn=3);
		translate([major_dim/2,-34.5,-kt/2+strap_cut_to_depth])
		rotate([0,0,180])
		cylinder(h=kt,d=7,$fn=3);
	}
	//cut holes for screw
	translate([-major_dim/2+5.5, 40, -kt/2])
	cylinder(h=kt*3, d=6, center=true);
	
	translate([-major_dim/2+5.5, - 40, -kt/2])
	cylinder(h=kt*3, d=6, center=true);
	
	translate([major_dim/2-5.5, 40, -kt/2])
	cylinder(h=kt*3, d=6, center=true);
	
	translate([major_dim/2-5.5, -40, -kt/2])
	cylinder(h=kt*3, d=6, center=true);
}

module clip_on_straps_groove(){
	xloc = (add_sloped_keyguard_edge=="no") ? cow :
	       (extend_lip_to_edge_of_case=="no") ? cow + sew*2-2 : case_width-2;
	yloc = (add_sloped_keyguard_edge=="no") ? coh :
	       (extend_lip_to_edge_of_case=="no") ? coh + sew*2-2 : case_height-2;
	
	w1 = (have_a_case=="no") ? tablet_width :xloc;
	h1 = (have_a_case=="no") ? tablet_height : yloc;
	x0 = -w1/2;
	y0 = -h1/2;
	
	if(clip_locations=="horizontal only" || clip_locations =="horizontal and vertical"){
		translate([x0+2, -distance_between_horizontal_clips/2+ulbs, vertical_offset])
		rotate([90,0,0])
		linear_extrude(height = horizontal_slot_width)
		polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
		
		translate([x0+2, distance_between_horizontal_clips/2+horizontal_slot_width+ulbs, vertical_offset])
		rotate([90,0,0])
		linear_extrude(height = horizontal_slot_width)
		polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
		
		translate([-x0-5, -distance_between_horizontal_clips/2+ulbs, vertical_offset])
		rotate([90,0,0])
		linear_extrude(height = horizontal_slot_width)
		polygon(points=[[0,0],[3,0],[2,3],[-1,3]]);
		
		translate([-x0-5, distance_between_horizontal_clips/2+horizontal_slot_width+ulbs, vertical_offset])
		rotate([90,0,0])
		linear_extrude(height = horizontal_slot_width)
		polygon(points=[[0,0],[3,0],[2,3],[-1,3]]);
	}
	
	if(clip_locations=="vertical only" || clip_locations =="horizontal and vertical"){
		translate([-distance_between_vertical_clips/2-vertical_slot_width+ulos, y0 + 2,  vertical_offset])
		rotate([90,0,90])
		linear_extrude(height = vertical_slot_width)
		polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
		
		translate([distance_between_vertical_clips/2+ulos, y0 + 2,  vertical_offset])
		rotate([90,0,90])
		linear_extrude(height = vertical_slot_width)
		polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
		
		translate([-distance_between_vertical_clips/2+ulos, -y0 - 2,  vertical_offset])
		rotate([90,0,-90])
		linear_extrude(height = vertical_slot_width)
		polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
		
		translate([distance_between_vertical_clips/2 + vertical_slot_width+ulos, -y0 - 2,  vertical_offset])
		rotate([90,0,-90])
		linear_extrude(height = vertical_slot_width)
		polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
	}
}

module bars(depth){
	if (expose_status_bar=="yes" && expose_upper_message_bar=="no" && expose_upper_command_bar=="no" && sbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm+sbh_adjust/2,0])
		hole_cutter(bar_width,sbh_adjust+ff,90,90,90,90,bcr,depth);
	}
	if (expose_status_bar=="yes" && expose_upper_message_bar=="yes" && expose_upper_command_bar=="no" && sbh_adjust+umbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm+(max(sbh_adjust,0)+umbh_adjust)/2,0])
		hole_cutter(bar_width,max(sbh_adjust,0)+umbh_adjust+ff,90,bar_edge_slope_inc_acrylic,90,90,bcr,depth);
	}

	if (expose_status_bar=="no" && expose_upper_message_bar=="yes" && expose_upper_command_bar=="yes" && umbh_adjust+ucbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm-ucbhm+(max(umbh_adjust,0)+ucbh_adjust)/2,0])
		hole_cutter(bar_width,max(umbh_adjust+ff,0)+ucbh_adjust,90,90,90,90,bcr,depth);
	}
	
	if (expose_status_bar=="yes" && expose_upper_message_bar=="yes" && expose_upper_command_bar=="yes" && sbh_adjust+umbh_adjust+ucbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm-ucbhm+(max(sbh_adjust,0)+max(umbh_adjust,0)+ucbh_adjust)/2,0])
		hole_cutter(bar_width,max(sbh_adjust,0)+max(umbh_adjust,0)+ucbh_adjust+ff,90,90,90,90,bcr,depth);
	}

	if (expose_status_bar=="no" && expose_upper_message_bar=="yes" && expose_upper_command_bar=="no" && umbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm+(umbh_adjust)/2,0])
		hole_cutter(bar_width,umbh_adjust+ff,90,bar_edge_slope_inc_acrylic,90,90,bcr,depth);
	}

	if (expose_status_bar=="no" && expose_upper_message_bar=="no" && expose_upper_command_bar=="yes" && ucbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm-ucbhm+(ucbh_adjust)/2,0])
		hole_cutter(bar_width,ucbh_adjust+ff,90,90,90,90,bcr,depth);
	}

	if (expose_status_bar=="yes" && expose_upper_message_bar=="no" && umbhm>0 && expose_upper_command_bar=="yes" && sbh_adjust+ucbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm+sbh_adjust/2,0])
		hole_cutter(bar_width,sbh_adjust+ff,90,90,90,90,bcr,depth);

		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm-ucbhm+(ucbh_adjust)/2,0])
		hole_cutter(bar_width,ucbh_adjust+ff,90,90,90,90,bcr,depth);
	}

	if (expose_status_bar=="yes" && expose_upper_message_bar=="no" && umbhm==0 && expose_upper_command_bar=="yes" && sbh_adjust+ucbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,shm/2-sbhm+sbh_adjust/2,0])
		hole_cutter(bar_width,sbh_adjust+ff,90,90,90,90,bcr,depth);

		translate([adj_lec/2-adj_rec/2,shm/2-sbhm-umbhm-ucbhm+(ucbh_adjust)/2+bcr,0])
		hole_cutter(bar_width,ucbh_adjust+bcr*2+ff,90,90,90,90,bcr,depth);
	}

	if (expose_lower_message_bar=="yes" && expose_lower_command_bar=="no" && lmbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,-shm/2+lmbh_adjust/2+max(lcbh_adjust,0)+adj_bec,0])
		hole_cutter(bar_width,lmbh_adjust+ff,90,bar_edge_slope_inc_acrylic,90,90,bcr,depth);
	}

	if (expose_lower_message_bar=="no" && expose_lower_command_bar=="yes" && lcbh_adjust>0){
		translate([adj_lec/2-adj_rec/2,-shm/2+lcbhm/2+adj_bec/2,0])
		hole_cutter(bar_width,lcbh_adjust+ff,90,90,90,90,bcr,depth);
	}

	if (expose_lower_message_bar=="yes" && expose_lower_command_bar=="yes" && (lmbh_adjust+max(lcbh_adjust,0))>0){
		translate([adj_lec/2-adj_rec/2,-shm/2+(lmbh_adjust+max(lcbh_adjust,0))/2+adj_bec,0])
		hole_cutter(bar_width,lmbh_adjust+max(lcbh_adjust,0)+ff,90,90,90,90,bcr,depth);
	}
}

module bounded_cells(depth){
	adj_grid_width = grid_width-col_first_trim-col_last_trim;
	adj_grid_height = grid_height-row_first_trim-row_last_trim;
	
	difference(){
		cells(depth);
		difference(){
			translate([grid_x0-20,grid_y0-20,-depth/2])
			cube([grid_width+40,grid_height+40,depth+2*ff]);
			
			translate([grid_x0+col_first_trim+adj_grid_width/2, grid_y0+row_first_trim+adj_grid_height/2,ff])
			hole_cutter(adj_grid_width, adj_grid_height,90,90,90,90,ocr,depth+4*ff);
		}
	}
}

module cells(depth){
	d = (depth > 0) ? depth+2*ff : 0;
	grid_part_w = grid_width/number_of_columns;
	grid_part_h = grid_height/number_of_rows;
	
	cwid = (cell_shape=="rectangular") ? cw : cell_diameter;
	chei = (cell_shape=="rectangular") ? ch : cell_diameter;
	
	for (i = [0:row_count-1]){
		for (j = [0:column_count-1]){
			current_cell = j+1+i*column_count;
			cell_x = grid_x0 + j*grid_part_w + grid_part_w/2;
			cell_y = grid_y0 + i*grid_part_h + grid_part_h/2;
			
			c__x = (j==0 && column_count>1) ? cell_x + col_first_trim/2 : 
				  (j==column_count-1 && column_count > 1) ? cell_x - col_last_trim/2 :
				  (column_count==1) ? cell_x + col_first_trim/2 - col_last_trim/2 :
				   cell_x;
			c__y = (i==0 && row_count>1) ? cell_y + row_first_trim/2 : 
				  (i==row_count-1 && row_count>1) ? cell_y - row_last_trim/2 :
				  (row_count==1) ? cell_y + row_first_trim/2 - row_last_trim/2 :
				   cell_y;
			c__w = (j==0 && column_count>1) ? cwid - col_first_trim :
				  (j==column_count-1 && column_count > 1) ? cwid - col_last_trim :
				  (column_count==1) ? cwid - col_first_trim - col_last_trim :
				  cwid;
			c__h = (i==0 && i!=row_count-1) ? chei - row_first_trim :
				  (i!=0 && i==row_count-1) ? chei - row_last_trim :
				  (i==0 && i==row_count-1) ? chei - row_first_trim - row_last_trim :
				  chei;
				  
			// ignore if this cell is covered
			if (!search(current_cell,c_t_c)){
				// if cell is merged horizontally and rectangular
				if ((search(current_cell,m_cell_h))&&(j!=column_count-1)){			
					translate([c__x+grid_part_w/2,c__y,0])
					hole_cutter(grid_part_w, c__h, cts,cbs,rs_inc_acrylic,rs_inc_acrylic,0,d);	
				}
				// if cell is merged vertically and rectangular
				if((search(current_cell,m_c_v))&&(i!=row_count-1)){
					translate([c__x, c__y+grid_part_h/2, 0])
					hole_cutter(c__w, grid_part_h, cts,cbs,rs_inc_acrylic,rs_inc_acrylic,0,d);	
				}

				//clean up center pyramid if a cell is in both horizontal and vertical merge and next cell is also in the vertical merge and the cell above is in the horizontal merge
				if((search(current_cell,m_cell_h))&&(search(current_cell,m_c_v))&&(search(current_cell+1,m_c_v))&&(search(current_cell+number_of_columns,m_cell_h))){
					translate([c__x+grid_part_w/2, c__y+grid_part_h/2, 0])
					hole_cutter(grid_part_w, grid_part_h, cts,cbs,rs_inc_acrylic,rs_inc_acrylic,0,d);
				}

				//basic, no-merge cell cut these two statements will have no impact if cell has been merged, cell can be any shape
				translate([c__x,c__y,0])
				if (cell_shape=="rectangular"){
					hole_cutter(c__w+ff,c__h+ff,cts,cbs,rs_inc_acrylic,rs_inc_acrylic,ocr,d);
				}
				else{
					hole_cutter(cell_diameter,cell_diameter,cts,cbs,rs_inc_acrylic,rs_inc_acrylic,cell_diameter/2,d);
				}
			}
		}
	}
}

module cell_ridges(){
	grid_part_w = grid_width/number_of_columns;
	grid_part_h = grid_height/number_of_rows;
	
	cwid = (cell_shape=="rectangular") ? cw : cell_diameter;
	chei = (cell_shape=="rectangular") ? ch : cell_diameter;

	for (i = [0:row_count-1]){
		for (j = [0:column_count-1]){
			current_cell = j+1+i*column_count;
			cell_x = grid_x0 + j*grid_part_w + grid_part_w/2;
			cell_y = grid_y0 + i*grid_part_h + grid_part_h/2;

			c__x = (j==0 && column_count>1) ? cell_x + col_first_trim/2 : 
				  (j==column_count-1 && column_count > 1) ? cell_x - col_last_trim/2 :
				  (column_count==1) ? cell_x + col_first_trim/2 - col_last_trim/2 :
				   cell_x;
			c__y = (i==0 && row_count>1) ? cell_y + row_first_trim/2 : 
				  (i==row_count-1 && row_count>1) ? cell_y - row_last_trim/2 :
				  (row_count==1) ? cell_y + row_first_trim/2 - row_last_trim/2 :
				   cell_y;
			c__w = (j==0 && column_count>1) ? cwid - col_first_trim :
				  (j==column_count-1 && column_count > 1) ? cwid - col_last_trim :
				  (column_count==1) ? cwid - col_first_trim - col_last_trim :
				  cwid;
			c__h = (i==0 && i!=row_count-1) ? chei - row_first_trim :
				  (i!=0 && i==row_count-1) ? chei - row_last_trim :
				  (i==0 && i==row_count-1) ? chei - row_first_trim - row_last_trim :
				  chei;
		
			if (search(current_cell,a_r_a)){
				slope_adjust = sat/tan(rs_inc_acrylic);

				translate([c__x,c__y,-kt/2])
				if (cell_shape=="rectangular"){
					rounded_rectangle_wall(c__w+slope_adjust*2-cell_edge_chamfer,c__h+slope_adjust*2-cell_edge_chamfer,ocr,thickness_of_ridge,height_of_ridge+sat);
				}
				else{
					circular_wall(cell_diameter+(slope_adjust)*2-cell_edge_chamfer,thickness_of_ridge,height_of_ridge+sat);
				}
			}
		}
	}
}

module circular_wall(ID,thickness,hgt){
	rotate_extrude($fn=60)
	polygon([[ID/2,0],[ID/2+thickness,0],[ID/2+thickness,hgt-.5],[ID/2+thickness-.5,hgt],[ID/2+.5,hgt],[ID/2,hgt-.5]]);
}

module rounded_rectangle_wall(width,hgt,corner_radius,thickness,hgt2){
	rr_wall1(width,hgt,corner_radius,thickness,hgt2);
	mirror([0,1,0])
	rr_wall1(width,hgt,corner_radius,thickness,hgt2);
	
	rr_wall2(width,hgt,corner_radius,thickness,hgt2);
	mirror([1,0,0])
	rr_wall2(width,hgt,corner_radius,thickness,hgt2);

	rr_corner_wall(width,hgt,corner_radius,thickness,hgt2);
	mirror([1,0,0])
	rr_corner_wall(width,hgt,corner_radius,thickness,hgt2);
	mirror([0,1,0])
	rr_corner_wall(width,hgt,corner_radius,thickness,hgt2);
	mirror([1,0,0])
	mirror([0,1,0])
	rr_corner_wall(width,hgt,corner_radius,thickness,hgt2);
}

module rr_wall1(width,hgt,corner_radius,thickness,hgt2){
	translate([width/2-corner_radius,-hgt/2,0])
	rotate([0,0,-90])
	rotate([90,0,0])
	linear_extrude(height=width-corner_radius*2)
	polygon([[0,0],[thickness,0],[thickness,hgt2-.5],[thickness-.5,hgt2],[.5,hgt2],[0,hgt2-.5]]);
}

module rr_wall2(width,hgt,corner_radius,thickness,hgt2){
	translate([-width/2-thickness,hgt/2-corner_radius,0])
	rotate([90,0,0])
	linear_extrude(height=hgt-corner_radius*2)
	polygon([[0,0],[thickness,0],[thickness,hgt2-.5],[thickness-.5,hgt2],[.5,hgt2],[0,hgt2-.5]]);
}

module rr_corner_wall(width,hgt,corner_radius,thickness,hgt2){
	translate([width/2-corner_radius,hgt/2-corner_radius,0])
	rotate_extrude(angle=90,$fn=60)
	translate([corner_radius,0,0])
	polygon([[0,0],[thickness,0],[thickness,hgt2-.5],[thickness-.5,hgt2],[.5,hgt2],[0,hgt2-.5]]);
}

module hole_cutter(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,radius,depth){
	d = (type_of_keyguard=="3D-Printed") ? depth-cec : depth;
	z = (type_of_keyguard=="3D-Printed") ? -cec/2 : 0;
	
	rad1=min(hole_width/2,hole_height/2,radius);
	
	if(depth>0 && cec>0){
		translate([0,0,z])
		union(){
			cut(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,rad1,d);
			
			if (type_of_keyguard=="3D-Printed"){  // add cell edge chamfer to cutting tool
				l_s = (left_slope>=chamfer_angle_stop || left_slope<0) ? 45 : left_slope;
				r_s = (right_slope>=chamfer_angle_stop || right_slope<0) ? 45 : right_slope;
				t_s = (top_slope>=chamfer_angle_stop || top_slope<0) ? 45 : top_slope;
				b_s = (bottom_slope>=chamfer_angle_stop || bottom_slope<0) ? 45 : bottom_slope;
				
				left = d * tan(90-left_slope);
				right = d * tan(90-right_slope);
				top = d * tan(90-top_slope);
				bottom = d * tan(90-bottom_slope);
				w1 = hole_width+left+right;
				h1 = hole_height+top+bottom;
				
				m1 = min(hole_width,hole_height);
				m2 = min(w1,h1);
				
				rad = (radius>m1/2) ? m2/2 : 
					((hole_width==hole_height && radius<hole_width/2) || (hole_width!=hole_height) && radius!=m1/2) ? radius : m2/2;
				
				radius2 = (radius==0) ? 0 : rad;

				translate([(right-left)/2,(top-bottom)/2,d/2+cec/2])
				cut(w1,h1,t_s,b_s,l_s,r_s,radius2,cec);
			}
		}
	}
	else{
		cut(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,radius,d);
	}
}

module hole_cutter_3(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,radius,depth){
	rad1=min(hole_width/2,hole_height/2,radius);
	cut(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,rad1,depth);
}

module hole_cutter2(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,radius,depth){
	//applies only to 3D-printed keyguards
	l_s = (left_slope>=chamfer_angle_stop || left_slope<0) ? 45 : left_slope;
	r_s = (right_slope>=chamfer_angle_stop || right_slope<0) ? 45 : right_slope;
	t_s = (top_slope>=chamfer_angle_stop || top_slope<0) ? 45 : top_slope;
	b_s = (bottom_slope>=chamfer_angle_stop || bottom_slope<0) ? 45 : bottom_slope;
	
	left = depth * tan(90-left_slope);
	right = depth * tan(90-right_slope);
	top = depth * tan(90-top_slope);
	bottom = depth * tan(90-bottom_slope);
	w1 = hole_width+left+right;
	h1 = hole_height+top+bottom;
	
	m1 = min(hole_width,hole_height);
	m2 = min(w1,h1);
	
	rad = (radius>m1/2) ? m2/2 : 
		((hole_width==hole_height && radius<hole_width/2) || (hole_width!=hole_height) && radius!=m1/2) ? radius : m2/2;
	radius2 = (radius==0) ? 0 : rad;

	d = depth-cec;
	cec1 = (depth>cec) ? cec : depth;
	
	if(cec>0 && depth>0){
		translate([(right-left)/2,(top-bottom)/2,-cec1/2])
		cut(w1,h1,t_s,b_s,l_s,r_s,radius2,cec1);
	}
	
	if(d>0){
		translate([0,0,-d/2-cec])
		cut(hole_width,hole_height,top_slope,bottom_slope,left_slope,right_slope,radius,d);
	}
	
	translate([0,0,10-ff])
	cut(w1+cec1*tan(45)*2,h1+cec1*tan(45)*2,90,90,90,90,radius2,20);

}


module hole_cutter_2d(hole_width,hole_height,radius){
	cut_2d(hole_width,hole_height,radius);
}

module cut(cut_w, cut_h, top_angle, bottom_angle, left_angle, right_angle, radius, thick){
	$fn=60;
	th1 = thick + 2*ff;

	radius1 = (radius==0) ? 0 : radius-ff;
	
	left = th1 * tan(90-left_angle);
	right = th1 * tan(90-right_angle);
	top = th1 * tan(90-top_angle);
	bottom = th1 * tan(90-bottom_angle);
	w1 = cut_w+left+right;
	h1 = cut_h+top+bottom;
	m1 = min(cut_w,cut_h);
	m2 = min(w1,h1);
	
	rad = (radius>m1/2) ? m2/2 : 
		((cut_w==cut_h && radius<cut_w/2) || (cut_w!=cut_h) && radius!=m1/2) ? radius : m2/2;
	
	radius2 = (radius==0) ? 0 : rad-ff;
	
	if (thick > 0){
		translate([0,0,-th1/2-ff])
		hull(){
			linear_extrude(.005)
			offset(r=radius1)
			square([cut_w-2*radius1, cut_h-2*radius1], center = true);
			
			translate([-(cut_w/2-radius2)-left,-(cut_h/2-radius2)-bottom,th1])
			linear_extrude(.005)
			offset(r=radius2)
			square([cut_w-2*radius2+left+right, cut_h-2*radius2+top+bottom],center = false);
		}
	}
	else{
		offset(r=radius1)
		square([cut_w-2*radius1, cut_h-2*radius1], center = true);
	}
}


module cut_2d(cut_w, cut_h, radius){
	$fn=60;
	radius1 = (radius==0) ? 0 : radius-ff;
	
	offset(r=radius1)
	square([cut_w-2*radius1, cut_h-2*radius1], center = true);
}


module create_cell_insert(){
	chamfer = .5;
	btod = Braille_to_opening_distance+1;
	comma_loc = search(",",Braille_text);
	word_one = (len(comma_loc)==0) ? Braille_text : 
				(Braille_text[0]== ",") ? "" : substr(Braille_text,0,comma_loc[0]);
	word_two = (len(comma_loc)==0) ? "" : substr(Braille_text,comma_loc[0]+1);
	binary_text_one = search(word_one,braille_a);
	binary_text_two = search(word_two,braille_a);

	roo = diameter_of_opening/2+2;

	// above below
	bh = bsm * 6.5; //braille height
	v = ch/2;

	BA = (Braille_location=="above opening" && e_t=="");
	BB = (Braille_location=="below opening" && e_t=="");
	BAB = (Braille_location=="above and below opening");
	BAE = (Braille_location=="above opening" && e_t!="");
	BBE = (Braille_location=="below opening" && e_t!="");

	elements_v = (BAB) ? bh*2+btod*2+roo*2 :
				 (BA || BB) ? bh+btod+roo*2 : 0;
	b_v = v-elements_v/2;

	z1 = (BA || BAB) ? v-bh/2-b_v :
		 (BB) ? -v+bh/2+b_v : 
		 (BBE) ? -v+(v-roo)/2 :
		 (BAE) ? v-(v-roo)/2 : 0;
		 
	z2 = (BAB) ? -v+b_v+bh/2 :
		 (BAE) ? -v+(v-roo)/2 :
		 (BBE) ? v-(v-roo)/2 : 0;
		 
	o_z = (BAB || BAE || BBE) ? 0 : 
		  (BA) ? -v+roo+b_v :
		  (BB) ? v-roo-b_v : 0;

	//left right
	hacw = cw/2;

	BL = (Braille_location=="left of opening" && e_t=="");
	BR = (Braille_location=="right of opening" && e_t=="");
	BLR = (Braille_location=="left and right of opening");
	BLE = (Braille_location=="left of opening" && e_t!="");
	BRE = (Braille_location=="right of opening" && e_t!="");

	braille_letters1 = len(word_one);
	braille_letters2 = len(word_two);
	base_braille_width1 = (braille_letters1 == 1) ? 4 : (braille_letters1-1)*6.1 + 4;
	base_braille_width2 = (braille_letters2 == 1) ? 4 : (braille_letters2-1)*6.1 + 4;
	w1 = bsm * base_braille_width1;
	w2 = bsm * base_braille_width2;

	elements_h = (BL || BR) ? w1+btod+roo*2 : 
				 (BLR) ? w1+w2+btod*2+roo*2 : 0;
				 
	b_h = hacw-elements_h/2;

	x1 = (BL || BLR) ? -hacw+b_h+w1/2 : 
		 (BR) ? hacw-b_h-w1/2 : 
		 (BLE) ? -hacw+(hacw-roo)/2 :
		 (BRE) ? hacw-(hacw-roo)/2 : 0;
				
	x2 = (BLR) ? hacw-b_h-w2/2 :
		 (BLE) ? hacw-(hacw-roo)/2 : 
		 (BRE) ? -hacw+(hacw-roo)/2 : 0;

	o_x = (BLE || BRE) ? 0 :
		  (BL) ? hacw-b_h-roo :
		  (BLR) ? -hacw+b_h+w1+btod+roo :
		  (BR) ? -hacw+b_h+roo : 0;
	
	s_f=insert_tightness_of_fit/10;
			
	if (BA || BB || BAB || BAE || BBE){
		difference(){
			rotate([90,0,0])
			if (cell_shape=="rectangular"){
				chamfered_shape(cw+s_f/2,insert_thickness,ch+s_f/2,chamfer,cell_corner_radius);
			}
			else{
				chamfered_shape(cw+s_f/2,insert_thickness,ch+s_f/2,chamfer,cell_corner_radius);
			}
			
			if(add_circular_opening=="yes"){
				translate([0,0,o_z])
				rotate([90,0,0])
				cylinder(r1=diameter_of_opening/2,r2=diameter_of_opening/2 + 2,h=insert_thickness+2,center=true);
			}
			
			if (BAE || BBE){
				translate([0,-.1,z2])
				add_engraved_text("center");
			}
		}

		translate([0,0,z1])
		if(word_one !="") add_braille(binary_text_one);
		
		if (BAB){			
			translate([0,0,z2])
			if(word_two !="") add_braille(binary_text_two);
		}
	}
	else {
		difference(){
			rotate([90,0,0])
			chamfered_shape(cw+s_f/2,insert_thickness,ch+s_f/2,chamfer,cell_corner_radius);
			
			if(add_circular_opening=="yes"){
				translate([o_x,0,0])
				rotate([90,0,0])
				cylinder(r1=diameter_of_opening/2,r2=diameter_of_opening/2 + 2,h=insert_thickness+2,center=true);
			}
			
			if (BLE || BRE){
				translate([x2,-.1,0])
				add_engraved_text("center");
			}
		}

		translate([x1,0,0])
		if(word_one !="") add_braille(binary_text_one);
		
		if (BLR){
			translate([x2,0,0])
			if(word_two !="") add_braille(binary_text_two);
		}

	}
	
	// // // if (Bliss_concept!=""){
		// // // Bliss_graphic();
	// // // }
	
}

module cut_screen_openings(s_o,depth){
	for(i = [0 : len(s_o)-1]){
		opening = s_o[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:top slope, 7:bottom slope, 8:left slope, 9:right slope, 10:corner_radius, 11:other
		opening_ID = opening[0];
		opening_x = opening[1];
		opening_y = opening[2];
		opening_width = (opening[3]==undef) ? 0 : opening[3];
		opening_height = opening[4];
		opening_shape = opening[5];
		opening_top_slope = (type_of_keyguard=="Laser-Cut" || (opening[6]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[6];
		opening_bottom_slope = (type_of_keyguard=="Laser-Cut" || (opening[7]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[7];
		opening_left_slope = (type_of_keyguard=="Laser-Cut" || (opening[8]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[8];
		opening_right_slope = (type_of_keyguard=="Laser-Cut" || (opening[9]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[9];
		opening_corner_radius = opening[10];
		opening_other = opening[11];
		opening_width_mm = (unit_of_measure_for_screen=="px") ? opening_width * mpp : opening_width;
		opening_height_mm = (unit_of_measure_for_screen=="px") ? opening_height * mpp : opening_height;
		opening_x_mm = (unit_of_measure_for_screen=="px") ? opening_x * mpp : opening_x;

		o_s = opening_shape;		
		o_c_r = (o_s=="oa1" || o_s=="oa2" || o_s=="oa3" || "oa4") ? opening_corner_radius : min(opening_corner_radius,min(opening_width,opening_height)/2);
		opening_corner_radius_mm = (unit_of_measure_for_screen=="px") ? o_c_r * mpp : o_c_r;
		
		if(depth>0){
			if(opening_ID!="#"){
				if (starting_corner_for_screen_measurements == "upper-left"){
					opening_y_mm = (unit_of_measure_for_screen=="px") ? (shp - opening_y) * mpp : (shm - opening_y);
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					cut_opening(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, opening_corner_radius_mm, opening_other,depth,"screen");
				}
				else{
					opening_y_mm = (unit_of_measure_for_screen=="px") ? opening_y * mpp : opening_y;
					
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					cut_opening(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, opening_corner_radius_mm, opening_other,depth,"screen");
				}
			}
			else{
				if (starting_corner_for_screen_measurements == "upper-left"){
					opening_y_mm = (unit_of_measure_for_screen=="px") ? (shp - opening_y) * mpp : (shm - opening_y);
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					#cut_opening(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, opening_corner_radius_mm, opening_other,depth,"screen");
				}
				else{
					opening_y_mm = (unit_of_measure_for_screen=="px") ? opening_y * mpp : opening_y;
					
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					#cut_opening(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, opening_corner_radius_mm, opening_other,depth,"screen");
				}
			}
		}
		else{
			if(opening_ID!="#"){
				if (starting_corner_for_screen_measurements == "upper-left"){
					opening_y_mm = (unit_of_measure_for_screen=="px") ? (shp - opening_y) * mpp : (shm - opening_y);
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					cut_opening_2d(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_corner_radius_mm);
				}
				else{
					opening_y_mm = (unit_of_measure_for_screen=="px") ? opening_y * mpp : opening_y;
					
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					cut_opening_2d(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_corner_radius_mm);
				}
			}
			else{
				if (starting_corner_for_screen_measurements == "upper-left"){
					opening_y_mm = (unit_of_measure_for_screen=="px") ? (shp - opening_y) * mpp : (shm - opening_y);
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					#cut_opening_2d(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_corner_radius_mm);
				}
				else{
					opening_y_mm = (unit_of_measure_for_screen=="px") ? opening_y * mpp : opening_y;
					
					translate([sx0+opening_x_mm,sy0+opening_y_mm,0])
					#cut_opening_2d(opening_width_mm, opening_height_mm, opening_shape, opening_top_slope, opening_corner_radius_mm);
				}
			}
		}
	}
}

module cut_case_openings(c_o,depth){

	for(i = [0 : len(c_o)-1]){
		opening = c_o[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:top slope, 7:bottom slope, 8:left slope, 9:right slope, 10:corner_radius, 11:other
		opening_ID = opening[0];
		opening_x = opening[1];
		opening_y = opening[2];
		opening_width = opening[3];
		opening_height = opening[4];
		opening_shape = opening[5];
		opening_top_slope = (type_of_keyguard=="Laser-Cut" || (opening[6]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[6];
		opening_bottom_slope = (type_of_keyguard=="Laser-Cut" || (opening[7]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[7];
		opening_left_slope = (type_of_keyguard=="Laser-Cut" || (opening[8]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[8];
		opening_right_slope = (type_of_keyguard=="Laser-Cut" || (opening[9]==0 && opening_shape!="svg" && opening_shape!="ridge" && opening_shape!="ttext" && opening_shape!="btext")) ? 90 : opening[9];
		opening_corner_radius = opening[10];
		opening_other = opening[11];

		o_c_r = (opening_width>0 && opening_height>0) ? min(opening_corner_radius,min(opening_width,opening_height)/2) : opening_corner_radius;

		translate([cox0+opening_x,coy0+opening_y,0])
		if(depth>0){
			if(opening_ID!="#"){
				cut_opening(opening_width, opening_height, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, o_c_r, opening_other,depth, "keyguard");
			}
			else{
				#cut_opening(opening_width, opening_height, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, o_c_r, opening_other,depth, "keyguard");
			}
		}
		else{
			if(opening_ID!="#"){
				cut_opening_2d(opening_width, opening_height, opening_shape, opening_top_slope,  o_c_r);
			}
			else{
				#cut_opening_2d(opening_width, opening_height, opening_shape, opening_top_slope,  o_c_r);
			}
		}
	}
	
}

module cut_tablet_openings(t_o,depth){

	for(i = [0 : len(t_o)-1]){
		opening = t_o[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:top slope, 7:bottom slope, 8:left slope, 9:right slope, 10:corner_radius, 11:other
		
		opening_ID = opening[0];
		opening_x = opening[1];
		opening_y = opening[2];
		opening_width = opening[3];
		opening_height = opening[4];
		opening_shape = opening[5];
		opening_top_slope = (opening[6]==0 || type_of_keyguard=="Laser-Cut") ? 90 : opening[6];
		opening_bottom_slope = (opening[7]==0 || type_of_keyguard=="Laser-Cut") ? 90 : opening[7];
		opening_left_slope = (opening[8]==0 || type_of_keyguard=="Laser-Cut") ? 90 : opening[8];
		opening_right_slope = (opening[9]==0 || type_of_keyguard=="Laser-Cut") ? 90 : opening[9];
		opening_corner_radius = opening[10];
		opening_other = opening[11];
		
		o_c_r = (opening_width>0 && opening_height>0) ? min(opening_corner_radius,min(opening_width,opening_height)/2) : opening_corner_radius;
		
		trans = (orientation=="landscape") ? [tx0+opening_x,ty0+opening_y,0] : [tx0+opening_y,-ty0-opening_x,0];
		translate(trans)
		if(opening_ID!="#"){
			cut_opening(opening_width, opening_height, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, o_c_r, opening_other,depth, "tablet");
		}
		else{
			#cut_opening(opening_width, opening_height, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, o_c_r, opening_other,depth, "tablet");
		}
	}
}
module cut_als_openings(a_o,depth){

	for(i = [0 : len(a_o)-1]){
		opening = a_o[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:top slope, 7:bottom slope, 8:left slope, 9:right slope, 10:corner_radius, 11:other
		
		opening_ID = opening[0];
		opening_x = opening[1];
		opening_y = opening[2];
		opening_width = opening[3];
		opening_height = opening[4];
		opening_shape = opening[5];
		opening_top_slope = (opening[6]==0) ? 90 : opening[6];
		opening_bottom_slope = (opening[7]==0) ? 90 : opening[7];
		opening_left_slope = (opening[8]==0) ? 90 : opening[8];
		opening_right_slope = (opening[9]==0) ? 90 : opening[9];
		opening_corner_radius = opening[10];
		opening_other = opening[11];
		
		o_c_r = (opening_width>0 && opening_height>0) ? min(opening_corner_radius,min(opening_width,opening_height)/2) : opening_corner_radius;
		
		trans = (orientation=="landscape") ? [tx0+opening_x,ty0+opening_y,0] : [tx0+opening_y,-ty0-opening_x,0];
		translate(trans)
		if(opening_ID!="#"){
			cut_opening(opening_width, opening_height, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, o_c_r, opening_other,depth, "tablet");
		}
		else{
			#cut_opening(opening_width, opening_height, opening_shape, opening_top_slope, opening_bottom_slope, opening_left_slope, opening_right_slope, o_c_r, opening_other,depth, "tablet");
		}
	}
}

module cut_opening(cut_width, cut_height, shape, top_slope, bottom_slope, left_slope, right_slope, corner_radius, other, depth, type){

	other_number = is_num(other);
	other_pos = other_number && other>=0;
	other_neg = other_number && other<0;
	
	offset = (type_of_keyguard=="3D-Printed" && other_number && other_pos && type=="screen") ? depth - other : 
			 (type_of_keyguard=="3D-Printed" && other_number && other_pos && type=="keyguard") ? (depth - other)/2 : 
			 (type_of_keyguard=="3D-Printed" && other_number && other_neg && type=="screen") ? -depth-other :
			 (type_of_keyguard=="3D-Printed" && other_number && other_neg && type=="keyguard") ? -(depth+other)/2 :
			 0;
			 			 		
	dep = (type_of_keyguard=="3D-Printed" && other_number && other_pos) ? other : 
		  (type_of_keyguard=="3D-Printed" && other_number && other_neg) ? -other :
	      depth;
		    
	flip = (other_number && other_neg) ? true: false;
		  

	if (shape=="r"){
		if (cut_width > 0 && cut_height > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat+offset/2 : offset;
			if (flip){
				translate([cut_width/2,cut_height/2,trans])
				rotate([0,180,0])
				hole_cutter_3(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,0,dep);
			}
			else{
				translate([cut_width/2,cut_height/2,trans])
				hole_cutter(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,0,dep);
			}
		}
	}
	else if (shape=="cr"){
		if (cut_width > 0 && cut_height > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat+offset/2 : offset;
			if (flip){
				translate([0,0,trans])
				rotate([0,180,0])
				hole_cutter_3(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,0,dep);
			}
			else{
				translate([0,0,trans])
				hole_cutter(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,0,dep);
			}
		}
	}
	else if (shape=="c"){
		if (cut_height > 0){
			if (type_of_keyguard=="3D-Printed"){
				trans = (type=="screen") ? -sat/2-kt/2+sat+offset/2 : offset;
				if (flip){
					translate([0,0,trans])
					rotate([0,180,0])
					hole_cutter_3(cut_height,cut_height,top_slope,bottom_slope,left_slope,right_slope,cut_height/2,dep);
				}
				else{
					translate([0,0,trans])
					hole_cutter(cut_height,cut_height,top_slope,bottom_slope,left_slope,right_slope,cut_height/2,dep);
				}
			}
			else{
				//need to accomodate ALS sensors and other circular openings if slope is non-90 degrees
				aoa = sat_incl_acrylic/tan(top_slope);
				hole_cutter(cut_height+aoa*2,cut_height+aoa*2,90,90,90,90,(cut_height+aoa*2)/2,dep);
			}
		}
	}
	else if (shape=="hd"){
		if (cut_width > 0 && cut_height > 0){
			m = min(cut_width,cut_height);
			trans = (type=="screen") ? -sat/2-kt/2+sat+offset/2 : offset;
			if (flip){
				translate([0,0,trans])
				rotate([0,180,0])
				hole_cutter_3(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,m/2,dep);
			}
			else{
				translate([0,0,trans])
				hole_cutter(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,m/2,dep);
			}
		}
	}
	else if (shape=="rr"){
		if (cut_width > 0 && cut_height > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat+offset/2 : offset;
			if (flip){
				translate([cut_width/2,cut_height/2,trans])
				rotate([0,180,0])
				hole_cutter_3(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,corner_radius,dep);
			}
			else{
				translate([cut_width/2,cut_height/2,trans])
				hole_cutter(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,corner_radius,dep);
			}
		}
	}	
	else if (shape=="crr"){
		if (cut_width > 0 && cut_height > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat+offset/2 : offset;
			if (flip){
				translate([0,0,trans])
				rotate([0,180,0])
				hole_cutter_3(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,corner_radius,dep);
			}
			else{
				translate([0,0,trans])
				hole_cutter(cut_width,cut_height,top_slope,bottom_slope,left_slope,right_slope,corner_radius,dep);
			}
		}
	}	
	else if (shape=="oa1"){
		if (corner_radius > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat : 0;
			translate([-corner_radius,-corner_radius,trans])
			create_cutting_tool(0, corner_radius*2, depth+0.05, top_slope, "oa");
		}
	}
	else if (shape=="oa2"){
		if (corner_radius > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat : 0;
			translate([-corner_radius,corner_radius,trans])
			create_cutting_tool(-90, corner_radius*2, depth+0.05, top_slope, "oa");	
		}
	}
	else if (shape=="oa3"){
		if (corner_radius > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat : 0;
			translate([corner_radius,corner_radius,trans])
			create_cutting_tool(180, corner_radius*2, depth+0.05, top_slope, "oa");
		}
	}
	else if (shape=="oa4"){
		if (corner_radius > 0){
			trans = (type=="screen") ? -sat/2-kt/2+sat : 0;
			translate([corner_radius,-corner_radius,trans])
			create_cutting_tool(90, corner_radius*2, depth+0.05, top_slope, "oa");	
		}
	}
	else if (shape=="ttext"){
		f_s = 
		    (bottom_slope==1)? "Liberation Sans:style=Bold"
		  : (bottom_slope==2)? "Liberation Sans:style=Italic"
		  : (bottom_slope==3)? "Liberation Sans:style=Bold Italic"
		  : "Liberation Sans";
		  
		// "left", "center" and "right"
		horiz = 
			(left_slope==1)? "left"
		  : (left_slope==2)? "center"
		  : (left_slope==3)? "right"
		  : "left";
		  
		// "top", "center", "baseline" and "bottom"
		vert = 
			(right_slope==1)? "bottom"
		  : (right_slope==2)? "baseline"
		  : (right_slope==3)? "center"
		  : (right_slope==4)? "top"
		  : "bottom";
		  
		if (cut_height > 0){
			trans = (type=="screen") ? corner_radius-kt/2+sat-.005 : kt/2+corner_radius-ff;
			translate([0,0,trans])
			rotate([0,0,top_slope])
			linear_extrude(height = -corner_radius+.01)
			text(str(other),font = f_s, size=cut_height,valign=vert,halign=horiz);
		}
	}
	else if (shape=="btext" && type_of_keyguard=="3D-Printed"){
		f_s = 
			(bottom_slope==1)? "Liberation Sans:style=Bold"
		  : (bottom_slope==2)? "Liberation Sans:style=Italic"
		  : (bottom_slope==3)? "Liberation Sans:style=Bold Italic"
		  : "Liberation Sans";
		  
		// "left", "center" and "right"
		horiz = 
			(left_slope==1)? "left"
		  : (left_slope==2)? "center"
		  : (left_slope==3)? "right"
		  : "left";
		  
		// "top", "center", "baseline" and "bottom"
		vert = 
			(right_slope==1)? "bottom"
		  : (right_slope==2)? "baseline"
		  : (right_slope==3)? "center"
		  : (right_slope==4)? "top"
		  : "bottom";
		if (cut_height > 0 && corner_radius < 0){
			trans = (type=="screen") ? -corner_radius-kt/2-ff : -corner_radius-kt/2+ff;
			translate([0,0,trans])
			rotate([0,180,0])
			rotate([0,0,top_slope])
			linear_extrude(height=-corner_radius+ff*2)
			text(str(other),font = f_s, size=cut_height,valign=vert,halign=horiz);
		}
	}
	else if (shape=="svg" && type_of_keyguard=="3D-Printed"){
		if (cut_width > 0 && cut_height > 0 && corner_radius<0){
			trans = (type=="screen") ? corner_radius-kt/2+sat-ff : kt/2+corner_radius;
			translate([0,0,trans])
			rotate([0,0,-top_slope])
			resize([cut_width,cut_height,-corner_radius+ff*2])
			linear_extrude(height=1)
			offset(delta = .005)
			import(file = other,center=true);
		}
	}
}


module cut_opening_2d(cut_width, cut_height, shape, top_slope=0, corner_radius=0){

	if (shape=="r"){
		if (cut_width > 0 && cut_height > 0){
			translate([cut_width/2,cut_height/2])
			hole_cutter_2d(cut_width,cut_height,0);
		}
	}
	else if (shape=="cr"){
		if (cut_width > 0 && cut_height > 0){
			translate([0,0])
			hole_cutter_2d(cut_width,cut_height,0);
		}
	}
	else if (shape=="c"){
		if (cut_height > 0){
			aoa = sat_incl_acrylic/tan(top_slope);
			hole_cutter_2d(cut_height+aoa*2,cut_height+aoa*2,(cut_height+aoa*2)/2);
		}
	}
	else if (shape=="hd"){
		if (cut_width > 0 && cut_height > 0){
			m = min(cut_width,cut_height);
			translate([0,0])
			hole_cutter_2d(cut_width,cut_height,m/2);
		}
	}
	else if (shape=="rr"){
		if (cut_width > 0 && cut_height > 0){
			translate([cut_width/2,cut_height/2])
			hole_cutter_2d(cut_width,cut_height,corner_radius);
		}
	}	
	else if (shape=="crr"){
		if (cut_width > 0 && cut_height > 0){
			translate([0,0])
			hole_cutter_2d(cut_width,cut_height,corner_radius);
		}
	}	
	else if (shape=="oa1"){
		if (corner_radius > 0){
			translate([-corner_radius,-corner_radius])
			create_cutting_tool_2d(0, corner_radius*2);
		}
	}
	else if (shape=="oa2"){
		if (corner_radius > 0){
			translate([-corner_radius,corner_radius])
			create_cutting_tool_2d(-90, corner_radius*2);	
		}
	}
	else if (shape=="oa3"){
		if (corner_radius > 0){
			translate([corner_radius,corner_radius])
			create_cutting_tool_2d(180, corner_radius*2);
		}
	}
	else if (shape=="oa4"){
		if (corner_radius > 0){
			translate([corner_radius,-corner_radius])
			create_cutting_tool_2d(90, corner_radius*2);	
		}
	}
}

module adding_plastic(additions,where){
	for(i = [0 : len(additions)-1]){
		addition = additions[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:top slope, 7:bottom slope, 8:left slope, 9:right slope, 10:corner_radius, 11:other
		
		addition_ID = addition[0];
		addition_x = addition[1];
		addition_y = addition[2];
		addition_width = addition[3];
		addition_height = addition[4];
		addition_shape = addition[5];
		addition_top_slope = addition[6];
		addition_bottom_slope = addition[7];
		addition_left_slope = addition[8];
		addition_right_slope = addition[9];
		addition_corner_radius = addition[10];
		addition_other = addition[11];
		
		x0 = (where=="screen") ? sx0 : cox0;
		y0 = (where=="screen") ? sy0 : coy0;
		
		trans = (where=="screen") ? -kt/2+sat : 
		        (where=="case" && generate=="keyguard") ? kt/2 :
				keyguard_frame_thickness/2;
		
		if (addition_shape == "bump" || addition_shape == "hridge" || addition_shape == "vridge" || addition_shape == "cridge" || addition_shape == "rridge" || addition_shape == "crridge" || addition_shape == "ridge" || addition_shape == "aridge1" || addition_shape == "aridge2" || addition_shape == "aridge3" || addition_shape == "aridge4" || addition_shape == "svg" || addition_shape == "ttext") {
	
			addition_width_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_width * mpp : addition_width;
			addition_height_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_height * mpp : addition_height;
			addition_x_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_x * mpp : addition_x;
			addition_corner_radius_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_corner_radius * mpp : addition_corner_radius;
			addition_top_slope_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_top_slope * mpp : addition_top_slope;
			addition_bottom_slope_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_bottom_slope * mpp : addition_bottom_slope;

			if(addition_ID!="#"){
				if (starting_corner_for_screen_measurements == "upper-left" && where=="screen"){
					addition_y_mm = (unit_of_measure_for_screen=="px") ? (shp - addition_y) * mpp : (shm - addition_y);
					translate([x0+addition_x_mm,y0+addition_y_mm,trans-ff])
					place_addition(addition_width_mm, addition_height_mm, addition_shape, addition_top_slope, addition_top_slope_mm, addition_bottom_slope, addition_bottom_slope_mm, addition_left_slope, addition_right_slope, addition_corner_radius_mm, addition_other);
				}
				else{
					addition_y_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_y * mpp : addition_y;
					
					translate([x0+addition_x_mm,y0+addition_y_mm,trans-ff])
					place_addition(addition_width_mm, addition_height_mm, addition_shape, addition_top_slope, addition_top_slope_mm, addition_bottom_slope, addition_bottom_slope_mm, addition_left_slope, addition_right_slope, addition_corner_radius_mm, addition_other);
				}
			}
			else{
				if (starting_corner_for_screen_measurements == "upper-left" && where=="screen"){
					addition_y_mm = (unit_of_measure_for_screen=="px") ? (shp - addition_y) * mpp : (shm - addition_y);
					translate([x0+addition_x_mm,y0+addition_y_mm,trans-ff])
					#place_addition(addition_width_mm, addition_height_mm, addition_shape, addition_top_slope, addition_top_slope_mm, addition_bottom_slope, addition_bottom_slope_mm, addition_left_slope, addition_right_slope, addition_corner_radius_mm, addition_other);
				}
				else{
					addition_y_mm = (unit_of_measure_for_screen=="px" && where=="screen") ? addition_y * mpp : addition_y;
					
					translate([x0+addition_x_mm,y0+addition_y_mm,trans-ff])
					#place_addition(addition_width_mm, addition_height_mm, addition_shape, addition_top_slope, addition_top_slope_mm, addition_bottom_slope, addition_bottom_slope_mm, addition_left_slope, addition_right_slope, addition_corner_radius_mm, addition_other);
				}
			}
		}
	}
}

module place_addition(addition_width, addition_height, shape, top_slope, top_slope_mm, bottom_slope, bottom_slope_mm, left_slope, right_slope, corner_radius, other){
	if (shape=="bump"){
		if(addition_width>0){
			difference(){
				sphere(d=addition_width,$fn=40);
				translate([0,0,-addition_width])
				cube([addition_width*2, addition_width*2,addition_width*2],center=true);
			}
		}
	}
	else if (shape=="hridge"){
		if(addition_width>=1 && bottom_slope_mm>=.1 && top_slope_mm>=.1){
			ridge(addition_width, bottom_slope_mm, top_slope_mm,0);
		}
	}	
	else if (shape=="vridge"){
		if(addition_height>=1 && bottom_slope_mm>=.1 && top_slope_mm>=.1){
			ridge(addition_height, bottom_slope_mm, top_slope_mm,90);
		}
	}
	else if (shape=="ridge"){
		if(addition_width>=1 && bottom_slope_mm>=.1 && top_slope_mm>=.1){
			ridge(addition_width, bottom_slope_mm, top_slope_mm,left_slope);
		}
	}
	else if (shape=="aridge1"){
		if(corner_radius>=1 && bottom_slope>=.1 && top_slope>=.1){
			adj = corner_radius;
			translate([-adj,-adj,0])
			rotate([0,0,0])
			aridge(corner_radius, bottom_slope, top_slope);
		}
	}
	else if (shape=="aridge2"){
		if(corner_radius>=1 && bottom_slope>=.1 && top_slope>=.1){
			adj = corner_radius;
			translate([-adj,adj,0])
			rotate([0,0,-90])
			aridge(corner_radius, bottom_slope, top_slope);
		}
	}
	else if (shape=="aridge3"){
		if(corner_radius>=1 && bottom_slope>=.1 && top_slope>=.1){
			adj = corner_radius;
			translate([adj,adj,0])
			rotate([0,0,180])
			aridge(corner_radius, bottom_slope, top_slope);
		}
	}
	else if (shape=="aridge4"){
		if(corner_radius>=1 && bottom_slope>=.1 && top_slope>=.1){
			adj = corner_radius;
			translate([adj,-adj,0])
			rotate([0,0,90])
			aridge(corner_radius, bottom_slope, top_slope);
		}
	}
	else if (shape=="cridge"){
		if(addition_height>=1 && bottom_slope>=.1 && top_slope>=.1){
			translate([0,0,-sata])
			circular_wall(addition_height,bottom_slope_mm,top_slope_mm+sata);
		}
	}
	else if (shape=="rridge"){
		if(addition_height>=1 && bottom_slope>=.1 && top_slope>=.1){
			translate([addition_width/2,addition_height/2,-sata])
			rounded_rectangle_wall(addition_width,addition_height,corner_radius,bottom_slope_mm,top_slope_mm+sata);
		}
	}
	else if (shape=="crridge"){
		if(addition_height>=1 && bottom_slope>=.1 && top_slope>=.1){
			translate([0,0,-sata])
			rounded_rectangle_wall(addition_width,addition_height,corner_radius,bottom_slope_mm,top_slope_mm+sata);
		}
	}
	else if (shape=="svg"){
		if(addition_height>0 && addition_width>0 && corner_radius>0){
			rotate([0,0,-top_slope])
			resize([addition_width,addition_height,corner_radius])
			linear_extrude(height=corner_radius)
			offset(delta = .005)
			import(file = other,center=true);
		}
	}	
	else if (shape=="ttext"){
		f_s = 
			(bottom_slope==1)? "Liberation Sans:style=Bold"
		  : (bottom_slope==2)? "Liberation Sans:style=Italic"
		  : (bottom_slope==3)? "Liberation Sans:style=Bold Italic"
		  : "Liberation Sans";
		  
		// "left", "center" and "right"
		horiz = 
			(left_slope==1)? "left"
		  : (left_slope==2)? "center"
		  : (left_slope==3)? "right"
		  : "left";
		  
		// "top", "center", "baseline" and "bottom"
		vert = 
			(right_slope==1)? "bottom"
		  : (right_slope==2)? "baseline"
		  : (right_slope==3)? "center"
		  : (right_slope==4)? "top"
		  : "bottom";
		  
		if(addition_height>0 && corner_radius>0){
			rotate([0,0,top_slope])
			linear_extrude(height=corner_radius)
			text(str(other),font = f_s, size=addition_height,valign=vert,halign=horiz);
		}
	}	
}

module hridge(length, thickness, hi,rot){
	hite = hi + sata;
	rotate([0,0,rot])
	translate([0,-thickness/2,-sata])
	difference(){
		translate([0,0,0])
		rotate([90,0,0])
		rotate([0,90,0])
		linear_extrude(height=length)
		polygon([[0,0],[thickness,0],[thickness,hite-.5],[thickness-.5,hite],[.5,hite],[0,hite-.5]]);
		
		translate([0-ff,thickness,hite-.5+ff])
		rotate([90,0,0])
		linear_extrude(height=thickness)
		polygon([[0,0],[.5,.5],[0,.5]]);
	
		translate([length+ff,thickness,hite-.5+ff])
		rotate([90,0,0])
		linear_extrude(height=thickness)
		polygon([[0,0],[-.5,.5],[0,.5]]);
	}
}

module vridge(length, thickness, hi){
	hite = hi + sata;
	translate([thickness/2,0,-sata])
	difference(){
		rotate([0,0,180])
		rotate([90,0,0])
		linear_extrude(height=length)
		polygon([[0,0],[thickness,0],[thickness,hite-.5],[thickness-.5,hite],[.5,hite],[0,hite-.5]]);
		
		translate([0,length+ff,hite-.5+ff])
		rotate([0,0,-90])
		rotate([90,0,0])
		linear_extrude(height=thickness)
		polygon([[0,0],[.5,.5],[0,.5]]);
	
		translate([0,0-ff,hite-.5+ff])
		rotate([0,0,-90])
		rotate([90,0,0])
		linear_extrude(height=thickness)
		polygon([[0,0],[-.5,.5],[0,.5]]);
	}
}

module ridge(length, thickness, hi,rot){
	hite = hi + sata;
	rotate([0,0,rot])
	translate([0,-thickness/2,-sata])
	difference(){
		translate([0,0,0])
		rotate([90,0,0])
		rotate([0,90,0])
		linear_extrude(height=length)
		polygon([[0,0],[thickness,0],[thickness,hite-.5],[thickness-.5,hite],[.5,hite],[0,hite-.5]]);
		
		translate([0-ff,thickness,hite-.5+ff])
		rotate([90,0,0])
		linear_extrude(height=thickness)
		polygon([[0,0],[.5,.5],[0,.5]]);
	
		translate([length+ff,thickness,hite-.5+ff])
		rotate([90,0,0])
		linear_extrude(height=thickness)
		polygon([[0,0],[-.5,.5],[0,.5]]);
	}
}

module aridge(radius, thickness, hi){
	hite = hi + sata;
	translate([-1,-1,-sata])
	difference(){
		translate([-thickness+1,-thickness+1,0])
		rounded_rectangle_wall((radius+thickness)*2,(radius+thickness)*2,radius,thickness,hite);
	
		translate([0,-(radius+thickness)*2,hite/2])
		cube([(radius+thickness)*8,(radius+thickness)*4,hite+2],center=true);
		
		translate([-(radius+thickness)*2,0,hite/2])
		cube([(radius+thickness)*4,(radius+thickness)*8,hite+2],center=true);
	}
}

module create_clip(clip_reach,clip_width){
	base_thickness = 4;
	clip_thickness = 3;
	strap_cut = clip_width-4;

	difference(){
		union(){
			//base leg
			translate([-clip_bottom_length,-base_thickness,0])
			cube([clip_bottom_length+clip_thickness,base_thickness,clip_width]);

			//vertical leg
			translate([0,0,0])
			cube([clip_thickness,case_thick,clip_width]);

			//reach leg
			translate([-clip_reach,case_thick,0])
			cube([clip_reach+clip_thickness,clip_thickness,clip_width]);

			//spur
			translate([-clip_reach,case_thick,0])
			linear_extrude(height = clip_width)
			polygon(points=[[0,0],[1,-3],[3,-3],[2,0]]);
		}

		//chamfers for short edges of reach leg
		translate([clip_thickness-2,case_thick+clip_thickness-2,-ff])
		linear_extrude(height = clip_width + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([-clip_reach-ff,case_thick+clip_thickness-2,-ff])
		linear_extrude(height = clip_width + ff*2)
		polygon(points=[[0,0],[0,2.1],[2.1,2.1]]);

		//chamfers for vertical leg
		translate([1,-base_thickness-ff,2])
		rotate([-90,0,0])
		linear_extrude(height = base_thickness+case_thick+clip_thickness + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([1,-base_thickness-ff,clip_width+ff])
		rotate([-90,0,0])
		linear_extrude(height = base_thickness+case_thick+clip_thickness + ff*2)
		polygon(points=[[0,0],[2.1,0],[2.1,2.1]]);

		//chamfers for long edges of reach leg
		translate([-clip_reach,case_thick+clip_thickness-2,2-ff])
		rotate([0,90,0])
		linear_extrude(height = clip_reach+clip_thickness + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([clip_thickness,case_thick+clip_thickness+ff,clip_width-2])
		rotate([0,-90,0])
		linear_extrude(height = clip_reach+clip_thickness + ff*2)
		polygon(points=[[0,0],[2.1,0],[2.1,-2.1]]);
		
		//recess for bumper
		if (clip_bottom_length>=30){
			translate([-8+clip_thickness,-base_thickness+1,clip_width/2])
			rotate([90,0,0])
			cylinder(d=11,h=1.05);
		}

		//slots for strap
		translate([-clip_bottom_length+7.5-ff,0,clip_width/2])
		union(){
			translate([0,-5,0])
			cube([15,2,strap_cut],center=true);
			
			translate([0,0,0])
			cube([15,2,strap_cut],center=true);
			
			translate([-2.5,-3,0])
			cube([5,6,strap_cut],center=true);
			
			translate([5,-3,0])
			cube([5,6,strap_cut],center=true);
		}
	}
}

module create_mini_clip1(clip_reach,clip_width){
	base_thickness = 4;
	clip_thickness = 5;
	strap_cut = clip_width-4;

	difference(){
		union(){
			//vertical leg
			translate([0,0,0])
			cube([clip_thickness,case_thick,clip_width]);

			//reach leg
			translate([-clip_reach,case_thick,0])
			cube([clip_reach+clip_thickness,clip_thickness,clip_width]);

			//spur
			translate([-clip_reach,case_thick,0])
			linear_extrude(height = clip_width)
			polygon(points=[[0,0],[1,-3],[3,-3],[2,0]]);
		}

		//chamfers for short edges of reach leg
		translate([clip_thickness-2,case_thick+clip_thickness-2,-ff])
		linear_extrude(height = clip_width + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([-clip_reach-ff,case_thick+clip_thickness-2,-ff])
		linear_extrude(height = clip_width + ff*2)
		polygon(points=[[0,0],[0,2.1],[2.1,2.1]]);

		//chamfers for vertical leg
		translate([3,-base_thickness-ff,2])
		rotate([-90,0,0])
		linear_extrude(height = base_thickness+case_thick+clip_thickness + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([3,-base_thickness-ff,clip_width+ff])
		rotate([-90,0,0])
		linear_extrude(height = base_thickness+case_thick+clip_thickness + ff*2)
		polygon(points=[[0,0],[2.1,0],[2.1,2.1]]);

		//chamfers for long edges of reach leg
		translate([-clip_reach,case_thick+clip_thickness-2,2-ff])
		rotate([0,90,0])
		linear_extrude(height = clip_reach+clip_thickness + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([clip_thickness,case_thick+clip_thickness+ff,clip_width-2])
		rotate([0,-90,0])
		linear_extrude(height = clip_reach+clip_thickness + ff*2)
		polygon(points=[[0,0],[2.1,0],[2.1,-2.1]]);
		
		//slots for strap
		translate([-1+ff,7.5-ff,clip_width/2])
		rotate([0,0,90])
		union(){
			translate([0,-1,0])
			cube([15,2,strap_cut],center=true);
			
			translate([-2.5,-3,0])
			cube([5,6,strap_cut],center=true);
			
			translate([5,-3,0])
			cube([5,6,strap_cut],center=true);
		}
	}
}

module create_mini_clip2(clip_reach,clip_width){
	base_thickness = 4;
	clip_thickness = 5;
	strap_cut = clip_width-4;

	difference(){
		union(){
			//reach leg
			translate([-clip_reach,case_thick,0])
			cube([clip_reach+clip_thickness,clip_thickness,clip_width]);

			//spur
			translate([-clip_reach,case_thick,0])
			linear_extrude(height = clip_width)
			polygon(points=[[0,0],[1,-3],[3,-3],[2,0]]);
		}

		//chamfers for short edges of reach leg
		translate([clip_thickness-2,case_thick+clip_thickness-2,-ff])
		linear_extrude(height = clip_width + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([-clip_reach-ff,case_thick+clip_thickness-2,-ff])
		linear_extrude(height = clip_width + ff*2)
		polygon(points=[[0,0],[0,2.1],[2.1,2.1]]);

		//chamfers for vertical leg
		translate([3,-base_thickness-ff,2])
		rotate([-90,0,0])
		linear_extrude(height = base_thickness+case_thick+clip_thickness + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([3,-base_thickness-ff,clip_width+ff])
		rotate([-90,0,0])
		linear_extrude(height = base_thickness+case_thick+clip_thickness + ff*2)
		polygon(points=[[0,0],[2.1,0],[2.1,2.1]]);

		//chamfers for long edges of reach leg
		translate([-clip_reach,case_thick+clip_thickness-2,2-ff])
		rotate([0,90,0])
		linear_extrude(height = clip_reach+clip_thickness + ff*2)
		polygon(points=[[0,2.1],[2.1,2.1],[2.1,0]]);
		translate([clip_thickness,case_thick+clip_thickness+ff,clip_width-2])
		rotate([0,-90,0])
		linear_extrude(height = clip_reach+clip_thickness + ff*2)
		polygon(points=[[0,0],[2.1,0],[2.1,-2.1]]);
		
		//slots for strap
		translate([-2.4,case_thickness-1+ff,clip_width/2])
		rotate([180,180,0])
		union(){
			translate([0,-1,0])
			cube([15,2,strap_cut],center=true);
			
			translate([-2.5,-5,0])
			cube([5,6,strap_cut],center=true);
			
			translate([5,-5,0])
			cube([5,6,strap_cut],center=true);
		}
	}
}

module base_keyguard(wid,hei,crad,thickness,cheat){
	//consider moving this logic to global scope
	widt = (add_sloped_keyguard_edge=="no") ? wid :
			(extend_lip_to_edge_of_case=="no") ? cow + sew*2: case_width;
	heig = (add_sloped_keyguard_edge=="no") ? hei :
			(extend_lip_to_edge_of_case=="no") ? coh + sew*2: case_height;
	radi = (add_sloped_keyguard_edge=="no") ? crad :
			(extend_lip_to_edge_of_case=="no") ? [cocr+sew,cocr+sew,cocr+sew,cocr+sew] : 
											  [case_corner_radius,case_corner_radius,case_corner_radius,case_corner_radius];
											  
	translate([0,0,-thickness/2])
	difference(){
		case_opening_blank(widt,heig,radi,thickness,cheat);
		
		if (type_of_keyguard=="3D-Printed" && add_sloped_keyguard_edge=="yes"){
			difference(){
				translate([0,0,-fudge])
				case_opening_blank(widt+5,heig+5,radi,case_to_screen_depth+fudge*2,cheat);
				
				union(){
					hull(){
						translate([0,0,case_to_screen_depth+fudge])
						linear_extrude(height=.0001)
						offset(r=cocr+sew)
						square([(cow + sew*2)-(cocr+sew)*2,(coh + sew*2)-(cocr+sew)*2],true);
						
						translate([0,0,sloped_edge_starting_height])
						linear_extrude(height=.0001)
						offset(r=cocr)
						square([cow-cocr*2,coh-cocr*2],true);
					}
								
					linear_extrude(height=sloped_edge_starting_height)
					offset(r=cocr)
					square([cow-cocr*2,coh-cocr*2],true);
				}
				
				translate([0,0,-5])
				case_opening_blank(wid,hei,crad,thickness+10,cheat);
			}
		}
		
		if(case_to_slope_depth>0){
			translate([0,0,case_to_screen_depth-fudge])
			difference(){
				case_opening_blank(widt+fudge,heig+fudge,radi,case_to_slope_depth,cheat);
			
				translate([0,0,-fudge])
				case_opening_blank((cow + sew*2),(coh + sew*2),[cocr+sew,cocr+sew,cocr+sew,cocr+sew],case_to_slope_depth+2*fudge,cheat);
				
			}
		}
				
		if (type_of_keyguard=="3D-Printed"){  //add chamfer
			for (i = [1:1:chamfer_slices]) { 
				chamfer_slice(i,widt,heig,radi,thickness,cheat);
			}
		}
	}
}

module chamfer_slice(layer,width,height,corner_radius,thickness, cheat){
	slice_width = chamfer_slice_size*(chamfer_slices-layer+1);
	slice_height = thickness-chamfer_slice_size*layer;
	
	translate([0,0,slice_height])
	linear_extrude(height=chamfer_slice_size+ff)
	difference(){
		offset(delta=ff)
		case_opening_blank_2d(width,height,corner_radius,cheat);

		offset(delta=-slice_width)
		case_opening_blank_2d(width,height,corner_radius,cheat);
	}
}

module case_opening_blank(width,heigt,corner_radius,thickness,cheat){
	if (thickness > 0){
		linear_extrude(height=thickness)
		case_opening_blank_2d(width,heigt,corner_radius,cheat);
	}
	else{ //to be laser cut
		case_opening_blank_2d(width,heigt,corner_radius,cheat);
	}
}

module case_opening_blank_2d(shape_x,shape_y,c_r,cheat){
	same_radii = (c_r[0]==c_r[1] && c_r[0]==c_r[2] && c_r[0]==c_r[3]); // test to see if all radii are the same
	difference(){
		if (same_radii){
			union(){
				//core keyguard
				offset(r=c_r[0])
				square([shape_x-c_r[0]*2,shape_y-c_r[0]*2],center=true);
				
				if(!is_undef(case_additions)){
					if(add_symmetric_openings=="no" && !(generate=="keyguard" && have_a_keyguard_frame=="yes") && have_a_case=="yes" && len(case_additions)>0 && cheat=="no"){
						add_case_full_height_shapes(case_additions,"add");
					}
				}
				if(len(m_c_a)>0 && add_symmetric_openings=="no" && !(generate=="keyguard" && have_a_keyguard_frame=="yes") && have_a_case=="yes" && cheat=="no"){
					add_case_full_height_shapes(m_c_a,"add");
				}
			}
		}
		else{
			difference(){
				square([shape_x,shape_y],center=true);
			
				translate([-shape_x/2+c_r[0],shape_y/2-c_r[0]])
				create_cutting_tool_2d(90,c_r[0]*2);
			
				translate([shape_x/2-c_r[1],shape_y/2-c_r[1]])
				create_cutting_tool_2d(0,c_r[1]*2);
			
				translate([-shape_x/2+c_r[2],-shape_y/2+c_r[2]])
				create_cutting_tool_2d(180,c_r[2]*2);
			
				translate([shape_x/2-c_r[3],-shape_y/2+c_r[3]])
				create_cutting_tool_2d(-90,c_r[3]*2);
			}
		}

		if(!is_undef(case_additions)){
			if(add_symmetric_openings=="no" && !(generate=="keyguard" && have_a_keyguard_frame=="yes") && have_a_case=="yes" && len(case_additions)>0 && cheat=="no"){
				add_case_full_height_shapes(case_additions,"sub");
			}
		}

		if(len(m_c_a)>0 && add_symmetric_openings=="no" && !(generate=="keyguard" && have_a_keyguard_frame=="yes") && have_a_case=="yes" && cheat=="no"){
			add_case_full_height_shapes(m_c_a,"sub");
		}

		if(have_a_case=="yes" && m_m=="Posts"){
			translate([0,coh/2+25-mount_to_top_of_opening_distance,0])
			square([cow+1,50],center=true);
		}
	}
}

module add_case_full_height_shapes(c_a,type){
	x0 = (generate_keyguard) ? kx0 : case_x0;
	y0 = (generate_keyguard) ? ky0 : case_y0;
	
	for(i = [0 : len(c_a)-1]){
		addition = c_a[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other
			
		addition_ID = addition[0];		
		addition_x = addition[1];
		addition_y = addition[2];
		addition_width = addition[3];
		addition_height = addition[4];
		addition_shape = addition[5];
		addition_thickness = addition[6];
		addition_trim_above = addition[7];
		addition_trim_below = addition[8];
		addition_trim_to_right = addition[9];
		addition_trim_to_left = addition[10];
		addition_corner_radius = addition[11];
			
		if(addition_thickness==0 && addition_shape != undef){
			if(addition_ID=="#"){
				if(type=="add" && search("-",addition_shape)==[]){
					difference(){
						translate([x0+addition_x ,y0+addition_y])
						#build_addition(addition_width, addition_height, addition_shape, addition_corner_radius);

						if (addition_trim_below > -999){
							translate([0,-kh+addition_trim_below])
							square([kw*2,kh*2],center=true);
						}
						if (addition_trim_above > -999){
							translate([0,kh+addition_trim_above])
							square([kw*2,kh*2],center=true);
						}
						if (addition_trim_to_right > -999){
							translate([addition_trim_to_right,0])
							square([kw*2,kh*2],center=true);
						}
						if (addition_trim_to_left > -999){
							translate([-kw+addition_trim_to_left,0])
							square([kw*2,kh*2],center=true);
						}
					}
				}
				
				if(type=="sub" && search("-",addition_shape)!=[]){
					translate([x0+addition_x ,y0+addition_y])
					#build_addition(addition_width, addition_height, addition_shape, addition_corner_radius);
				}
			}
			else{
				if(type=="add" && search("-",addition_shape)==[]){
					if(addition_thickness==0){
						difference(){
							translate([x0+addition_x ,y0+addition_y])
							build_addition(addition_width, addition_height, addition_shape, addition_corner_radius);

							if (addition_trim_below > -999){
								translate([0,-kh+addition_trim_below])
								square([kw*2,kh*2],center=true);
							}
							if (addition_trim_above > -999){
								translate([0,kh+addition_trim_above])
								square([kw*2,kh*2],center=true);
							}
							if (addition_trim_to_right > -999){
								translate([addition_trim_to_right,0])
								square([kw*2,kh*2],center=true);
							}
							if (addition_trim_to_left > -999){
								translate([-kw+addition_trim_to_left,0])
								square([kw*2,kh*2],center=true);
							}
						}
					}
				}

				if(type=="sub" && search("-",addition_shape)!=[]){
					translate([x0+addition_x ,y0+addition_y])
					build_addition(addition_width, addition_height, addition_shape, addition_corner_radius);
				}
			}
		}
	}
}

module build_addition(addition_width, addition_height, addition_shape, addition_corner_radius){
	if (addition_shape=="r" || addition_shape=="-r"){
		if (addition_width > 0 && addition_height > 0){
			square([addition_width,addition_height]);
		}
	}
	else if (addition_shape=="cr" || addition_shape=="-cr"){
		if (addition_width > 0 && addition_height > 0){
			square([addition_width,addition_height],center=true);
		}
	}
	else if (addition_shape=="r1" || addition_shape=="-r1"){
		if (addition_width > 0 && addition_height > 0){
			translate([0,addition_height/2-ff])
			square([addition_width,addition_height],center=true);
		}
	}
	else if (addition_shape=="r2" || addition_shape=="-r2"){
		if (addition_width > 0 && addition_height > 0){
			translate([addition_width/2-ff,0])
			square([addition_width,addition_height],center=true);
		}
	}
	else if (addition_shape=="r3" || addition_shape=="-r3"){
		if (addition_width > 0 && addition_height > 0){
			translate([0,-addition_height/2+ff])
			square([addition_width,addition_height],center=true);
		}
	}
	else if (addition_shape=="r4" || addition_shape=="-r4"){
		if (addition_width > 0 && addition_height > 0){
			translate([-addition_width/2+ff,0])
			square([addition_width,addition_height],center=true);
		}
	}
	else if (addition_shape=="c" || addition_shape=="-c"){
		if (addition_height > 0){
			circle(d=addition_height);
		}
	}
	else if (addition_shape=="t1" || addition_shape=="-t1"){
		translate([-ff,-ff])
		if (addition_width > 0 && addition_height > 0){
			polygon([[0,0],[addition_width,0],[0,addition_height]]);
		}
	}
	else if (addition_shape=="t2" || addition_shape=="-t2"){
		translate([-ff,ff])
		if (addition_width > 0 && addition_height > 0){
			polygon([[0,0],[addition_width,0],[0,-addition_height]]);
		}
	}
	else if (addition_shape=="t4" || addition_shape=="-t4"){
		translate([ff,-ff])
		if (addition_width > 0 && addition_height > 0){
			polygon([[0,0],[-addition_width,0],[0,addition_height]]);
		}
	}
	else if (addition_shape=="t3" || addition_shape=="-t3"){
		translate([ff,ff])
		if (addition_width > 0 && addition_height > 0){
			polygon([[0,0],[-addition_width,0],[0,-addition_height]]);
		}
	}
	else if (addition_shape=="f1" || addition_shape=="-f1"){
		translate([-ff,-ff])
		if (addition_width > 0){
			difference(){
				translate([0,0])
				square([addition_width,addition_width]);
				translate([addition_width,addition_width])
				circle(r=addition_width);
			}
		}
	}
	else if (addition_shape=="f2" || addition_shape=="-f2"){
		translate([-ff,ff])
		if (addition_width > 0){
			difference(){
				translate([0,-addition_width])
				square([addition_width,addition_width]);
				translate([addition_width,-addition_width])
				circle(r=addition_width);
			}
		}
	}
	else if (addition_shape=="f3" || addition_shape=="-f3"){
		translate([ff,ff])
		if (addition_width > 0){
			difference(){
				translate([-addition_width,-addition_width])
				square([addition_width,addition_width]);
				translate([-addition_width,-addition_width])
				circle(r=addition_width);
			}
		}
	}
	else if (addition_shape=="f4" || addition_shape=="-f4"){
		translate([ff,-ff])
		if (addition_width > 0){
			difference(){
				translate([-addition_width,0])
				square([addition_width,addition_width]);
				translate([-addition_width,addition_width])
				circle(r=addition_width);
			}
		}
	}
	else if (addition_shape=="cm1" || addition_shape=="-cm1"){
		if (addition_width > 0 && addition_height > 0){
			$fn=360;

			d1 = addition_height;
			d2 = addition_width/2;
			Cx = (d2*d2)/(2*d1) - d1/2;
			radius = Cx + d1;

			translate([0,-ff])
			rotate([0,0,90])
			difference(){
				translate([-Cx,0])
				circle(r=radius);

				translate([-radius*2-10,-radius-5-ff])
				square([radius*2+10,radius*2+10]);
				
			}
		}
	}
	else if (addition_shape=="cm2" || addition_shape=="-cm2"){
		if (addition_width > 0 && addition_height > 0){
			$fn=360;

			d1 = addition_width;
			d2 = addition_height/2;
			Cx = (d2*d2)/(2*d1) - d1/2;
			radius = Cx + d1;
			
			translate([-ff,0])
			difference(){
				translate([-Cx,0])
				circle(r=radius);

				translate([-radius*2-10-ff,-radius-5])
				square([radius*2+10,radius*2+10]);
			}
		}
	}
	else if (addition_shape=="cm3" || addition_shape=="-cm3"){
		if (addition_width > 0 && addition_height > 0){
			$fn=360;

			d1 = addition_height;
			d2 = addition_width/2;
			Cx = (d2*d2)/(2*d1) - d1/2;
			radius = Cx + d1;

			translate([0,ff])
			rotate([0,0,-90])
			difference(){
				translate([-Cx,0])
				circle(r=radius);

				translate([-radius*2-10,-radius-5+ff])
				square([radius*2+10,radius*2+10]);
				
			}
		}
	}
	else if (addition_shape=="cm4" || addition_shape=="-cm4"){
		if (addition_width > 0 && addition_height > 0){
			$fn=360;

			d1 = addition_width;
			d2 = addition_height/2;
			Cx = (d2*d2)/(2*d1) - d1/2;
			radius = Cx + d1;

			translate([ff,0])
			difference(){
				translate([Cx,0])
				circle(r=radius);

				translate([0+ff,-radius-5])
				square([radius*2+10,radius*2+10]);
			}
		}
	}
	else if (addition_shape=="rr" || addition_shape=="-rr"){
		if (addition_width > 0 && addition_height > 0){
			translate([addition_corner_radius,addition_corner_radius])
			offset(r=addition_corner_radius)
			square([addition_width-addition_corner_radius*2,addition_height-addition_corner_radius*2]);
		}
	}
	else if (addition_shape=="crr" || addition_shape=="-crr"){
		if (addition_width > 0 && addition_height > 0){
			offset(r=addition_corner_radius)
			square([addition_width-addition_corner_radius*2,addition_height-addition_corner_radius*2],center=true);
		}
	}
	else if (addition_shape=="rr1" || addition_shape=="-rr1"){
		rotate([0,0,0])
		translate([0,-ff])
		if (addition_width > 0 && addition_height > 0){
			half_rounded_rectangle(addition_height,addition_width,addition_corner_radius);
		}
	}
	else if (addition_shape=="rr2" || addition_shape=="-rr2"){
		translate([-ff,0])
		rotate([0,0,-90])
		if (addition_width > 0 && addition_height > 0){
			half_rounded_rectangle(addition_width,addition_height,addition_corner_radius);
		}
	}
	else if (addition_shape=="rr3" || addition_shape=="-rr3"){
		translate([0,ff])
		rotate([0,0,180])
		if (addition_width > 0 && addition_height > 0){
			half_rounded_rectangle(addition_height,addition_width,addition_corner_radius);
		}
	}		
	else if (addition_shape=="rr4" || addition_shape=="-rr4"){
		translate([ff,0])
		rotate([0,0,90])
		if (addition_width > 0 && addition_height > 0){
			half_rounded_rectangle(addition_width,addition_height,addition_corner_radius);
		}
	}
	else if (addition_shape=="-oa1"){
		translate([-ff,-ff])
		if (addition_corner_radius > 0){
			translate([-addition_corner_radius,-addition_corner_radius])
			create_cutting_tool_2d(0, addition_corner_radius*2);
		}
	}
	else if (addition_shape=="-oa2"){
		translate([-ff,ff])
		if (addition_corner_radius > 0){
			translate([-addition_corner_radius,addition_corner_radius])
			create_cutting_tool_2d(-90, addition_corner_radius*2);	
		}
	}
	else if (addition_shape=="-oa3"){
		translate([ff,ff])
		if (addition_corner_radius > 0){
			translate([addition_corner_radius,addition_corner_radius])
			create_cutting_tool_2d(180, addition_corner_radius*2);
		}
	}
	else if (addition_shape=="-oa4"){
		translate([ff,-ff])
		if (addition_corner_radius > 0){
			translate([addition_corner_radius,-addition_corner_radius])
			create_cutting_tool_2d(90, addition_corner_radius*2);	
		}
	}
}

module add_flex_height_shapes(c_a){
	if (len(c_a)>0){
		for(i = [0 : len(c_a)-1]){
			addition = c_a[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other

			addition_ID = addition[0];
			addition_x = addition[1];
			addition_y = addition[2];
			addition_width = addition[3];
			addition_height = addition[4];
			addition_thickness = (type_of_keyguard=="Laser-Cut" && generate=="first layer for SVG/DXF file") ? 0 : addition[6];
			addition_shape = addition[5];
			addition_trim_above = addition[7];
			addition_trim_below = addition[8];
			addition_trim_to_right = addition[9];
			addition_trim_to_left = addition[10];
			addition_corner_radius = addition[11];
			
			if(addition_thickness>0 && search("-",addition_shape)==[]){
				translate([0,0,-kt/2])
				if(addition_ID=="#"){
					#linear_extrude(height=addition_thickness)
					build_trimmed_addition(addition_x,addition_y,addition_width, addition_height, addition_shape, addition_trim_above, addition_trim_below, addition_trim_to_right, addition_trim_to_left,addition_corner_radius);
				}
				else{
					linear_extrude(height=addition_thickness)
					build_trimmed_addition(addition_x,addition_y,addition_width, addition_height, addition_shape, addition_trim_above, addition_trim_below, addition_trim_to_right, addition_trim_to_left,addition_corner_radius);
				}
			}
		}
	}
}

module sub_flex_height_shapes(c_a){
	if (len(c_a)>0){
		for(i = [0 : len(c_a)-1]){
			addition = c_a[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other

			addition_ID = addition[0];
			addition_x = addition[1];
			addition_y = addition[2];
			addition_width = addition[3]+ff;
			addition_height = addition[4]+ff;
			addition_thickness = (type_of_keyguard=="Laser-Cut" && generate=="first layer for SVG/DXF file") ? 0 : addition[6]+ff;
			addition_shape = addition[5];
			addition_trim_above = addition[7];
			addition_trim_below = addition[8];
			addition_trim_to_right = addition[9];
			addition_trim_to_left = addition[10];
			addition_corner_radius = addition[11];
			
			if(addition_thickness>0 && search("-",addition_shape)!=[]){
				translate([0,0,-kt/2-ff])
				if(addition_ID=="#"){
					#linear_extrude(height=addition_thickness)
					build_trimmed_addition(addition_x,addition_y,addition_width, addition_height, addition_shape, addition_trim_above, addition_trim_below, addition_trim_to_right, addition_trim_to_left,addition_corner_radius);
				}
				else{
					linear_extrude(height=addition_thickness)
					build_trimmed_addition(addition_x,addition_y,addition_width, addition_height, addition_shape, addition_trim_above, addition_trim_below, addition_trim_to_right, addition_trim_to_left,addition_corner_radius);
				}
			}
		}
	}
}

module build_trimmed_addition(addition_x,addition_y,addition_width, addition_height, addition_shape, addition_trim_above, addition_trim_below, addition_trim_to_right, addition_trim_to_left,addition_corner_radius){
	x0 = (generate_keyguard) ? kx0 : case_x0;
	y0 = (generate_keyguard) ? ky0 : case_y0;
	
	difference(){
		translate([x0+addition_x ,y0+addition_y])
		build_addition(addition_width, addition_height, addition_shape, addition_corner_radius);

		if (addition_trim_below > -999){
			translate([0,-kh+addition_trim_below])
			square([kw*2,kh*2],center=true);
		}
		if (addition_trim_above > -999){
			translate([0,kh+addition_trim_above])
			square([kw*2,kh*2],center=true);
		}
		if (addition_trim_to_right > -999){
			translate([addition_trim_to_right,0])
			square([kw*2,kh*2],center=true);
		}
		if (addition_trim_to_left > -999){
			translate([-kw+addition_trim_to_left,0])
			square([kw*2,kh*2],center=true);
		}
	}
}


module add_case_cylinders(case_posts){
	x0 = (generate_keyguard) ? kx0 : case_x0;
	y0 = (generate_keyguard) ? ky0 : case_y0;
	
	for(i = [0 : len(case_posts)-1]){
		addition = case_posts[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other
		
		addition_x = addition[1];
		addition_y = addition[2];
		addition_width = addition[3];
		addition_height = addition[4];
		s = addition[5];
		addition_shape = ((s=="rr1" || s=="rr2" || s=="rr3" || s=="rr4")  && addition[11]==0) ? "r" : s;
		addition_thickness = addition[6];
			
		translate([addition_x,addition_y])
		if (addition_shape=="cyl1"){
			if (addition_width > 0){
				translate([x0,y0+addition_width/2-ff,-kt/2+addition_thickness/2+addition_height])
				rotate([0,0,90])
				rotate([0,90,0])
				cylinder(d=addition_thickness,h=addition_width,center=true);
			}
		}
		else if (addition_shape=="cyl2"){
			if (addition_width > 0){
				translate([x0+addition_width/2-ff,y0,-kt/2+addition_thickness/2+addition_height])
				rotate([0,90,0])
				cylinder(d=addition_thickness,h=addition_width,center=true);
			}
		}
		else if (addition_shape=="cyl3"){
			if (addition_width > 0){
				translate([x0,y0-addition_width/2+ff,-kt/2+addition_thickness/2+addition_height])
				rotate([0,0,90])
				rotate([0,90,0])
				cylinder(d=addition_thickness,h=addition_width,center=true);
			}
		}
		else if (addition_shape=="cyl4"){
			if (addition_width > 0){
				translate([x0-addition_width/2+ff,y0,-kt/2+addition_thickness/2+addition_height])
				rotate([0,90,0])
				cylinder(d=addition_thickness,h=addition_width,center=true);
			}
		}
	}
}
// module add_manual_mount_slide_in_tabs(c_a){
	// x0 = (generate_keyguard) ? kx0 : case_x0;
	// y0 = (generate_keyguard) ? ky0 : case_y0;
	
	// for(i = [0 : len(c_a)-1]){
		// addition = c_a[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other
		
		// addition_ID = addition[0];
		// addition_x = addition[1];
		// addition_y = addition[2];
		// addition_width = addition[3];
		// addition_height = addition[4];
		// s = addition[5];
		// addition_shape = ((s=="rr1" || s=="rr2" || s=="rr3" || s=="rr4")  && addition[11]==0) ? "r" : s;
		// addition_thickness = addition[6];
		// addition_corner_radius = addition[11];
			
		// translate([addition_x,addition_y])
		// if(addition_ID!="#"){
			// if (addition_shape=="rr1"){
				// translate([x0,y0,-kt/2])
				// linear_extrude(height=addition_thickness)
				// rotate([0,0,0])
				// translate([0,-ff])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_height,addition_width,addition_corner_radius);
				// }
			// }
			// else if (addition_shape=="rr2"){
				// translate([x0,y0,-kt/2])
				// linear_extrude(height=addition_thickness)
				// translate([-ff,0])
				// rotate([0,0,-90])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_width,addition_height,addition_corner_radius);
				// }
// }
			// else if (addition_shape=="rr3"){
				// translate([x0,y0,-kt/2])
				// linear_extrude(height=addition_thickness)
				// translate([0,ff])
				// rotate([0,0,180])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_height,addition_width,addition_corner_radius);
				// }
			// }
			// else if (addition_shape=="rr4"){
				// translate([x0,y0,-kt/2])
				// linear_extrude(height=addition_thickness)
				// translate([ff,0])
				// rotate([0,0,90])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_width,addition_height,addition_corner_radius);
				// }
			// }
		// }
		// else{
			// if (addition_shape=="rr1"){
				// translate([x0,y0,-kt/2])
				// #linear_extrude(height=addition_thickness)
				// rotate([0,0,0])
				// translate([0,-ff])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_height,addition_width,addition_corner_radius);
				// }
			// }
			// else if (addition_shape=="rr2"){
				// translate([x0,y0,-kt/2])
				// #linear_extrude(height=addition_thickness)
				// translate([-ff,0])
				// rotate([0,0,-90])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_width,addition_height,addition_corner_radius);
				// }
// }
			// else if (addition_shape=="rr3"){
				// translate([x0,y0,-kt/2])
				// #linear_extrude(height=addition_thickness)
				// translate([0,ff])
				// rotate([0,0,180])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_height,addition_width,addition_corner_radius);
				// }
			// }
			// else if (addition_shape=="rr4"){
				// translate([x0,y0,-kt/2])
				// #linear_extrude(height=addition_thickness)
				// translate([ff,0])
				// rotate([0,0,90])
				// if (addition_width > 0 && addition_height > 0){
					// half_rounded_rectangle(addition_width,addition_height,addition_corner_radius);
				// }
			// }
		// }
	// }
// }

module half_rounded_rectangle(h1,w1,cr){
	difference(){
        translate([-w1/2,0,0])
        square([w1,h1]);
        
        translate([-w1/2+cr-ff,h1-cr+ff,0])
        difference(){
			square(size=cr*2,center=true);
            circle(cr);
            translate([0,-cr/2-ff,0])
            square([(cr+ff)*2,cr+ff],center=true);
            
            translate([cr/2+ff,0,0])
            square([cr+ff,(cr+ff)*2],center=true);
		}

        translate([w1/2-cr+ff,h1-cr+ff,0])
        difference(){
			square(size=cr*2,center=true);
            circle(cr);
            translate([0,-cr/2-ff,0])
            square([(cr+ff)*2,cr+ff],center=true);
            
            translate([-cr/2-ff,0,0])
            square([cr+ff,(cr+ff)*2],center=true);
		}
    }
}

module add_manual_mount_pedestals(c_a){
	x0 = (generate_keyguard) ? kx0 : case_x0;
	y0 = (generate_keyguard) ? ky0 : case_y0;
	
	for(i = [0 : len(c_a)-1]){
		addition = c_a[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other
		
		addition_ID = addition[0];
		addition_x = addition[1];
		addition_y = addition[2];
		s = addition[5];
		addition_shape = ((s=="rr1" || s=="rr2" || s=="rr3" || s=="rr4")  && addition[11]==0) ? "r" : s;
			
		translate([addition_x,addition_y])
		if(addition_ID!="#"){
			if(addition_shape=="ped1"){
				translate([x0,y0-4.5,kt/2])
				rotate([0,0,-90])
				linear_extrude(height=pedestal_height,scale=.8)
				square([7,vertical_pedestal_width],center=true);
			}
			else if(addition_shape=="ped2"){
				translate([x0-4.5,y0,kt/2])
				rotate([0,0,0])
				linear_extrude(height=pedestal_height,scale=.8)
				square([7,horizontal_pedestal_width],center=true);
			}
			else if(addition_shape=="ped3"){
				translate([x0,y0+4.5,kt/2])
				rotate([0,0,-90])
				linear_extrude(height=pedestal_height,scale=.8)
				square([7,vertical_pedestal_width],center=true);
			}
			else if(addition_shape=="ped4"){
				translate([x0+4.5,y0,kt/2])
				rotate([0,0,0])
				linear_extrude(height=pedestal_height,scale=.8)
				square([7,horizontal_pedestal_width],center=true);
			}
		}
		else{
			if(addition_shape=="ped1"){
				translate([x0,y0-4.5,kt/2])
				rotate([0,0,-90])
				#linear_extrude(height=pedestal_height,scale=.8)
				square([7,vertical_pedestal_width],center=true);
			}
			else if(addition_shape=="ped2"){
				translate([x0-4.5,y0,kt/2])
				rotate([0,0,0])
				#linear_extrude(height=pedestal_height,scale=.8)
				square([7,horizontal_pedestal_width],center=true);
			}
			else if(addition_shape=="ped3"){
				translate([x0,y0+4.5,kt/2])
				rotate([0,0,-90])
				#linear_extrude(height=pedestal_height,scale=.8)
				square([7,vertical_pedestal_width],center=true);
			}
			else if(addition_shape=="ped4"){
				translate([x0+4.5,y0,kt/2])
				rotate([0,0,0])
				#linear_extrude(height=pedestal_height,scale=.8)
				square([7,horizontal_pedestal_width],center=true);
			}
		}
	}
}

module cut_manual_mount_pedestal_slots(c_a){
	x0 = (generate_keyguard) ? kx0 : case_x0;
	y0 = (generate_keyguard) ? ky0 : case_y0;
	
	for(i = [0 : len(c_a)-1]){
		addition = c_a[i]; //0:ID, 1:x, 2:y, 3:width,  4:height, 5:shape, 6:thickness, 7:trim_above, 8:trim_below, 9:trim_to_right, 10:trim_to_left, 11:corner_radius, 12:other
		
		addition_ID = addition[0];
		addition_x = addition[1];
		addition_y = addition[2];
		s = addition[5];
		addition_shape = ((s=="rr1" || s=="rr2" || s=="rr3" || s=="rr4")  && addition[11]==0) ? "r" : s;
			
		translate([x0+addition_x,y0+addition_y])
		if(addition_ID!="#"){
			if(addition_shape=="ped1"){
				translate([vertical_slot_width/2,-1.25-kec,vertical_offset])
				rotate([90,0,-90])
				linear_extrude(height = vertical_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
			else if(addition_shape=="ped3"){
				translate([-vertical_slot_width/2,1.25+kec,vertical_offset])
				rotate([90,0,90])
				linear_extrude(height = vertical_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
			else if(addition_shape=="ped2"){
				translate([-kec-1.25,-horizontal_slot_width/2,vertical_offset])
				rotate([90,0,180])
				linear_extrude(height = horizontal_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
			else if(addition_shape=="ped4"){
				translate([kec+1.25,horizontal_slot_width/2,vertical_offset])
				rotate([90,0,0])
				linear_extrude(height = horizontal_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
		}
		else{
			if(addition_shape=="ped1"){
				translate([vertical_slot_width/2,-1.25-kec,vertical_offset])
				rotate([90,0,-90])
				#linear_extrude(height = vertical_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
			else if(addition_shape=="ped3"){
				translate([-vertical_slot_width/2,1.25+kec,vertical_offset])
				rotate([90,0,90])
				#linear_extrude(height = vertical_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
			else if(addition_shape=="ped2"){
				translate([-kec-1.25,-horizontal_slot_width/2,vertical_offset])
				rotate([90,0,180])
				#linear_extrude(height = horizontal_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
			else if(addition_shape=="ped4"){
				translate([kec+1.25,horizontal_slot_width/2,vertical_offset])
				rotate([90,0,0])
				#linear_extrude(height = horizontal_slot_width)
				polygon(points=[[0,0],[3,0],[4,3],[1,3]]);
			}
		}
	}
}
 

module trim_to_the_screen(){
	difference(){
		cube([1000,1000,100],true);
		cube([swm-2*ff,shm-2*ff,100+ff*4],true);
	}
}

module trim_to_rectangle(){
	x0 = (generate_keyguard) ? kx0 : case_x0;
	y0 = (generate_keyguard) ? ky0 : case_y0;
	
	major_dim = (have_a_case=="no") ? max(tablet_width,tablet_height) : max(kw,kh);
	minor_dim = (have_a_case=="no") ? min(tablet_width,tablet_height): min(kw,kh);
	
	x1 = t_t_r_ll[0];
	y1 = t_t_r_ll[1];
	x2 = t_t_r_ur[0];
	y2 = t_t_r_ur[1];
	
	w1=x2-x1;
	h1=y2-y1;
	
	translate([x0+w1/2+x1,y0+h1/2+y1,0])
	difference(){
		final_rotation = (orientation=="landscape") ? [0,0,0] : [0,0,-90];
		
		rotate(final_rotation)
		cube([major_dim*3,minor_dim*3,kt+ff*2],true);
		
		cube([w1-ff,h1-ff,kt+ff*4],true);
	}
}

module cut_screen(){
	translate([screen_x0,screen_y0,-kt/2-ff-50])
	cube([swm,shm,100]);
}

module cut_grid(){
	translate([grid_x0,grid_y0,-kt/2-ff])
	cube([gwm,ghm,100]);
}

module snap_in_tab_grooves(){
	if (mount_keyguard_with=="snap-in tabs"){
		translate([keyguard_width/2-ff,0,-keyguard_frame_thickness/2+kt/2])
		make_snap_ins(groove_size,groove_width);
		
		translate([-keyguard_width/2+ff,0,-keyguard_frame_thickness/2+kt/2])
		rotate([0,0,180])
		make_snap_ins(groove_size,groove_width);

		translate([keyguard_width/2+.6,0,-keyguard_frame_thickness/2+kt/2-.05-ff])
		cube([snap_in_size+.5,2,kt-.5],center=true);
	
		translate([-keyguard_width/2-.6,0,-keyguard_frame_thickness/2+kt/2-.05-ff])
		cube([snap_in_size+.5,2,kt-.5],center=true);
	}

	translate([0,keyguard_height/2-ff,-keyguard_frame_thickness/2+kt/2])
	rotate([0,0,90])
	make_snap_ins(groove_size,groove_width);

	translate([0,keyguard_height/2+.6,-keyguard_frame_thickness/2+kt/2-.05-ff])
	cube([2,snap_in_size+.5,kt-.5],center=true);
		
	translate([0,-keyguard_height/2+ff,-keyguard_frame_thickness/2+kt/2])
	rotate([0,0,-90])
	make_snap_ins(groove_size,groove_width);
	
	translate([0,-keyguard_height/2-.6,-keyguard_frame_thickness/2+kt/2-.05-ff])
	cube([2,snap_in_size+.5,kt-.5],center=true);
}


module add_snap_ins(){
	if (snap_in_tabs_on_left_and_right_edges_of_keyguard=="yes" && mount_keyguard_with=="snap-in tabs"){
		translate([kw/2,0,0])
		make_snap_ins(snap_in_size,snap_in_width);
		translate([kw/2+.4,0,-.5])
		cube([snap_in_size,1.5,kt-1],center=true);
		
		translate([-kw/2,0,0])
		rotate([0,0,180])
		make_snap_ins(snap_in_size,snap_in_width);
		translate([-kw/2-.4,0,-.5])
		cube([snap_in_size,1.5,kt-1],center=true);
	}
	
	if(snap_in_tab_on_bottom_edge_of_keyguard=="yes"){
		translate([0,-kh/2,0])
		rotate([0,0,-90])
		make_snap_ins(snap_in_size,snap_in_width);
		
		if(mount_keyguard_with=="snap-in tabs"){
			translate([0,-kh/2-.4,-.5])
			cube([1.5,snap_in_size,kt-1],center=true);
		}
	}

	if(snap_in_tab_on_top_edge_of_keyguard=="yes" && mount_keyguard_with=="snap-in tabs"){
		translate([0,kh/2,0])
		rotate([0,0,90])
		make_snap_ins(snap_in_size,snap_in_width);
		translate([0,kh/2+.4,-.5])
		cube([1.5,snap_in_size,kt-1],center=true);
	}
}

module make_snap_ins(size,width){
	rotate([-90,0,0])
	translate([0,0,-width/2])
	linear_extrude(height=width)
	polygon([[0,-size],[size,0],[0,size]]);
}

module show_screenshot(thickness){
	color(screenshotcolor,.5)
	translate([msh,msv,-thickness/2-0.5])
	resize([swm,shm,0])
	offset(delta = .005)
	import(file=screenshot_file,center=true);
}

module show_screenshotMW(thickness){
	color(screenshotcolor,.5)
	translate([msh,msv,-thickness/2-0.5])
	linear_extrude(height=.5)   // necessary to make screenshot visible on Maker World
	resize([swm,shm,0])
	offset(delta = .005)
	import(file=screenshot_file,center=true);
}

module engrave_emboss_instruction(){
	x_start = (keyguard_region=="screen region") ? slide_horizontally/100 * swm : 
	          (keyguard_region=="case region") ? slide_horizontally/100 * cow :
			  slide_horizontally/100 * tw;
	x = (keyguard_location == "top surface") ? x_start : -x_start;
	y = (keyguard_region=="screen region") ? slide_vertically/100 * shm : 
		(keyguard_region=="case region") ? slide_vertically/100 * coh :
		ty0+slide_vertically/100 * th;
	
	x0 = (keyguard_region=="screen region" && keyguard_location == "top surface") ? sx0 :
	     (keyguard_region=="screen region" && keyguard_location == "bottom surface") ? -sx0 :
		 (keyguard_region=="case region" && keyguard_location == "top surface") ? cox0 :
		 (keyguard_region=="case region" && keyguard_location == "bottom surface") ? -cox0 :
		 tx0;
		 
	t_height = text_height;
	shape = (keyguard_location == "top surface") ? "ttext" : "btext";
	top_slope = (text_angle=="vertical downward") ? -90 : 
	              (text_angle=="horizontal") ? 0 :
	              (text_angle=="vertical upward") ? 90 :
				  180;
	bottom_slope = (font_style=="normal") ? 0 :
	               (font_style=="bold") ? 1 :
				   (font_style=="italic") ? 2 :
				   3;
	left_slope = (text_horizontal_alignment=="left") ? 1 : 
	             (text_horizontal_alignment=="center") ? 2 :
				 3;
	right_slope = (text_vertical_alignment=="bottom") ? 1 : 
	              (text_vertical_alignment=="baseline") ? 2 :
	              (text_vertical_alignment=="center") ? 3 :
				  4;
	corner_radius = (type_of_keyguard=="Laser-Cut") ? -0.1 : text_depth;
	other = text;
	depth = sat;
	
	if(generate=="keyguard" || generate=="first half of keyguard" || generate=="second half of keyguard"){
		if (keyguard_region=="screen region"){
			if (corner_radius > 0){
				translate([x0+x,sy0+y,sat-kt/2-ff])
				#place_addition(10, t_height, shape, top_slope, top_slope, bottom_slope, bottom_slope, left_slope, right_slope, corner_radius, other);
			}
			else{
				translate([x0+x,sy0+y,ff])
				#cut_opening(0, t_height, shape, top_slope, bottom_slope, left_slope, right_slope, corner_radius, other, depth*2,"screen");
			}
		}
		else{
			if (corner_radius > 0){
				translate([x0+x,coy0+y,kt/2-ff])
				#place_addition(0, t_height, shape, top_slope, top_slope, bottom_slope, bottom_slope, left_slope, right_slope, corner_radius, other);
			}
			else{
				translate([x0+x,coy0+y,-ff])
				#cut_opening(0, t_height, shape, top_slope, bottom_slope, left_slope, right_slope, corner_radius, other, depth+ff*2,"case");
			}
		}
	}
	else{ // first layer for SVG/DXF file
		if (keyguard_region=="screen region"){
			translate([x0+x,sy0+y,ff])
			#cut_opening_2d(0, t_height, shape, top_slope, corner_radius);
		}
		else{
			translate([x0+x,coy0+y,-ff])
			#cut_opening_2d(0, t_height, shape, top_slope, corner_radius);
		}
	}
}

module echo_settings(){
	echo();
	echo(keyguard_designer_version=keyguard_designer_version);
	echo();
	echo();
	echo("Customizer Settings");
	echo();
	echo();

	echo("---- Keyguard Basics ----");
		if (type_of_keyguard != "3D-Printed") echo(type_of_keyguard = type_of_keyguard);
		if (keyguard_thickness != 4) echo(keyguard_thickness = keyguard_thickness);
		if (screen_area_thickness != 4) echo(screen_area_thickness = screen_area_thickness);
		echo();
		echo();

	echo("---- Tablet ----");
		if (type_of_tablet != "iPad 9th generation") echo(type_of_tablet = type_of_tablet);
		if (orientation != "landscape") echo(orientation = orientation);
		if (expose_home_button != "yes") echo(expose_home_button = expose_home_button);
		if (home_button_edge_slope!= 30) echo(home_button_edge_slope = home_button_edge_slope);
		if (expose_camera != "yes") echo(expose_camera = expose_camera);
		if (rotate_tablet_180_degrees != "no") echo(rotate_tablet_180_degrees = rotate_tablet_180_degrees);
		if (add_symmetric_openings != "no") echo(add_symmetric_openings = add_symmetric_openings);
		if (expose_ambient_light_sensors != "yes") echo(expose_ambient_light_sensors = expose_ambient_light_sensors);
		echo();
		echo();

	echo("---- Tablet Case ----");
		if (have_a_case != "yes") echo(have_a_case = have_a_case);
		if (height_of_opening_in_case != 170) echo(height_of_opening_in_case = height_of_opening_in_case);
		if (width_of_opening_in_case != 245) echo(width_of_opening_in_case = width_of_opening_in_case);
		if (case_opening_corner_radius != 5) echo(case_opening_corner_radius = case_opening_corner_radius);
		if (case_height != 220) echo(case_height = case_height);
		if (case_width != 275) echo(case_width = case_width);
		if (case_thickness != 15) echo(case_thickness = case_thickness);
		if (case_corner_radius != 20) echo(case_corner_radius = case_corner_radius);
		if (case_to_screen_depth != 5) echo(case_to_screen_depth = case_to_screen_depth);
		if (top_edge_compensation_for_tight_cases != 0) echo(top_edge_compensation_for_tight_cases = top_edge_compensation_for_tight_cases);
		if (bottom_edge_compensation_for_tight_cases != 0) echo(bottom_edge_compensation_for_tight_cases = bottom_edge_compensation_for_tight_cases);
		if (left_edge_compensation_for_tight_cases != 0) echo(left_edge_compensation_for_tight_cases = left_edge_compensation_for_tight_cases);
		if (right_edge_compensation_for_tight_cases != 0) echo(right_edge_compensation_for_tight_cases = right_edge_compensation_for_tight_cases);
		echo();
		echo();
		
	echo("---- App Layout in px ----");
		if (bottom_of_status_bar != 0) echo(bottom_of_status_bar = bottom_of_status_bar);
		if (bottom_of_upper_message_bar != 0) echo(bottom_of_upper_message_bar = bottom_of_upper_message_bar);
		if (bottom_of_upper_command_bar != 0) echo(bottom_of_upper_command_bar = bottom_of_upper_command_bar);
		if (top_of_lower_message_bar != 0) echo(top_of_lower_message_bar = top_of_lower_message_bar);
		if (top_of_lower_command_bar != 0) echo(top_of_lower_command_bar = top_of_lower_command_bar);
		echo();
		echo();

	echo("---- App Layout in mm ----");
		if (status_bar_height != 0) echo(status_bar_height = status_bar_height);
		if (upper_message_bar_height != 0) echo(upper_message_bar_height = upper_message_bar_height);
		if (upper_command_bar_height != 0) echo(upper_command_bar_height = upper_command_bar_height);
		if (lower_message_bar_height != 0) echo(lower_message_bar_height = lower_message_bar_height);
		if (lower_command_bar_height != 0) echo(lower_command_bar_height = lower_command_bar_height);
		echo();
		echo();

	echo("---- Bar Info ----");
		if (expose_status_bar != "no") echo(expose_status_bar = expose_status_bar);
		if (expose_upper_message_bar != "no") echo(expose_upper_message_bar = expose_upper_message_bar);
		if (expose_upper_command_bar != "no") echo(expose_upper_command_bar = expose_upper_command_bar);
		if (expose_lower_message_bar != "no") echo(expose_lower_message_bar = expose_lower_message_bar);
		if (expose_lower_command_bar != "no") echo(expose_lower_command_bar = expose_lower_command_bar);
		if (bar_edge_slope != 90) echo(bar_edge_slope = bar_edge_slope);
		if (bar_corner_radius != 2) echo(bar_corner_radius = bar_corner_radius);
		echo();
		echo();

	echo("---- Grid Info ----");
		if (number_of_rows != 3) echo(number_of_rows = number_of_rows);
		if (number_of_columns != 4) echo(number_of_columns = number_of_columns);
		if (cell_shape != "rectangular") echo(cell_shape = cell_shape);
		if (cell_height_in_px != 0) echo(cell_height_in_px = cell_height_in_px);
		if (cell_width_in_px != 0) echo(cell_width_in_px = cell_width_in_px);
		if (cell_height_in_mm != 25) echo(cell_height_in_mm = cell_height_in_mm);
		if (cell_width_in_mm != 25) echo(cell_width_in_mm = cell_width_in_mm);
		if (cell_corner_radius != 3) echo(cell_corner_radius = cell_corner_radius);
		if (cell_diameter != 15) echo(cell_diameter = cell_diameter);
		echo();
		echo();
	
	echo("---- Grid Special Settings ----");
		if (cell_edge_slope != 90) echo(cell_edge_slope = cell_edge_slope);
		if (cover_these_cells != "" && cover_these_cells != "[]") echo(cover_these_cells = cover_these_cells);
		if (merge_cells_horizontally_starting_at != "" && merge_cells_horizontally_starting_at != "[]") echo(merge_cells_horizontally_starting_at = merge_cells_horizontally_starting_at);
		if (merge_cells_vertically_starting_at != "" && merge_cells_vertically_starting_at != "[]") echo(merge_cells_vertically_starting_at = merge_cells_vertically_starting_at);
		if (add_a_ridge_around_these_cells != "" && add_a_ridge_around_these_cells != "[]") echo(add_a_ridge_around_these_cells = add_a_ridge_around_these_cells);
		if (height_of_ridge != 2) echo(height_of_ridge = height_of_ridge);
		if (thickness_of_ridge != 2) echo(thickness_of_ridge = thickness_of_ridge);
		if (cell_top_edge_slope != 90) echo(cell_top_edge_slope = cell_top_edge_slope);
		if (cell_bottom_edge_slope != 90) echo(cell_bottom_edge_slope = cell_bottom_edge_slope);
		if (top_padding != 0) echo(top_padding = top_padding);
		if (bottom_padding != 0) echo(bottom_padding = bottom_padding);
		if (left_padding != 0) echo(left_padding = left_padding);
		if (right_padding != 0) echo(right_padding = right_padding);
		if (hide_grid_region != "no") echo(hide_grid_region = hide_grid_region);
		echo();
		echo();

	echo("---- Mounting Method ----");
		if (mounting_method != "No Mount") echo(mounting_method = mounting_method);
		echo();
		echo();

	echo("---- Velcro Info ----");
		if (velcro_size != 1) echo(velcro_size = velcro_size);
		echo();
		echo();

	echo("---- Clip-on Straps Info ----");
		if (clip_locations != "horizontal only") echo(clip_locations= clip_locations);
		if (horizontal_clip_width != 20) echo(horizontal_clip_width= horizontal_clip_width);
		if (vertical_clip_width != 20) echo(vertical_clip_width= vertical_clip_width);
		if (distance_between_horizontal_clips != 60) echo(distance_between_horizontal_clips= distance_between_horizontal_clips);
		if (distance_between_vertical_clips != 40) echo(distance_between_vertical_clips= distance_between_vertical_clips);
		if (clip_bottom_length != 35) echo(clip_bottom_length = clip_bottom_length);
		echo();
		echo();

	echo("---- Posts Info ----");
		if (post_diameter != 4) echo(post_diameter= post_diameter);
		if (post_length != 5) echo(post_length= post_length);
		if (mount_to_top_of_opening_distance != 5) echo(mount_to_top_of_opening_distance= mount_to_top_of_opening_distance);
		if (notch_in_post != "yes") echo(notch_in_post= notch_in_post);
		if (add_mini_tabs != "no") echo(add_mini_tabs= add_mini_tabs);
		if (mini_tab_width != 10) echo(mini_tab_width= mini_tab_width);
		if (mini_tab_length != 2) echo(mini_tab_length= mini_tab_length);
		if (mini_tab_inset_distance != 20) echo(mini_tab_inset_distance= mini_tab_inset_distance);
		if (mini_tab_height != 1) echo(mini_tab_height= mini_tab_height);
		if (rotate_mini_tab != 0) echo(rotate_mini_tab= rotate_mini_tab);
		echo();
		echo();

	echo("---- Shelf Info ----");
		if (shelf_thickness != 2) echo(shelf_thickness = shelf_thickness);
		if (shelf_depth != 3) echo(shelf_depth = shelf_depth);
		if (shelf_corner_radius != 5) echo(shelf_corner_radius = shelf_corner_radius);
		echo();
		echo();

	echo("---- Slide-in Tabs Info ----");
		if (slide_in_tab_locations != "horizontal only") echo(slide_in_tab_locations= slide_in_tab_locations);
		if (preferred_slide_in_tab_thickness != 2) echo(preferred_slide_in_tab_thickness = preferred_slide_in_tab_thickness);
		if (horizontal_slide_in_tab_length != 4) echo(horizontal_slide_in_tab_length = horizontal_slide_in_tab_length);
		if (vertical_slide_in_tab_length != 4) echo(vertical_slide_in_tab_length = vertical_slide_in_tab_length);
		if (horizontal_slide_in_tab_width != 20) echo(horizontal_slide_in_tab_width= horizontal_slide_in_tab_width);
		if (vertical_slide_in_tab_width != 20) echo(vertical_slide_in_tab_width= vertical_slide_in_tab_width);
		if (distance_between_horizontal_slide_in_tabs != 60) echo(distance_between_horizontal_slide_in_tabs= distance_between_horizontal_slide_in_tabs);
		if (distance_between_vertical_slide_in_tabs != 60) echo(distance_between_vertical_slide_in_tabs= distance_between_vertical_slide_in_tabs);
		echo();
		echo();

	echo("---- Raised Tabs Info ----");
		if (raised_tab_height != 6) echo(raised_tab_height= raised_tab_height);
		if (raised_tab_length != 8) echo(raised_tab_length= raised_tab_length);
		if (raised_tab_width != 20) echo(raised_tab_width= raised_tab_width);
		if (preferred_raised_tab_thickness != 2) echo(preferred_raised_tab_thickness= preferred_raised_tab_thickness);
		if (raised_tabs_starting_height != 0) echo(raised_tabs_starting_height = raised_tabs_starting_height);
		if (ramp_angle != 30) echo(ramp_angle = ramp_angle);
		if (distance_between_raised_tabs != 60) echo(distance_between_raised_tabs= distance_between_raised_tabs);
		if (embed_magnets != "no") echo(embed_magnets = embed_magnets);
		if (magnet_size != "20 x 8 x 1.5") echo(magnet_size = magnet_size);
		echo();
		echo();

	echo("---- Keyguard Frame Info ----");
		if (have_a_keyguard_frame != "no") echo(have_a_keyguard_frame = have_a_keyguard_frame);
		if (keyguard_frame_thickness != 5) echo(keyguard_frame_thickness = keyguard_frame_thickness);
		if (keyguard_height != 160) echo(keyguard_height = keyguard_height);
		if (keyguard_width != 210) echo(keyguard_width = keyguard_width);
		if (keyguard_corner_radius != 2) echo(keyguard_corner_radius = keyguard_corner_radius);
		if (mount_keyguard_with != "snap-in tabs") echo(mount_keyguard_with = mount_keyguard_with);
		if (snap_in_tab_on_top_edge_of_keyguard != "yes") echo(snap_in_tab_on_top_edge_of_keyguard = snap_in_tab_on_top_edge_of_keyguard);
		if (snap_in_tab_on_bottom_edge_of_keyguard != "yes") echo(snap_in_tab_on_bottom_edge_of_keyguard = snap_in_tab_on_bottom_edge_of_keyguard);
		if (snap_in_tabs_on_left_and_right_edges_of_keyguard != "yes") echo(snap_in_tabs_on_left_and_right_edges_of_keyguard = snap_in_tabs_on_left_and_right_edges_of_keyguard);
		if (post_tightness_of_fit != 0) echo(post_tightness_of_fit = post_tightness_of_fit);
		echo();
		echo();

	echo("---- Split Keyguard Info ----");
		if (split_line_location != 0) echo(split_line_location = split_line_location);
		if (split_line_type != "flat") echo(split_line_type = split_line_type);
		if (dovetail_width != 4.0) echo(dovetail_width = dovetail_width);
		if (slide_dovetails != 0) echo(slide_dovetails = slide_dovetails);
		if (tightness_of_dovetail_joint != 5) echo(tightness_of_dovetail_joint = tightness_of_dovetail_joint);
		echo();
		echo();
	
	echo("---- Sloped Keyguard Edge Info ----");
		if (add_sloped_keyguard_edge != "no") echo(add_sloped_keyguard_edge = add_sloped_keyguard_edge);
		if (sloped_edge_starting_height != 1) echo(sloped_edge_starting_height = sloped_edge_starting_height);
		if (sloped_edge_width != 10) echo(sloped_edge_width = sloped_edge_width);
		if (case_to_slope_depth != 0) echo(case_to_slope_depth = case_to_slope_depth);
		if (extend_lip_to_edge_of_case != "no") echo(extend_lip_to_edge_of_case = extend_lip_to_edge_of_case);
		echo();
		echo();

	echo("---- Engraved/Embossed Text ----");
		if (text != "") echo(text = text);
		if (text_height != 5) echo(text_height = text_height);
		if (font_style != "normal") echo(font_style = font_style);
		if (keyguard_location != "top surface") echo(keyguard_location = keyguard_location);
		if (show_back_of_keyguard != "no") echo(show_back_of_keyguard = show_back_of_keyguard);
		if (keyguard_region != "screen region") echo(keyguard_region = keyguard_region);
		if (text_depth != -2) echo(text_depth = text_depth);
		if (text_horizontal_alignment != "center") echo(text_horizontal_alignment = text_horizontal_alignment);
		if (text_vertical_alignment != "center") echo(text_vertical_alignment = text_vertical_alignment);
		if (text_angle != "horizontal") echo(text_angle = text_angle);
		if (slide_horizontally != 0) echo(slide_horizontally = slide_horizontally);
		if (slide_vertically != 0) echo(slide_vertically = slide_vertically);
		echo();
		echo();

	echo("---- Cell Inserts ----");
		if (Braille_location != "above opening") echo(Braille_location = Braille_location);
		if (Braille_text != "") echo(Braille_text = Braille_text);
		if (Braille_size_multiplier != 10) echo(Braille_size_multiplier = Braille_size_multiplier);
		if (add_circular_opening != "yes") echo(add_circular_opening = add_circular_opening);
		if (diameter_of_opening != 10) echo(diameter_of_opening = diameter_of_opening);
		if (Braille_to_opening_distance != 5) echo(Braille_to_opening_distance = Braille_to_opening_distance);
		if (engraved_text != "") echo(engraved_text = engraved_text);
		if (insert_tightness_of_fit != 0) echo(insert_tightness_of_fit = insert_tightness_of_fit);
		if (insert_recess != 0) echo(insert_recess = insert_recess);
		echo();
		echo();

	echo("---- Free-form and Hybrid Keyguard Openings ----");
		if (unit_of_measure_for_screen != "px") echo(unit_of_measure_for_screen = unit_of_measure_for_screen);
		if (starting_corner_for_screen_measurements != "upper-left") echo(starting_corner_for_screen_measurements = starting_corner_for_screen_measurements);
		echo();
		echo();

	echo("---- Special Actions and Settings ----");
		if (include_screenshot != "no") echo(include_screenshot = include_screenshot);
		if (keyguard_display_angle != 0) echo(keyguard_display_angle = keyguard_display_angle);
		if (keyguard_vertical_tightness_of_fit != 0) echo(keyguard_vertical_tightness_of_fit = keyguard_vertical_tightness_of_fit);
		if (keyguard_horizontal_tightness_of_fit != 0) echo(keyguard_horizontal_tightness_of_fit = keyguard_horizontal_tightness_of_fit);
		if (unequal_left_side_of_case_opening != 0) echo(unequal_left_side_of_case_opening = unequal_left_side_of_case_opening);
		if (unequal_bottom_side_of_case_opening != 0) echo(unequal_bottom_side_of_case_opening = unequal_bottom_side_of_case_opening);
		if (unequal_left_side_of_case != 0) echo(unequal_left_side_of_case = unequal_left_side_of_case);
		if (unequal_bottom_side_of_case != 0) echo(unequal_bottom_side_of_case = unequal_bottom_side_of_case);
		if (move_screenshot_horizontally != 0) echo(move_screenshot_horizontally = move_screenshot_horizontally);
		if (move_screenshot_vertically != 0) echo(move_screenshot_vertically = move_screenshot_vertically);
		if (keyguard_edge_chamfer != 1) echo(keyguard_edge_chamfer = keyguard_edge_chamfer);
		if (cell_edge_chamfer != 1) echo(cell_edge_chamfer = cell_edge_chamfer);
		if (hide_screen_region != "no") echo(hide_screen_region = hide_screen_region);
		if (first_two_layers_only != "no") echo(first_two_layers_only = first_two_layers_only);
		if (trim_to_rectangle_lower_left != "" && trim_to_rectangle_lower_left != "[]") echo(trim_to_rectangle_lower_left = trim_to_rectangle_lower_left);
		if (trim_to_rectangle_upper_right != "" && trim_to_rectangle_upper_right != "[]") echo(trim_to_rectangle_upper_right = trim_to_rectangle_upper_right);
		if (smoothness_of_circles_and_arcs != 40) echo(smoothness_of_circles_and_arcs = smoothness_of_circles_and_arcs);
		if (use_Laser_Cutting_best_practices != "yes") echo(use_Laser_Cutting_best_practices = use_Laser_Cutting_best_practices);
		if (other_tablet_general_sizes != "" && other_tablet_general_sizes != "[]") echo(other_tablet_general_sizes = other_tablet_general_sizes);
		if (other_tablet_pixel_sizes != "" && other_tablet_pixel_sizes != "[]") echo(other_tablet_pixel_sizes = other_tablet_pixel_sizes);
		if (my_screen_openings != "") echo(my_screen_openings = my_screen_openings);
		if (my_case_openings != "") echo(my_case_openings = my_case_openings);
		if (my_case_additions != "") echo(my_case_additions = my_case_additions);
		if (my_tablet_openings != "") echo(my_tablet_openings = my_tablet_openings);
		echo();
		echo();
}

module issues(){
		echo();
		perimeter1 = (kh - shm)/2;
		perimeter1_offset = (expose_status_bar=="yes" && sbhm>0) ? 0 :
							(expose_upper_message_bar=="yes" && umbhm>0) ? sbhm :
							(expose_upper_command_bar=="yes" && ucbhm>0) ? sbhm + umbhm :
							sbhm + umbhm+ucbhm+hrw/2+top_padding-unequal_bottom_side_offset;
		top_perimeter = max(perimeter1+perimeter1_offset,top_edge_compensation_for_tight_cases);
		
		perimeter3 = (kh - shm)/2;
		perimeter3_offset = (expose_lower_command_bar=="yes" && lcbhm>0) ? 0 :
							(expose_lower_message_bar=="yes" && lmbhm>0) ? lcbhm :
							lcbhm+lmbhm+hrw/2+bottom_padding+unequal_bottom_side_offset;
		bottom_perimeter = max(perimeter3+perimeter3_offset,bottom_edge_compensation_for_tight_cases);
		
		perimeter2 = (kw - swm)/2;
		perimeter2_offset = (expose_status_bar=="yes" && sbhm>0) ? 0 :
							(expose_upper_message_bar=="yes" && umbhm>0) ? 0 :
							(expose_upper_command_bar=="yes" && ucbhm>0) ? 0 :
							(expose_lower_command_bar=="yes" && lcbhm>0) ? 0 :
							(expose_lower_message_bar=="yes" && lmbhm>0) ? 0 :
							vrw/2+right_padding-unequal_left_side_offset;
		right_perimeter = max(perimeter2+perimeter2_offset,right_edge_compensation_for_tight_cases);
		
		perimeter4 = (kw - swm)/2;
		perimeter4_offset = (expose_status_bar=="yes" && sbhm>0) ? 0 :
							(expose_upper_message_bar=="yes" && umbhm>0) ? 0 :
							(expose_upper_command_bar=="yes" && ucbhm>0) ? 0 :
							(expose_lower_command_bar=="yes" && lcbhm>0) ? 0 :
							(expose_lower_message_bar=="yes" && lmbhm>0) ? 0 :
							vrw/2+left_padding+unequal_left_side_offset;
		left_perimeter = max(perimeter4+perimeter4_offset,left_edge_compensation_for_tight_cases);
		

		if(top_perimeter<minimum__acrylic_rail_width) echo(str("!!!!!!! ISSUE !!!!!!! -- The top perimeter rail is: ", top_perimeter, " mm wide."));
		if(bottom_perimeter<minimum__acrylic_rail_width) echo(str("!!!!!!! ISSUE !!!!!!! -- The bottom perimeter rail is: ", bottom_perimeter, " mm wide."));
		if(right_perimeter<minimum__acrylic_rail_width) echo(str("!!!!!!! ISSUE !!!!!!! -- The right side perimeter rail is: ", right_perimeter, " mm wide."));
		if(left_perimeter<minimum__acrylic_rail_width) echo(str("!!!!!!! ISSUE !!!!!!! -- The left side perimeter rail is: ", left_perimeter, " mm wide."));
		echo();
}

module key_settings(){
	echo(str("type of tablet: ", type_of_tablet));
	echo(str("use Laser Cutting best practices: ", use_Laser_Cutting_best_practices));
	echo(str("orientation: ", orientation));
	echo(str("have a case? ", have_a_case));
	if(have_a_case=="yes"){
		echo(str("height of opening in case: ", kh, " mm."));
		echo(str("width of opening in case: ", kw, " mm."));
		echo(str("case opening corner radius: ", ccr, " mm."));
	}
	else{
		tl = st_tablet_tl_corner_radius;
		tr = st_tablet_tr_corner_radius;
		bl = st_tablet_bl_corner_radius;
		br = st_tablet_br_corner_radius;
		echo(str("height of tablet: ", th, " mm."));
		echo(str("width of tablet: ", tw, " mm."));
		echo(str("tablet corner radii: ", tl, ", ",tr, ", ",bl, ", ",br, ", ", " mm."));
	}
	echo(str("number of columns: ", number_of_columns));
	echo(str("number of rows: ", number_of_rows));
	echo(str("vertical rail width: ", vrw, " mm."));
	echo(str("horizontal rail width: ", hrw, " mm."));
	echo(str("mounting method: ", m_m));
	if(m_m=="Slide-in Tabs"){
		echo(str("slide-in tab thickness: ", acrylic_slide_in_tab_thickness, " mm."));
	}
	
	if(text!=""){	
		// account for horizontal and vertical slide
		ssh = swm*slide_horizontally/100;
		ssv = shm*slide_vertically/100;
		csh = cow*slide_horizontally/100;
		csv = coh*slide_vertically/100;
		tsh = tw*slide_horizontally/100;
		tsv = th*slide_vertically/100;
	
		// horizontal location
		x_loc = (keyguard_region=="screen region" && have_a_case=="yes") ? adj_case_border_left + ssh :
				(keyguard_region=="screen region" && have_a_case=="no") ? left_border_width + ssh :
				(keyguard_region=="case region" && have_a_case=="yes") ? csh :
				(keyguard_region=="tablet region" && have_a_case=="no") ? tsh :
				(keyguard_region=="tablet region" && have_a_case=="yes") ? 0 :
				0;
		// vertical location
		y_loc = (keyguard_region=="screen region" && have_a_case=="yes") ? adj_case_border_bottom + ssv :
				(keyguard_region=="screen region" && have_a_case=="no") ? bottom_border_height + ssv :
				(keyguard_region=="case region" && have_a_case=="yes") ? csv :
				(keyguard_region=="tablet region" && have_a_case=="no") ? tsv :
				(keyguard_region=="tablet region" && have_a_case=="yes") ? 0 :
				0;
		
		echo();
		echo();
		echo(str("Engraved Text: ", text));
		echo("Font: Liberation Sans");
		echo(str("Font Style: ", font_style));
		echo(str("Text Height: ", text_height," mm"));
		echo(str("Horizontal Alignment: ", text_horizontal_alignment));
		echo(str("Vertical Alignment: ", text_vertical_alignment));
		echo(str("Text Angle: ", text_angle));
		echo(str("Distance from Left Side of Keyguard: ", x_loc," mm"));
		echo(str("Distance from Bottom Side of Keyguard: ", y_loc," mm"));
		echo();
		echo();
	}
}

module chamfered_cuboid (x, y, z, c){
	intersection(){	
		translate([0,0,-z/2])
		linear_extrude(height=z)
		offset(delta=c, chamfer=true)
		square([x-2*c,y-2*c],center=true);

		rotate([0,90,0])
		translate([0,0,-x/2])
		linear_extrude(height=x)
		offset(delta=c, chamfer=true)
		square([z-2*c,y-2*c],center=true);

		rotate([90,0,0])
		translate([0,0,-y/2])
		linear_extrude(height=y)
		offset(delta=c, chamfer=true)
		square([x-2*c,z-2*c],center=true);
	}
}

module chamfered_shape(x, y, z, c, cr){
	if (cell_shape=="rectangular"){
		hull(){
			translate([0,0,(y-c*2)/2+c])
			linear_extrude(height=.005)
			offset(r=cr-c)
			square([x-2*(cr),z-2*(cr)],center=true);

			translate([0,0,-(y-c*2)/2])
			linear_extrude(height=y-c*2)
			offset(r=cr)
			square([x-2*cr,z-2*cr],center=true);
			
			translate([0,0,-(y-c*2)/2-c])
			linear_extrude(height=.005)
			offset(r=cr-c)
			square([x-2*(cr),z-2*(cr)],center=true);
		}
	}
	else{
			hull(){
			translate([0,0,(y-c*2)/2+c])
			linear_extrude(height=.005)
			offset(r=-c)
			circle(d=x);

			translate([0,0,-(y-c*2)/2])
			linear_extrude(height=y-c*2)
			circle(d=x);
			
			translate([0,0,-(y-c*2)/2-c])
			linear_extrude(height=.005)
			offset(r=-c)
			circle(d=x);
		}
	}
}

module add_braille(word){
	translate([0,-sat/2,0])
	rotate([90,0,0])
	word_flat(word);
}

module word_flat(word){
	translate([(-6.1*(len(word)-1)/2)*bsm,0,0])
	for(i=[0:len(word)-1]){
	   translate([6.1*i*bsm,0,0])
	   braille_by_row(braille_d[word[i]]);
	}
}
module braille_by_row(decimal){
	b1 = decimal%2;
	b1a = floor(decimal/2);
	b2 = b1a%2;
	b2a = floor(b1a/2);
	b3 = b2a%2;
	b3a = floor(b2a/2);
	b4 = b3a%2;
	b4a = floor(b3a/2);
	b5 = b4a%2;
	b5a = floor(b4a/2);
	b6 = b5a%2;
	b=[b6,b5,b4,b3,b2,b1];

	dots_letter(b);
}

module dots_letter(b){
	$fn=20;

	if (b[0]==1){
		translate([-1.25*bsm,2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
	if (b[1]==1){
		translate([1.25*bsm,2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
	if (b[2]==1){
		translate([-1.25*bsm,0,0])
		sphere(d=1.5*bsm);
	}
	if (b[3]==1){
		translate([1.25*bsm,0,0])
		sphere(d=1.5*bsm);
	}
	if (b[4]==1){
		translate([-1.25*bsm,-2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
	if (b[5]==1){
		translate([1.25*bsm,-2.5*bsm,0])
		sphere(d=1.5*bsm);
	}
}

module add_engraved_text(alignment){
	fs = "Liberation Sans:style=Bold";
	t_h = 8*bsm;
	translate([0,-insert_thickness/2++1-ff,0])
	rotate([90,0,0])
	linear_extrude(height=1)
	text(str(e_t),font=fs,size=t_h,valign="center",halign=alignment);
}


// // // module Bliss_graphic(){
	// // // chamfer = .5;
	// // // s_f=insert_tightness_of_fit/10;
	
	// // // if (path_and_filename != ""){		
		// // // difference(){
			// // // translate([0,2+insert_recess/2,0])
			// // // rotate([90,0,0])
			// // // import(file = path_and_filename,center=true);
			
			// // // translate([0,insert_thickness,0])
			// // // rotate([90,0,0])
			// // // chamfered_shape(cw+s_f/2,insert_thickness,ch+s_f/2,chamfer,cell_corner_radius);
		// // // }
	// // // }
// // // }



// Uncomment this bloc to see how to use this library.
/*
// strToInt(string [,base])

// Resume : Converts a number in string.
// string : The string you wants to converts.
// base (optional) : The base conversion of the number : 2 for binay, 10 for decimal (default), 16 for hexadecimal.
echo("*** strToInt() ***");
echo(strToInt("491585"));
echo(strToInt("01110", 2));
echo(strToInt("D5A4", 16));
echo(strToInt("-15"));
echo(strToInt("-5") + strToInt("10") + 5);

// strcat(vector [,insert])

// Resume : Concatenates a vector of words into a string.
// vector : A vector of string.
// insert (optional) : A string which will added between each words.
echo("*** strcat() ***");
v_data = ["OpenScad", "is", "a", "free", "CAD", "software."];
echo(strcat(v_data)); // ECHO: "OpenScadisafreeCADsoftware."
echo(strcat(v_data, " ")); // ECHO: "OpenScad is a free CAD software."

// substr(str, pos [,length])

// Resume : Substract a substring from a bigger string.
// str : The original string
// pos : The index of the position where the substring will begin.
// length (optional) : The length of the substring. If not specified, the substring will continue until the end of the string.
echo("*** substr() ***");
str = "OpenScad is a free CAD software.";
echo(str); // ECHO: "OpenScad is a free CAD software."
echo(substr(str, 0, 11)); // ECHO: "OpenScad is"
echo(substr(str, 12)); // ECHO: "a free CAD software."
echo(substr(str, 12, 10)); // ECHO: "a free CAD"

// fill(string, occurrences)

// Resume : Fill a string with several characters (or strings).
// string : the character or string which will be copied.
// occurrences : The number of occurences of the string.
echo("*** Fill() ***");
echo(fill("0", 4)); // ECHO: "0000"
echo(fill("hey", 3)); // ECHO: "heyheyhey"

// getsplit(string, index [,separator])

// Resume : Split a string in several words.
// string : The original string.
// index : The index of the word to get.
// separator : The separator which cut the string (default is " ").
// Note : Nowadays it's impossible to get a vector of words because we can't append data in a vector.
echo("*** getsplit() ***");
echo(getsplit(str)); // ECHO: "OpenScad"
echo(getsplit(str, 3)); // ECHO: "free"
echo(getsplit("123, 456, 789", 1, ", ")); // ECHO: "456"
*/


// function strToInt(str, base=10, i=0, nb=0) = (str[0] == "-") ? -1*_strToInt(str, base, 1) : _strToInt(str, base);
// function _strToInt(str, base, i=0, nb=0) = (i == len(str)) ? nb : nb+_strToInt(str, base, i+1, search(str[i],"0123456789ABCDEF")[0]*pow(base,len(str)-i-1));

// function strcat(v, car="") = _strcat(v, len(v)-1, car, 0);
// function _strcat(v, i, car, s) = (i==s ? v[i] : str(_strcat(v, i-1, car, s), str(car,v[i]) ));

function substr(data, i, length=0) = (length == 0) ? _substr(data, i, len(data)) : _substr(data, i, length+i);
function _substr(str, i, j, out="") = (i==j) ? out : str(str[i], _substr(str, i+1, j, out));

// function fill(car, nb_occ, out="") = (nb_occ == 0) ? out : str(fill(car, nb_occ-1, out), car);

// function getsplit(str, index=0, char=" ") = (index==0) ? substr(str, 0, search(char, str)[0]) : getsplit(   substr(str, search(char, str)[0]+1)   , index-1, char);


//************* The following code was written by ChatGPT to support Maker World customization ********************
// =========================
// 1) Whitespace / indexing (robust)
// =========================
function ord_safe(c) = (is_string(c) && len(c) > 0) ? ord(c[0]) : -1;

// ASCII control/space (<=32) + NBSP(160) + ZWSP(8203) + BOM(65279)
function is_ws_any(c) =
    is_undef(c) ? true :
    (is_string(c) && len(c) > 0 ?
        let(o = ord(c[0])) (o <= 32) || (o == 160) || (o == 8203) || (o == 65279)
        : false);

function first_non_ws_any(s, i=0) =
    (i >= len(s) || !is_ws_any(s[i])) ? i : first_non_ws_any(s, i+1);

function last_non_ws_any(s, i=-1) =
    let(idx = (i == -1) ? len(s)-1 : i)
    (idx < 0 || !is_ws_any(s[idx])) ? idx : last_non_ws_any(s, idx-1);

// Inclusive slice s[a..b], bounds-safe
function slice_inclusive(s, a, b) =
    (!is_string(s) || len(s) == 0) ? "" :
    let(
        aa0 = is_undef(a) ? 0        : a,
        bb0 = is_undef(b) ? len(s)-1 : b,
        aa  = max(0, min(aa0, len(s)-1)),
        bb  = max(0, min(bb0, len(s)-1))
    )
    (aa > bb) ? "" : _slice_inc_core(s, aa, bb, aa, "");
function _slice_inc_core(s, aa, bb, k, out) =
    (k > bb) ? out : _slice_inc_core(s, aa, bb, k+1, str(out, s[k]));

// First index of ch in [start..stop]; if stop<0 → len(s)-1
function first_index_of(s, ch, start=0, stop=-1) =
    let(st = (stop < 0) ? (len(s)-1) : stop)
    (start > st) ? -1 : _fio(s, ch, start, st, start);
function _fio(s, ch, start, stop, k) =
    (k > stop) ? -1 :
    (s[k] == ch ? k : _fio(s, ch, start, stop, k+1));

function _is_empty(t) =
    let(i = first_non_ws_any(t), j = last_non_ws_any(t)) (i > j);

// =========================
// 2) Comment stripping (respects quotes)
// =========================
function strip_comments(s) = _strip_comments_core(s, 0, false, "");
function _strip_comments_core(s, i, in_str, out) =
    (i >= len(s)) ? out :
    let(
        c        = s[i],
        quote    = (c == "\""),
        in_str2  = in_str ? (!quote) : quote,
        is_line  = (!in_str && c == "/" && i+1 < len(s) && s[i+1] == "/"),
        is_block = (!in_str && c == "/" && i+1 < len(s) && s[i+1] == "*")
    )
    is_line  ? _strip_comments_core(s, _find_eol(s, i+2), in_str, out) :
    is_block ? _strip_comments_core(s, _find_block_end(s, i+2), in_str, out) :
               _strip_comments_core(s, i+1, in_str2, str(out, c));
function _find_eol(s, k) =
    (k >= len(s)) ? k :
    ((s[k] == "\n" || s[k] == "\r") ? (k+1) : _find_eol(s, k+1));
function _find_block_end(s, k) =
    (k+1 >= len(s)) ? len(s) :
    ((s[k] == "*" && s[k+1] == "/") ? (k+2) : _find_block_end(s, k+1));

// =========================
// 3) Balanced outer [ ... ] detection (don’t strip for CSV-of-rows)
// =========================
function _find_matching_close(s, open_idx) =
    _find_matching_close_core(s, open_idx+1, 1, false);
function _find_matching_close_core(s, k, depth, in_str) =
    (k >= len(s)) ? -1 :
    let(c = s[k],
        quote = (c == "\""),
        in_str2 = in_str ? (!quote) : quote,
        depth2  = in_str ? depth
                         : depth + ((c == "[") ? 1 : 0) - ((c == "]") ? 1 : 0))
    (depth2 == 0) ? k : _find_matching_close_core(s, k+1, depth2, in_str2);

function _is_fully_wrapped(s, i, j) =
    (i < j && s[i] == "[" && s[j] == "]" && _find_matching_close(s, i) == j);

// =========================
/* 4) Number detection / conversion (ints + simple floats) */
// =========================
function _is_digit(c) = !is_undef(c) && (c >= "0" && c <= "9");

function is_num_like(t) =
    let(i = first_non_ws_any(t), j = last_non_ws_any(t))
    (i <= j) && _num_like_worker(t, i, j, i, false, false);
function _num_like_worker(t, i, j, start, seen_dot, seen_digit) =
    (i > j) ? seen_digit :
    let(c = t[i])
        ((c == "-" || c == "+") && i == start) ? _num_like_worker(t, i+1, j, start, seen_dot, seen_digit) :
        ( c == "." && !seen_dot )              ? _num_like_worker(t, i+1, j, start, true, seen_digit) :
        ( _is_digit(c) )                       ? _num_like_worker(t, i+1, j, start, seen_dot, true) :
                                                 false;

function _str_to_num(t) =
    let(i = first_non_ws_any(t), j = last_non_ws_any(t),
        neg   = (i <= j && t[i] == "-"),
        start = (neg || (i <= j && t[i] == "+")) ? i+1 : i,
        dot   = first_index_of(t, ".", start, j))
    (dot == -1)
        ? _parse_int(t, start, j, 0) * (neg ? -1 : 1)
        : (neg ? -1 : 1) * (_parse_int(t, start, dot-1, 0) + _parse_frac(t, dot+1, j, 1, 0));
function _parse_int(t, a, b, acc) =
    (a > b) ? acc : _parse_int(t, a+1, b, acc*10 + _digit_safe(t[a]));
function _parse_frac(t, a, b, place, acc) =
    (a > b) ? acc : _parse_frac(t, a+1, b, place+1, acc + _digit_safe(t[a]) * pow(10, -place));
function _digit_safe(c) = (is_undef(c) || !_is_digit(c)) ? 0 : (ord(c) - ord("0"));

// =========================
// 5) Identifier helpers + substitution (robust)
// =========================
function is_ident_start(c) =
    (!is_undef(c) && ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c == "_")));
function is_ident_rest(c) =
    is_ident_start(c) || (!is_undef(c) && (c >= "0" && c <= "9"));

// Robust: no default-arg tricks
function ident_end_index(s, start) =
    (!is_string(s) || start < 0 || start >= len(s) || !is_ident_start(s[start]))
        ? (start - 1)
        : _ident_end_index_core(s, start, start);
function _ident_end_index_core(s, start, k) =
    (k + 1 >= len(s) || !is_ident_rest(s[k + 1])) ? k : _ident_end_index_core(s, start, k + 1);

function _find_name_idx(name, names, i=0) =
    (i >= len(names)) ? -1 :
    (names[i] == name ? i : _find_name_idx(name, names, i+1));

// Substitute all identifiers *inside* token string `t` with their values (as text).
function substitute_idents_in_token(t, names, values, strict, i=0, out="") =
    (i >= len(t)) ? out :
    let(c = t[i])
    (is_ident_start(c)
        ? let(
              e    = ident_end_index(t, i),
              name = (e >= i) ? slice_inclusive(t, i, e) : "",
              idx  = (e >= i) ? _find_name_idx(name, names) : -1,
              rep  = (idx >= 0 && idx < len(values))
                        ? str(values[idx])
                        : (strict && (e >= i)) ? assert(false, str("Unknown identifier: ", name))
                                               : name
          )
          substitute_idents_in_token(
              t, names, values, strict,
              (e >= i) ? (e + 1) : (i + 1),
              str(out, (e >= i) ? rep : c)
          )
        : substitute_idents_in_token(t, names, values, strict, i + 1, str(out, c))
    );

// Extract identifiers from tokens like "swm-10/2" → ["swm"]
function idents_in_token(t, i=0, acc=[]) =
    (i >= len(t)) ? acc :
    let(c = t[i])
    (is_ident_start(c)
        ? let(
              e    = ident_end_index(t, i),
              name = (e >= i) ? slice_inclusive(t, i, e) : ""
          )
          idents_in_token(
              t,
              (e >= i) ? (e + 1) : (i + 1),
              (e >= i) ? concat(acc, [name]) : acc
          )
        : idents_in_token(t, i + 1, acc)
    );

// =========================
// 6) Expression evaluator (+ - * /, parentheses, unary ±)
// =========================
function skip_ws(s, i) = (i < len(s) && is_ws_any(s[i])) ? skip_ws(s, i+1) : i;
function is_num_start_char(c) = _is_digit(c) || (c == ".");

// scan number end (digits + optional single dot)
function scan_number_end(s, i, seen_dot=false) =
    (i >= len(s)) ? (i-1) :
    let(c = s[i])
    (_is_digit(c) ? scan_number_end(s, i+1, seen_dot) :
     (c == "." && !seen_dot) ? scan_number_end(s, i+1, true) :
     (i-1));

function parse_number_at(s, i) =
    let(i1 = skip_ws(s, i))
    (i1 >= len(s) || !is_num_start_char(s[i1]))
        ? [false, 0, i]
        : let(j = scan_number_end(s, i1),
              num = _str_to_num(slice_inclusive(s, i1, j)))
          [true, num, j+1];

function parse_factor(s, i) =
    let(i1 = skip_ws(s, i))
    (i1 < len(s) && s[i1] == "(")
        ? let(r = parse_expr(s, i1+1),
              ok = r[0], val = r[1], k = r[2],
              k1 = skip_ws(s, k))
          (ok && k1 < len(s) && s[k1] == ")"
              ? [true, val, k1+1]
              : [false, 0, i])
    : (i1 < len(s) && (s[i1] == "-" || s[i1] == "+"))
        ? let(r = parse_factor(s, i1+1))
          (r[0] ? [true, (s[i1] == "-" ? -r[1] : r[1]), r[2]] : [false, 0, i])
    : parse_number_at(s, i1);

function parse_term_loop(s, acc, i) =
    let(i1 = skip_ws(s, i))
    (i1 < len(s) && (s[i1] == "*" || s[i1] == "/"))
        ? let(rf = parse_factor(s, i1+1))
          (rf[0]
              ? parse_term_loop(s, (s[i1] == "*" ? acc*rf[1] : acc/rf[1]), rf[2])
              : [false, 0, i])
        : [true, acc, i1];

function parse_term(s, i) =
    let(r = parse_factor(s, i))
    (r[0] ? parse_term_loop(s, r[1], r[2]) : r);

function parse_expr_loop(s, acc, i) =
    let(i1 = skip_ws(s, i))
    (i1 < len(s) && (s[i1] == "+" || s[i1] == "-"))
        ? let(rt = parse_term(s, i1+1))
          (rt[0]
              ? parse_expr_loop(s, (s[i1] == "+" ? acc+rt[1] : acc-rt[1]), rt[2])
              : [false, 0, i])
        : [true, acc, i1];

function parse_expr(s, i) =
    let(r = parse_term(s, i))
    (r[0] ? parse_expr_loop(s, r[1], r[2]) : r);

// Try to fully evaluate `t` → [ok, value]
function eval_expr_full(t) =
    let(r = parse_expr(t, 0), ok = r[0], i2 = skip_ws(t, r[2]))
    (ok && i2 == len(t)) ? [true, r[1]] : [false, 0];

// =========================
// 7) Base mixed parser (numbers, quoted strings, identifiers, nesting)
// =========================
function parse_csv_mixed(s) = _csv_loop_mixed(s, 0, 0, "", [], false);

function _csv_loop_mixed(s, i, depth, tok, acc, in_str) =
    (i >= len(s))
        ? _append_token_mixed(acc, tok)
        : let(
              c        = s[i],
              quote    = (c == "\""),
              in_str2  = in_str ? (!quote) : quote,   // toggle on "
              open     = (!in_str && c == "["),
              close    = (!in_str && c == "]"),
              comma0   = (!in_str && c == "," && depth == 0),
              depth2   = depth + (open ? 1 : 0) - (close ? 1 : 0),
              tok2     = (is_ws_any(c) && !in_str) ? tok : str(tok, c),
              acc2     = comma0 ? _append_token_mixed(acc, tok) : acc,
              tok3     = comma0 ? "" : tok2
          )
          _csv_loop_mixed(s, i+1, depth2, tok3, acc2, in_str2);

function _append_token_mixed(acc, tok) =
    _is_empty(tok) ? acc : concat(acc, [ _parse_element(tok) ]);

function _parse_element(tok) =
    let(i = first_non_ws_any(tok), j = last_non_ws_any(tok))
    (i > j) ? "" :
    let(a = tok[i], b = tok[j], t = slice_inclusive(tok, i, j))
        (a == "[" && b == "]") ? parse_csv_mixed(slice_inclusive(tok, i+1, j-1)) :
        (a == "\"" && b == "\"") ? slice_inclusive(tok, i+1, j-1) :
        (is_num_like(t) ? _str_to_num(t) : t);     // unquoted → raw token text

// =========================
// 8) Tagged parser (to discover IDs from the string)
// =========================
function parse_csv_mixed_tagged(s) = _csv_loop_mixed_tagged(s, 0, 0, "", [], false);

function _csv_loop_mixed_tagged(s, i, depth, tok, acc, in_str) =
    (i >= len(s))
        ? _append_token_mixed_tagged(acc, tok)
        : let(
              c        = s[i],
              quote    = (c == "\""),
              in_str2  = in_str ? (!quote) : quote,
              open     = (!in_str && c == "["),
              close    = (!in_str && c == "]"),
              comma0   = (!in_str && c == "," && depth == 0),
              depth2   = depth + (open ? 1 : 0) - (close ? 1 : 0),
              tok2     = (is_ws_any(c) && !in_str) ? tok : str(tok, c),
              acc2     = comma0 ? _append_token_mixed_tagged(acc, tok) : acc,
              tok3     = comma0 ? "" : tok2
          )
          _csv_loop_mixed_tagged(s, i+1, depth2, tok3, acc2, in_str2);

function _append_token_mixed_tagged(acc, tok) =
    _is_empty(tok) ? acc : concat(acc, [ _parse_element_tagged(tok) ]);

function _parse_element_tagged(tok) =
    let(i = first_non_ws_any(tok), j = last_non_ws_any(tok))
    (i > j) ? ["EMPTY"] :
    let(a = tok[i], b = tok[j], t = slice_inclusive(tok, i, j))
        (a == "[" && b == "]") ? parse_csv_mixed_tagged(slice_inclusive(tok, i+1, j-1)) :
        (a == "\"" && b == "\"") ? ["STR", slice_inclusive(tok, i+1, j-1)] :
        (is_num_like(t) ? ["NUM", _str_to_num(t)] : ["ID", t]);

// flat collector (also digs IDs out of expression tokens)
function collect_identifiers_from_tagged(v) =
    is_list(v)
        ? (len(v) > 0 && is_string(v[0]) && v[0] == "ID"
            ? idents_in_token(v[1])
            : [ for (e = v) each collect_identifiers_from_tagged(e) ])
        : [];

function uniq(xs, i=0, acc=[]) =
    (i >= len(xs)) ? acc :
    uniq(xs, i+1, contains(acc, xs[i]) ? acc : concat(acc, [xs[i]]));
function contains(xs, x, i=0) =
    (i >= len(xs)) ? false :
    (xs[i] == x ? true : contains(xs, x, i+1));

// =========================
// 9) Top-level parsers with comment stripping + correct wrapper detection
// =========================
function parse_csv_mixed_top(s) =
    let(
        s0 = strip_comments(s),
        i  = first_non_ws_any(s0), j = last_non_ws_any(s0)
    )
    (_is_fully_wrapped(s0, i, j)
        ? parse_csv_mixed(slice_inclusive(s0, i+1, j-1))
        : parse_csv_mixed(slice_inclusive(s0, i,   j  )));

function parse_csv_mixed_tagged_top(s) =
    let(
        s0 = strip_comments(s),
        i  = first_non_ws_any(s0), j = last_non_ws_any(s0)
    )
    (_is_fully_wrapped(s0, i, j)
        ? parse_csv_mixed_tagged(slice_inclusive(s0, i+1, j-1))
        : parse_csv_mixed_tagged(slice_inclusive(s0, i,   j  )));

// =========================
// 10) Per-input packaging using GLOBAL registry (optional)
// =========================
function vector_variable_parser(s, strict=true) =
    let(
        s0     = strip_comments(s),
        i      = first_non_ws_any(s0), j = last_non_ws_any(s0),
        s_trim = (i > j) ? "" : slice_inclusive(s0, i, j),
        tagged = parse_csv_mixed_tagged_top(s_trim),
        namesU = uniq(collect_identifiers_from_tagged(tagged)),
        valsU  = [ for (nm = namesU)
                    let(idx = _find_name_idx(nm, RESOLVE_NAMES))
                      (idx >= 0 && idx < len(RESOLVE_VALUES))
                        ? RESOLVE_VALUES[idx]
                        : (strict ? assert(false, str("Unknown identifier: ", nm)) : nm) ]
    )
    [ s_trim, namesU, valsU, strict ];

// =========================
// 11) Resolvers (with substitution + evaluation)
// =========================
function parse_csv_mixed_top_resolve(pkg_or_s, names=undef, values=undef, strict=false) =
    is_list(pkg_or_s) && is_undef(names)
        ? _parse_csv_mixed_top_resolve_core(pkg_or_s[0], pkg_or_s[1], pkg_or_s[2],
                                            (len(pkg_or_s) > 3) ? pkg_or_s[3] : false)
        : _parse_csv_mixed_top_resolve_core(pkg_or_s, names, values, strict);

function _parse_csv_mixed_top_resolve_core(s, names, values, strict=false) =
    let(
        s0 = strip_comments(s),
        i  = first_non_ws_any(s0), j = last_non_ws_any(s0)
    )
    parse_csv_mixed_resolve(
        _is_fully_wrapped(s0, i, j) ? slice_inclusive(s0, i+1, j-1) : slice_inclusive(s0, i, j),
        names, values, strict);

function parse_csv_mixed_resolve(s, names, values, strict) =
    _csv_loop_mixed_resolve(s, 0, 0, "", [], false, names, values, strict);

function _csv_loop_mixed_resolve(s, i, depth, tok, acc, in_str, names, values, strict) =
    (i >= len(s))
        ? _append_token_mixed_resolve(acc, tok, names, values, strict)
        : let(
              c        = s[i],
              quote    = (c == "\""),
              in_str2  = in_str ? (!quote) : quote,
              open     = (!in_str && c == "["),
              close    = (!in_str && c == "]"),
              comma0   = (!in_str && c == "," && depth == 0),
              depth2   = depth + (open ? 1 : 0) - (close ? 1 : 0),
              tok2     = (is_ws_any(c) && !in_str) ? tok : str(tok, c),
              acc2     = comma0 ? _append_token_mixed_resolve(acc, tok, names, values, strict) : acc,
              tok3     = comma0 ? "" : tok2
          )
          _csv_loop_mixed_resolve(s, i+1, depth2, tok3, acc2, in_str2, names, values, strict);

function _append_token_mixed_resolve(acc, tok, names, values, strict) =
    _is_empty(tok) ? acc : concat(acc, [ _parse_element_resolve(tok, names, values, strict) ]);

function _parse_element_resolve(tok, names, values, strict) =
    let(i = first_non_ws_any(tok), j = last_non_ws_any(tok))
    (i > j) ? "" :
    let(a = tok[i], b = tok[j], t0 = slice_inclusive(tok, i, j))
        (a == "[" && b == "]")
            ? parse_csv_mixed_resolve(slice_inclusive(tok, i+1, j-1), names, values, strict)
        : (a == "\"" && b == "\"")
            ? slice_inclusive(tok, i+1, j-1) // quoted string
        : let(tSub = substitute_idents_in_token(t0, names, values, strict),
              ev  = eval_expr_full(tSub))
            (ev[0] ? ev[1] : (is_num_like(tSub) ? _str_to_num(tSub) : tSub));  // number if evaluable

// =========================
// 12) Convenience: always return 2D rows
// =========================
function _ensure_2d_rows(v) = (len(v) == 0) ? [] : (is_list(v[0]) ? v : [v]);

function parse_csv_mixed_top_resolve_auto(s, strict=false) =
    _parse_csv_mixed_top_resolve_core(s, RESOLVE_NAMES, RESOLVE_VALUES, strict);

// One-liner for Customizer strings (always returns 2D)
function parse_user_vector(s, strict=false) =
    _ensure_2d_rows( parse_csv_mixed_top_resolve_auto(s, strict) );
