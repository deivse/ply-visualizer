import type { FileEntry } from '../state/fileEntries';

/**
 * List order: manual order (`listOrder`) first, then load order (registry
 * index). The file list, the solo panel and `moveEntry` all sort with this.
 */
export function compareListOrder(
  a: { entry: FileEntry; index: number },
  b: { entry: FileEntry; index: number }
): number {
  return (
    (a.entry.state.listOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.entry.state.listOrder ?? Number.MAX_SAFE_INTEGER) || a.index - b.index
  );
}

/** Entries in list order. */
export function entriesInListOrder(all: readonly FileEntry[]): FileEntry[] {
  return all
    .map((entry, index) => ({ entry, index }))
    .sort(compareListOrder)
    .map(({ entry }) => entry);
}

/**
 * Moves an entry before `beforeId`, or after `afterId`, or to the end, by
 * rewriting every entry's `listOrder`. The file list and the solo panel both
 * sort by it, so they always agree.
 */
export function moveEntry(
  all: readonly FileEntry[],
  id: number,
  target: { beforeId?: number | null; afterId?: number | null }
): void {
  const entries = entriesInListOrder(all);
  const moving = entries.find(entry => entry.id === id);
  if (!moving) {
    return;
  }
  const remaining = entries.filter(entry => entry.id !== id);
  let index = remaining.length;
  if (target.beforeId != null) {
    const at = remaining.findIndex(entry => entry.id === target.beforeId);
    if (at >= 0) {
      index = at;
    }
  } else if (target.afterId != null) {
    const at = remaining.findIndex(entry => entry.id === target.afterId);
    if (at >= 0) {
      index = at + 1;
    }
  }
  remaining.splice(index, 0, moving);
  remaining.forEach((entry, order) => {
    if (entry.state.listOrder !== order) {
      entry.state.listOrder = order;
    }
  });
}
