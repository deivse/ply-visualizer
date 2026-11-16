import type { FileEntry, FileEntryRegistry } from '../state/fileEntries';
import { aliasOf } from '../state/fileAliases.svelte';

/** How an entry is named everywhere: file list, solo panel, group matching. */
export interface EntryName {
  text: string;
  /** `text` is a path on disk (cut at its start when it does not fit). */
  path: boolean;
}

/**
 * The one naming rule. Clouds: their full path when `fullPaths` is on and the
 * path is known, else their name, else "File N". Poses: name or "Pose N".
 * Cameras: their profile name.
 */
export function entryName(
  entry: FileEntry,
  registry: FileEntryRegistry,
  fullPaths: boolean
): EntryName {
  const index = registry.indexOf(entry.id);
  if (entry.kind === 'spatial') {
    const data = entry.spatial?.data;
    if (fullPaths && data?.filePath && !data.nameOverridden) {
      return { text: data.filePath, path: true };
    }
    return { text: data?.fileName || `File ${index + 1}`, path: false };
  }
  if (entry.kind === 'pose') {
    return {
      text: entry.pose?.meta.fileName || `Pose ${registry.kindIndexAt(index) + 1}`,
      path: false,
    };
  }
  return { text: entry.camera?.name || `Camera ${index + 1}`, path: false };
}

/** What a list shows for an entry: its alias, unless the real name is asked for. */
export interface EntryLabel extends EntryName {
  /** `text` is the alias. */
  aliased: boolean;
  /** The entry has an alias (shown or not). */
  hasAlias: boolean;
  /** The real name (what grouping uses), for tooltips. */
  original: string;
}

/**
 * The display rule on top of `entryName`: an alias replaces the name in the
 * lists, unless this entry's ⇄ asks for the original (the ⇄ for all files
 * sets every entry's). Grouping and matching never use this.
 */
export function entryLabel(
  entry: FileEntry,
  registry: FileEntryRegistry,
  options: { fullPaths: boolean }
): EntryLabel {
  const name = entryName(entry, registry, options.fullPaths);
  const alias = entry.kind === 'camera' ? null : aliasOf(entry);
  return alias && !entry.state.showOriginalName
    ? { text: alias, path: false, aliased: true, hasAlias: true, original: name.text }
    : { ...name, aliased: false, hasAlias: !!alias, original: name.text };
}

/**
 * "Rename in viewer": changes the name the viewer uses for this entry, for
 * display and grouping, in this window. The file on disk is not touched.
 * Returns false when there is nothing to rename to.
 */
export function renameEntryInViewer(entry: FileEntry, name: string): boolean {
  const text = name.trim();
  if (!text) {
    return false;
  }
  if (entry.kind === 'spatial' && entry.spatial) {
    entry.spatial.data.fileName = text;
    entry.spatial.data.nameOverridden = true;
    return true;
  }
  if (entry.kind === 'pose' && entry.pose) {
    entry.pose.meta.fileName = text;
    return true;
  }
  return false;
}
