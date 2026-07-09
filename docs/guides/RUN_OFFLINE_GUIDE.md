# Run Offline (Install as a Desktop App)

OpenSCAD Assistive Forge is a Progressive Web App (PWA). You can install it from your browser as a regular desktop app and run it fully offline -- no installer, no admin rights, no IT executable approval.

## TL;DR

1. Visit `https://openscad-assistive-forge.pages.dev/` in Chrome or Edge.
2. Click the install icon in the right side of the address bar (or open the browser menu and choose **Install OpenSCAD Assistive Forge**).
3. The app opens in its own window. It is now in your Start menu (Windows), Applications folder (macOS), or app launcher (Linux), and works offline from this point on.

---

## What you get

- A Start menu / dock / launcher icon for the app
- Its own window with no browser address bar or tabs
- Full offline use after the first visit -- WASM, fonts, libraries, and examples are cached locally
- Automatic updates whenever you are online (with an in-app banner before the update applies)
- No installer file to download
- No administrator rights needed
- No need for IT to approve a new executable -- it is just a website your browser remembers

---

## Install on Chrome

Works on Chrome desktop on Windows, macOS, and Linux.

1. Open `https://openscad-assistive-forge.pages.dev/` in Chrome.
2. Look at the right side of the address bar. You will see a small install icon (a monitor with a down arrow), often with a tooltip like **Install OpenSCAD Assistive Forge**.
3. Click the install icon. A confirmation dialog appears.
4. Click **Install**.

If you do not see the install icon:

- Open the Chrome menu (three vertical dots, top right) -> **Cast, save, and share** -> **Install page as app** (wording varies by Chrome version; older builds say **Install OpenSCAD Assistive Forge** directly under the menu).

After installing:

- **Windows**: an entry called **OpenSCAD Assistive Forge** appears in the Start menu and can be pinned to taskbar.
- **macOS**: the app appears in **Applications** and Launchpad.
- **Linux**: a launcher entry is created in your applications menu (exact location depends on desktop environment).

Launching from any of these opens the app in its own window with no browser chrome.

---

## Install on Edge

Works on Microsoft Edge on Windows and macOS.

1. Open `https://openscad-assistive-forge.pages.dev/` in Edge.
2. Click the install icon on the right side of the address bar (a monitor with a down arrow).
3. In the dialog, click **Install**. Edge asks whether to pin to taskbar / Start / desktop -- pick whatever you prefer.

If you do not see the install icon:

- Open the Edge menu (three horizontal dots, top right) -> **Apps** -> **Install this site as an app**.

After installing on Windows, the app appears under **Microsoft Edge -> Apps** in Start, and as a normal Start menu entry if you accepted the pin prompt. On macOS it appears in **Applications**.

---

## Other browsers

- **Firefox (desktop)**: does not currently support installing PWAs as standalone apps on desktop. The site still works as a normal tab and the service worker still caches everything for offline use, you just will not get a separate window or Start menu entry.
- **Safari (macOS)**: install-as-app is not supported on macOS Safari. Use Chrome or Edge if you want the desktop-app experience.
- **Safari (iPadOS / iOS)**: tap the share icon and choose **Add to Home Screen**. This gives you a home-screen icon that opens in a standalone window.

---

## Verify it works offline

You only need to do this once after installing.

1. Open the installed app at least once while online and let it finish loading (the page should be fully interactive and the example model should render).
2. Disable wifi / unplug the network cable / put the device in airplane mode.
3. Re-launch the app from the Start menu (Windows), Applications folder (macOS), or app launcher (Linux).
4. The app should load and still let you open an example, change parameters, and render. Exporting STL/OBJ/3MF works too.

