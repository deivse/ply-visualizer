// How the file list shows names: the full path on disk instead of the name
// (where the host knows it), and shortening of the parts all names share.
// Both apply to every file; remembered per viewer installation and kept in
// step across windows. The desktop app mirrors them in View → Files.
import { originalNamesState, toggleAllOriginalNames } from './fileAliases.svelte';

const KEY = 'ply-visualizer.fileNames.v1';

/** @typedef {{ fullPaths: boolean; abbreviate: boolean }} FileNameOptions */
/** @typedef {keyof FileNameOptions | 'originalNames'} FileNameOptionKey */

/** @returns {FileNameOptions} */
function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { fullPaths: parsed.fullPaths === true, abbreviate: parsed.abbreviate === true };
  } catch {
    return { fullPaths: false, abbreviate: false };
  }
}

export const fileNameOptions = $state(load());

/**
 * The options as every control shows them: the file list's buttons (`chip`),
 * the card menu (`label`), and their tooltips. The desktop View menu has the
 * same labels in apps/electron/src/main.js. `originalNames` is not stored: it
 * is the state of the files' own ⇄ buttons (state/fileAliases).
 * @type {ReadonlyArray<{ key: FileNameOptionKey; label: string; chip: string; title: string }>}
 */
export const FILE_NAME_OPTIONS = [
  {
    key: 'fullPaths',
    label: 'Show full paths',
    chip: '/x/y/…',
    title: 'Show where each file is on disk instead of its name; grouping matches the paths too',
  },
  {
    key: 'abbreviate',
    label: 'Abbreviate identical parts',
    chip: 'a…z',
    title: 'Shorten names that do not fit by collapsing the parts all names share',
  },
  {
    key: 'originalNames',
    label: 'Show original names',
    chip: '⇄',
    title:
      'Show every file that has an alias under its real name (or all back under their aliases)',
  },
];

/**
 * Whether an option is on; for `originalNames`, whether every aliased file
 * shows its original name.
 * @param {FileNameOptionKey} key
 */
export function fileNameOptionOn(key) {
  if (key === 'originalNames') {
    const { aliased, original } = originalNamesState();
    return aliased > 0 && original === aliased;
  }
  return fileNameOptions[key];
}

/** Tells the host (desktop View menu) the options' state. */
export function announceFileNameOptions() {
  window.dispatchEvent(
    new CustomEvent('file-name-options', {
      detail: { ...fileNameOptions, originalNames: fileNameOptionOn('originalNames') },
    })
  );
}
const announce = announceFileNameOptions;

/** @param {FileNameOptionKey} key */
export function toggleFileNameOption(key) {
  if (key === 'originalNames') {
    toggleAllOriginalNames();
    announce();
    return;
  }
  if (!(key in fileNameOptions)) return;
  fileNameOptions[key] = !fileNameOptions[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(fileNameOptions));
  } catch {
    // Storage may be unavailable; the options then reset next time.
  }
  announce();
}

if (typeof window !== 'undefined') {
  // Another window changed them.
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    Object.assign(fileNameOptions, load());
    announce();
  });
  /** @type {any} */ (window).plyFileNames = {
    get: () => ({ ...fileNameOptions, originalNames: fileNameOptionOn('originalNames') }),
    toggle: toggleFileNameOption,
  };
}
