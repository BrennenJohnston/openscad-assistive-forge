# Alt View sounds: every input and what it plays

The Alt View tries to make the interface feel like hardware: a press is a
key, a slider is a dial, a drawer slides on rails. This note lists every
kind of input in the page, in both of the look's styles (the phosphor
looks, green and amber, and the blue DOS look that Classic wears), with
the sound it plays or the reason it plays none.

Every sound follows Preferences > Play sounds and the look's Sounds
button, plays only while the look is on, and passes through its group's
level and one master (`src/js/crt-sounds.js`). The levels are set as the
ear weighs them against a key press, every sound within 20 dB of every
other: the rarest (the screen coming on) a few dB over a key, the most
frequent (dial clicks, the 3D view's ticks, typing, scrolling) the
furthest under, so none stands out and none is lost when the volume
moves. Under Play sounds,
Preferences > Advanced > Sounds in Alt View turns each kind off on its
own: keys, sliders and grips, the 3D view, drawers, switches and lists,
menus and dialogs, typing, scrolling; the look's own switch sounds follow
Play sounds alone. Reduced motion changes how
things move, not what they sound like. A sound never stands in for a
spoken sentence: what a control says, it still says.

## Controls

| Input | Where | Sound |
|---|---|---|
| A button, a menu item, a tab | everywhere | A key, by the button's size: a press and a release in the phosphor looks, one stroke in the DOS look |
| A disclosure (a `summary`) | the Customizer's groups, the guide, Preferences | A key, as a button |
| A link | the guide, About, the welcome screen | A key, as a button |
| A file chooser drawn as a button (a label around a file input) | the welcome screen's upload area, Browse and Upload for a reference image, Add File | A key, as a button, once a press, whether the label or its input has the focus |
| A press with no key of its own first (a screen reader's Enter in browse mode, a controller's A button) | everywhere | A key, press and release together |
| A checkbox, an on and off switch | the Customizer's on and off switches, Preferences, Simplified and Standard | A lever flipped: up for on, down for off (a heavy light switch), two takes each way, each flip a little different, a little under a key |
| A radio button | Preferences, the export choices | A small snap as it is chosen |
| A list (`select`) or a color well | the Customizer's choices, Preferences, the export format | A selector click when it opens, another when a choice is made |
| A slider | the Customizer, the Alt View's own sliders | A dial click per step, its tone by how many steps the slider has, each click a little different in pitch, 15 a second at most, a little under a key |
| A number box's arrows | the Customizer, Classic's Viewport-Control | A dial click per step, as a slider |
| Typing in a field | text and number boxes, search, the code editor | A quiet key per keystroke (the look's smallest key, 12 dB under the others), 15 a second at most |
| A grip | the Customizer's width on a phone, the desktop divider, Classic's dividers | A slide tick for every 2 % of the window it moves, 15 a second at most |
| The 3D view, moved by hand | a drag, the wheel, a pinch, the arrow keys on the view, a controller's sticks | A bearing every 15 degrees turned, a ratchet every 10 tilted, a lens detent every 5 % zoomed, well under the keys, the lens detent first, the ratchet a shade under it and the bearing (short and soft) under both; each a little lower turning left, tilting down or zooming out than the other way, and never quite the same twice |
| The 3D view panned, by hand or by its pan buttons | a drag with the right button, Shift and an arrow key on the view, a controller's left stick, the pan buttons in the camera panel and the phone's camera drawer | One motion of the stage under the lens: the motor's run-up once the view has moved 5 % of the camera's distance across or up, its run looping while the view keeps moving, and its wind-down once the view has rested for 100 ms, which trails the stop by up to 0.4 s (the loud part within 0.2 s), as a real stage coasts; a little higher panning right or up, a little lower left or down; the run-up and wind-down at the ratchet's level, the run under them. A pan button is one short motion: the run-up, then the wind-down from its end |
| A camera button that turns, tilts or zooms the view | the camera panel and the phone's camera drawer (rotate and zoom), Classic's 3D view toolbar (zoom) | The view's own tick for the move instead of a key: the bearing for left and right, the ratchet for up and down, the lens detent for in and out. Reset and the views are keys |
| Scrolling by hand | the Customizer, the menus, Classic's panes, the guide, dialogs | A typewriter platen's line for every 40 px the list moves, going down a little lower and up a little higher, 14 a second at most, quiet in the background; the end of the list once, a lower, duller tick. A scroll the page makes itself (a field brought into view, a jump to a group) is silent |
| The Alt View key | the header | A screen coming on, changing look, or going off, a little over a key |
| The Sounds button | the header | A key when it turns sounds on; nothing when it turns them off |

## Drawers, menus and dialogs

| Input | Where | Sound |
|---|---|---|
| A drawer opening or closing | the Customizer, Preview Settings, the camera panel, the Lens drawer, the phone's camera and Lens drawers; in Classic the editor, the bottom strip and the Customizer | Opening: the latch letting go at the press and the glide out on its rollers together, then a soft thump as the drawer meets its stop on screen. Shutting: the latch gently gripped open at the press and the glide, a muffled, quieter thump as the drawer meets the closed stop, then the latch released 120 ms later, as a hand lets go. The same drawer in every look, a little under the keys, its stops under its latch and glide. The drawer's own button plays no key: the drawer is the sound. A drawer turned round in mid-slide fades its glide out and drops the parts still to come; with reduced motion there is no glide, only the latches and the thump. When the look comes on, the drawers that open again one by one each play their opening |
| A menu or a dialog opening or closing | the menus, Preferences, the guide, every dialog, the camera's keyboard shortcuts | A latch opening, or a latch closing |

## Silent, and why

| Input | Why it is silent |
|---|---|
| Hovering, moving focus with Tab | Nothing is pressed or changed. Focus moves are spoken by a screen reader; a sound for each would bury that |
| Tooltips | They appear on their own, not at a press |
| Spoken updates (live regions) | They are speech; a sound on top would cover the words |
| Keyboard shortcuts (Ctrl and a letter) | No control on the screen is pressed, and the keyboard under the hands already makes its own sound; what the shortcut does is heard or shown |
| The system's file chooser | It is the system's own window; the button that opened it plays its key |
| A file dropped on the page | No control is pressed; what the file does next is shown and spoken |
| A drawer laid out at once (the window resized past a phone's width, Classic entered) | No one moved it: the layout changed under it |
