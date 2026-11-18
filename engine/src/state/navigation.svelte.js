// Scene navigation settings (flyNavigation.ts, NavigationPanel.svelte) and the
// chosen control scheme, remembered per viewer installation.

const SETTINGS_KEY = 'ply-visualizer.navigation.v1';
const SCHEME_KEY = 'ply-visualizer.controlScheme.v1';

export const CONTROL_SCHEMES = /** @type {const} */ ([
  'trackball',
  'orbit',
  'legacy-trackball',
  'arcball',
  'fly',
]);

/** Fly speed multiplier range (×, log scale on the slider). */
export const FLY_SPEED_MIN = 0.05;
export const FLY_SPEED_MAX = 20;

/**
 * @typedef {{
 *   alwaysFps: boolean;
 *   trackpad: boolean;
 *   speed: number;
 *   lookSensitivity: number;
 *   hidden: boolean;
 *   rect: { x: number; y: number; w: number } | null;
 * }} NavigationSettings
 */

/** @returns {NavigationSettings} */
function loadSettings() {
  /** @type {NavigationSettings} */
  const fallback = {
    alwaysFps: false,
    trackpad: false,
    speed: 1,
    lookSensitivity: 1,
    hidden: true,
    rect: null,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const clamp = (
      /** @type {unknown} */ v,
      /** @type {number} */ lo,
      /** @type {number} */ hi,
      /** @type {number} */ d
    ) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    return {
      alwaysFps: parsed.alwaysFps === true,
      trackpad: parsed.trackpad === true,
      speed: clamp(parsed.speed, FLY_SPEED_MIN, FLY_SPEED_MAX, 1),
      lookSensitivity: clamp(parsed.lookSensitivity, 0.1, 5, 1),
      hidden: parsed.hidden !== false,
      rect:
        parsed.rect && Number.isFinite(parsed.rect.x) && Number.isFinite(parsed.rect.y)
          ? { x: parsed.rect.x, y: parsed.rect.y, w: Number(parsed.rect.w) || 260 }
          : null,
    };
  } catch {
    return fallback;
  }
}

/** Navigation options; every change goes through saveNavigation(). */
export const navigation = $state(loadSettings());

export function saveNavigation() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(navigation));
  } catch {
    // Storage may be unavailable (private window, webview policy).
  }
}

/**
 * Shows or hides the floating navigation panel, announced as a
 * `navigation-panel-visibility` window event so a host (the desktop View
 * menu) can mirror it.
 * @param {boolean} hidden
 */
export function setNavigationPanelHidden(hidden) {
  navigation.hidden = hidden;
  saveNavigation();
  window.dispatchEvent(
    new CustomEvent('navigation-panel-visibility', { detail: { visible: !hidden } })
  );
}

export function toggleNavigationPanel() {
  setNavigationPanelHidden(!navigation.hidden);
}

/**
 * The control scheme chosen last time, or the default.
 * @returns {'trackball' | 'orbit' | 'legacy-trackball' | 'arcball' | 'fly'}
 */
export function loadControlScheme() {
  try {
    const saved = localStorage.getItem(SCHEME_KEY);
    const known = CONTROL_SCHEMES.find(scheme => scheme === saved);
    if (known) return known;
  } catch {
    // Fall through to the default.
  }
  return 'legacy-trackball';
}

/** @param {string} scheme */
export function saveControlScheme(scheme) {
  try {
    localStorage.setItem(SCHEME_KEY, scheme);
  } catch {
    // Not remembered; the default applies next time.
  }
}
