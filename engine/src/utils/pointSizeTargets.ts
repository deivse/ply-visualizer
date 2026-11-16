import type { FileEntryRegistry } from '../state/fileEntries';

interface PointSizeHost {
  fileEntries: FileEntryRegistry;
}

/**
 * The clouds a shared point size applies to, by file (registry) index: every
 * cloud, or those among `ids` (a selection). Voxel volumes and clouds drawn as
 * splats are left out: their size control is a different one. Used by the
 * All Sizes / Selection size slider and by Shift on a row's size slider.
 */
export function pointSizeTargets(host: PointSizeHost, ids?: readonly number[]): number[] {
  const wanted = ids ? new Set(ids) : null;
  return host.fileEntries.all.flatMap((entry, index) => {
    const data = entry.kind === 'spatial' ? entry.spatial?.data : undefined;
    return data &&
      (!wanted || wanted.has(entry.id)) &&
      data.metadata?.volumeRenderMode !== 'voxels' &&
      !entry.state.splatModeActive
      ? [index]
      : [];
  });
}
