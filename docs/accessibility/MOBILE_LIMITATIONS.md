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

Held upright, the header's first row holds the Customizer and Main Page
buttons (as arrows), the Simplified/Standard switch, GitHub and Keys. The
Customizer opens as a sheet above a one-row bottom bar, and Preview Settings &
Info drops from its row, so the preview keeps the top half of the screen while
you change a value. The camera controls open in a see-through drawer within
half the screen, with a picture on each view button; one drawer is open at a
time. Full Screen with a drawer open splits the screen in half, and keeps the
button that leaves it.

Held sideways, the header and the menu bar each keep to one row, the camera
controls open as a see-through column at the right edge, and the Customizer is
a column beside the preview; from 768 px wide it starts closed.

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
