/**
 * Body-level record of which surface is on screen: the welcome screen or an
 * open project.
 *
 * classic.css keys the Classic welcome-screen chrome hide off this attribute
 * (U-22, UF-13): the icon toolbar and status bar have nothing to act on until
 * a project opens. The menu bar reaches the same answer through
 * applyToolbarModeVisibility, which reads #mainInterface's hidden class at
 * call time; this attribute is the CSS-visible form of that same truth, so
 * every welcome/project flip site must call setAppSurface alongside its
 * classList changes. index.html ships the body with
 * data-app-surface="welcome" so first paint agrees before any script runs.
 *
 * Deliberately NOT conflated with the View > Hide Classic Toolbar preference
 * (data-classic-toolbar-hidden): that is the user's stored choice about the
 * project surface, and it must survive welcome round-trips untouched.
 */

/** @param {'welcome'|'project'} surface */
export function setAppSurface(surface) {
  document.body.dataset.appSurface = surface;
}
