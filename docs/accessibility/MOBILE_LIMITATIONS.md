# Mobile Browser Limitations

The app works on mobile browsers (iOS Safari, Android Chrome) but with limitations due to hardware constraints.

## Memory

Mobile browsers have stricter memory limits (256-512MB vs 1-2GB on desktop). Complex models may fail with out-of-memory errors or crash the browser tab.

Workarounds:
- Reduce `$fn` value (e.g., 32 instead of 100)
- Simplify geometry
- Use preview quality for iteration
- Close other tabs, restart browser if errors persist

## Rendering performance

Mobile CPUs are slower. Expect 2-3x longer render times:
- Preview: 5-15 seconds (vs 2-8s on desktop)
- Full quality: 30-120 seconds (vs 10-60s on desktop)

The app auto-adjusts quality settings on mobile. Test complex models on desktop first.

## Which interface you get on a phone

The **Assistive Forge** interface works on phones and tablets. The **Classic**
interface does not: it reproduces a desktop application window, and has no
mobile version. On a narrow screen the app keeps you in the Assistive
Forge interface, and it says so rather than silently ignoring the choice. Your
saved preference is not overwritten, so Classic comes back when you next open
the app on a desktop.

## The layout on a phone

Held upright, the header holds Main Page (twice a button wide, with its words
except in high contrast), the Simplified/Standard switch, GitHub and Keys. The
Customizer button heads the Preview Settings row, before the settings arrow.
The Customizer comes in from the left over the preview, the way it opens beside
the preview on a desktop, and closes by its own arrow, as it does there. It is
see-through, so the model shows behind it while you change a value, and a
strip of the preview stays in view at its right. Drag the grip on its right
edge to make it wider or narrower (with a keyboard, the arrow keys move the
grip); the width is kept. Preferences > 3D View sets how solid it is; high
contrast, and a system setting that asks for less transparency, keep it solid.
In it, each number box is as wide as its value, with its slider beside it;
elsewhere a slider's value sits at its right, with its label above it. Preview
Settings & Info drops from its row. The camera controls open in a see-through
drawer as tall as its buttons, with a picture on each view button; one drawer
is open at a time. Full Screen with a drawer open gives the drawer the room its
controls need and the preview the rest, and keeps the button that leaves it.

Held sideways, the header and the menu bar each keep to one row, with the
Customizer button at the head of the header; from 740 px wide the buttons keep
their words. The camera controls open as a see-through column at the right
edge, and the Customizer is a column beside the preview; from 768 px wide it
starts closed. A menu opens as a sheet with its close button, upright or
sideways, and Preferences keeps its tabs and Done in view while its settings
scroll.

## Viewport and keyboard

The layout adjusts when the virtual keyboard appears. Uses CSS `dvh` units with
a fallback for older browsers.

## Touch targets

All interactive elements meet the 44x44px minimum (WCAG 2.1 Level AAA). Slider thumbs are 32px on mobile (vs 20px on desktop).

## File upload on iOS

File picker works. Drag-and-drop not supported on iOS (falls back to picker automatically).

## SharedArrayBuffer

Some older browsers don't support SharedArrayBuffer. The app falls back to single-threaded WASM which is slower but functional. Update to latest browser for best performance.

## 3D preview

Large meshes (>100K triangles) may cause lag. Very large meshes (>500K) may not render at all. Preview quality reduces complexity automatically.

## PWA support

Install as a standalone app:
- iOS: Safari → Share → Add to Home Screen
- Android: Chrome → Menu → Add to Home Screen

PWA mode gives full-screen experience and offline support after initial load.

## Feature matrix

| Feature | iOS Safari | Android Chrome | Firefox Android |
|---------|-----------|----------------|-----------------|
| File upload | Yes | Yes | Yes |
| ZIP support | Yes | Yes | Yes |
| 3D preview | Yes | Yes | Yes |
| STL download | Yes | Yes | Yes |
| PWA install | Yes | Yes | Yes |
| Offline mode | Yes | Yes | Yes |
| Drag and drop | No | Yes | Yes |
| Keyboard shortcuts | Limited | Limited | Limited |

## Best practices

1. Start with simple models
2. Use preview quality for iteration
3. Install as PWA for best experience
4. Use landscape orientation
5. Close other tabs when rendering
6. Test complex models on desktop

## Accessibility

VoiceOver (iOS) and TalkBack (Android) work. High contrast mode, scalable text, and touch targets are all supported.
