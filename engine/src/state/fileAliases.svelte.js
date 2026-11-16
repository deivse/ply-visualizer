// Aliases: a nicer label for a file, shown instead of its name. Display only:
// grouping, matching and full paths keep using the real name.
//
// Remembered by the file's path on this computer, so reopening a file brings
// its alias back; at most MAX_ALIASES, the oldest dropped first. Files with
// no known path (browser, poses) keep theirs for the session, by entry id.
import { filesState } from './files.svelte';

const KEY = 'ply-visualizer.fileAliases.v1';
export const MAX_ALIASES = 5000;

/** @returns {Record<string, string>} path -> alias, oldest first */
function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Object.fromEntries(
      (Array.isArray(parsed) ? parsed : []).filter(
        pair => Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

export const fileAliases = $state(
  /** @type {{ byPath: Record<string, string>; byId: Record<number, string> }} */ ({
    byPath: load(),
    byId: {},
  })
);

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.entries(fileAliases.byPath)));
  } catch {
    // Storage may be unavailable; aliases then last for the session.
  }
}

/** @param {import('./fileEntries').FileEntry} entry */
const pathOf = entry => entry.spatial?.data.filePath || null;

/**
 * @param {import('./fileEntries').FileEntry} entry
 * @returns {string | null}
 */
export function aliasOf(entry) {
  const path = pathOf(entry);
  return (path ? fileAliases.byPath[path] : fileAliases.byId[entry.id]) ?? null;
}

/**
 * Sets an entry's alias, or removes it (null or blank).
 * @param {import('./fileEntries').FileEntry} entry
 * @param {string | null} alias
 */
export function setAlias(entry, alias) {
  const text = alias?.trim() || null;
  const path = pathOf(entry);
  // Back on the alias after editing it.
  entry.state.showOriginalName = false;
  if (!path) {
    if (text) fileAliases.byId[entry.id] = text;
    else delete fileAliases.byId[entry.id];
    return;
  }
  // Re-inserted, so the most recently set alias is the newest.
  delete fileAliases.byPath[path];
  if (text) {
    fileAliases.byPath[path] = text;
    const paths = Object.keys(fileAliases.byPath);
    for (const old of paths.slice(0, Math.max(0, paths.length - MAX_ALIASES))) {
      delete fileAliases.byPath[old];
    }
  }
  save();
}

/**
 * The ⇄ for all files: its state is the per-file ⇄ buttons' - on when every
 * file that has an alias shows its original name. Reads the loaded entries.
 * @returns {{ aliased: number; original: number }}
 */
export function originalNamesState() {
  const aliased = filesState.entries.filter(entry => entry.kind !== 'camera' && aliasOf(entry));
  return {
    aliased: aliased.length,
    original: aliased.filter(entry => entry.state.showOriginalName).length,
  };
}

/** Flips every aliased file to its original name, or (all already are) back to its alias. */
export function toggleAllOriginalNames() {
  const { aliased, original } = originalNamesState();
  const show = original < aliased;
  for (const entry of filesState.entries) {
    if (entry.kind !== 'camera' && aliasOf(entry)) entry.state.showOriginalName = show;
  }
}

/**
 * The name being edited in the file list, if any: the alias, or the name
 * itself ("Rename in viewer"). Set from a card (double-click, F2) or its menu.
 */
export const nameEdit = $state(
  /** @type {{ id: number | null; mode: 'alias' | 'rename' }} */ ({ id: null, mode: 'alias' })
);

/**
 * @param {number} id
 * @param {'alias' | 'rename'} mode
 */
export function startNameEdit(id, mode) {
  nameEdit.id = id;
  nameEdit.mode = mode;
}

if (typeof window !== 'undefined') {
  // Another window changed them.
  window.addEventListener('storage', event => {
    if (event.key === KEY) fileAliases.byPath = load();
  });
}