If it does not load offline, see [Troubleshooting](#troubleshooting) below.

---

## Updates

You do not need to do anything to update.

- When you launch the app while online, the browser quietly checks for a new version in the background.
- If a new version is available, an **update banner** appears inside the app asking you to refresh. Click **Refresh** and the new version takes over.
- If you ignore the banner, the new version installs automatically the next time you fully close and reopen the app.

You will never lose unsaved work to an update -- the banner waits for you to choose.

---

## Uninstall

### Windows / Linux (Chrome or Edge)

1. Open the installed app.
2. Click the three-dot menu in the top right of the app window.
3. Choose **Uninstall OpenSCAD Assistive Forge**.
4. Optional: tick **Also clear data from Chrome** / **Also clear data from Microsoft Edge** to remove the cache and any saved preferences.

You can also uninstall from `chrome://apps` (Chrome) or `edge://apps` (Edge): right-click the app tile and choose **Remove from...**.

### macOS

Drag the installed app from **Applications** to the Trash, then empty the Trash. To also remove cached data, open Chrome / Edge -> Settings -> **Privacy and security** -> **Site Settings** -> **All sites** and remove `openscad-assistive-forge.pages.dev`.

---

## For workshops and travel

If you are running a workshop, training day, or any session where the venue's network might be flaky or locked down, install the app **before you travel**:

1. At your home or office, on the laptop you will use:
   - Visit `https://openscad-assistive-forge.pages.dev/`.
   - Install the app via the browser address bar (see Chrome / Edge sections above).
   - Open the installed app once and wait until the example model finishes rendering. This guarantees the WASM, fonts, libraries, and example files are fully cached.
2. Disable your wifi and re-launch the installed app. Confirm it still loads and renders.
3. Re-enable wifi.
4. The laptop is now ready for the workshop -- the app will work without internet at the venue.

If you have multiple workshop laptops, repeat on each one. There is no central deployment step; each browser caches independently.

---

## For IT-managed devices (force-install via group policy)

If you administer Windows or ChromeOS devices with Chrome or Edge under group policy / MDM, you can silently install the PWA for an entire user group. The user does not have to click the install icon themselves -- the app appears in their Start menu after their next sign-in.

### Chrome (`WebAppInstallForceList`)

JSON value to set on the `WebAppInstallForceList` policy (Chrome) or `WebAppInstallForceList` policy (Edge -- same key name):

```json
[
  {
    "url": "https://openscad-assistive-forge.pages.dev/",
    "default_launch_container": "window",
    "create_desktop_shortcut": true,
    "fallback_app_name": "OpenSCAD Assistive Forge"
  }
]
```

- `default_launch_container: "window"` makes the app open in its own standalone window (matching a normal install).
- `create_desktop_shortcut: true` adds a desktop icon (Windows / Linux). Omit if you only want the Start menu entry.
- `fallback_app_name` is shown if the manifest is unreachable at install time.

Reference: [Chrome Enterprise -- WebAppInstallForceList policy](https://chromeenterprise.google/policies/#WebAppInstallForceList).

### Microsoft Edge

The same `WebAppInstallForceList` policy is supported in Edge under **Microsoft Edge -- Configure list of force-installed Web Apps**. The JSON shape is identical.

Reference: [Microsoft Learn -- ConfigureList of force-installed web apps](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies#webappinstallforcelist).

### Microsoft Intune

Intune can deploy the same Edge / Chrome policy via the **Settings catalog** (search for `WebAppInstallForceList`) or as an **Administrative template**. Push the JSON above as the policy value.

For a longer security walk-through aimed at IT directors and approvers, see [IT Approval Guide](IT_APPROVAL_GUIDE.md).

---

## Troubleshooting

### The install icon does not appear in the address bar

- Make sure you are on **Chrome desktop** or **Edge desktop**. Firefox desktop and Safari macOS do not show the install option.
- Make sure you visited `https://openscad-assistive-forge.pages.dev/` directly (not a tab opened in an iframe, in-app browser, or web view). PWAs only install from the top-level page.
- Hard-refresh the page (`Ctrl+Shift+R` on Windows / Linux, `Cmd+Shift+R` on macOS) and wait a few seconds for the manifest to be picked up.
- Try the menu fallback: Chrome menu -> **Cast, save, and share** -> **Install page as app**, or Edge menu -> **Apps** -> **Install this site as an app**.

### Offline stops working after a while

- Open the installed app while online, click the three-dot menu in the app window -> **Settings** (Chrome) or open the dev tools (`F12`) -> **Application** tab -> **Service Workers** and confirm the worker for `openscad-assistive-forge.pages.dev` is **activated and running**.
- If it shows an error, click **Update** in DevTools and reload. The next page-load reinstalls the cache.

### I want to clear the cache and reinstall

1. Uninstall the app (see [Uninstall](#uninstall)).
2. In Chrome / Edge, open `chrome://settings/content/all` (or `edge://settings/content/all`), find `openscad-assistive-forge.pages.dev`, and click **Clear data**.
3. Visit the site again and reinstall. The browser will re-download all cached assets.

### Nothing happens when I click "Install"

- Try a different browser (Chrome <-> Edge) to rule out a corrupt browser profile.
- Check whether your organization has a policy that blocks PWA installs. Chrome's `WebAppInstallForceList` (above) is the *opposite* policy -- some orgs set `WebAppBlocklist` or `DefaultPopupsSetting` in a way that prevents installs. Ask IT to allowlist `https://openscad-assistive-forge.pages.dev/`.

---

## Related documentation

- [IT Approval Guide](IT_APPROVAL_GUIDE.md) -- for IT and security teams reviewing the app for allowlisting or enterprise deployment.
- [Getting Started](GETTING_STARTED.md) -- your first five minutes with the app once it is installed.
- [Accessibility Guide](ACCESSIBILITY_GUIDE.md) -- keyboard, screen reader, and high contrast notes.
