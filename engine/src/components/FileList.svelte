<script lang="ts">
  import { fileRows, type FileListHost } from './fileListTypes';
  import { filesState } from '../state/files.svelte';
  import { addTooltipsToTruncatedFilenames } from '../ui/dialogs';
  import FileItem from './FileItem.svelte';
  import FileGroups from './FileGroups.svelte';
  import FileActions from './FileActions.svelte';
  import { setSelectionOrder } from '../state/fileSelection.svelte';
  import { fileNameOptions } from '../state/fileNames.svelte';
  import { smartAbbreviate } from '../utils/smartAbbreviate';
  import type { EntryLabel } from '../utils/entryNames';
  import type { FileLabel, FileRow } from './fileListTypes';

  let { host }: { host: FileListHost } = $props();

  // Only the active scene's files are listed when grouping by prefix.
  const entryRows = $derived(
    fileRows(host, filesState.entries).filter((row) => host.solo.inScope(row.entry)),
  );
  const totalEntries = $derived(entryRows.length);

  /** What a row shows (alias or name); cameras keep their own label (FileItem). */
  function baseName(row: FileRow): EntryLabel | null {
    return row.kind === 'camera' ? null : host.solo.labelOf(row.entry);
  }

  // Abbreviation runs over every listed name, so the parts all of them share
  // collapse (a common folder, prefix or suffix).
  const labels = $derived.by(() => {
    const named = entryRows
      .map((row) => ({ id: row.entry.id, base: baseName(row) }))
      .filter((item): item is { id: number; base: EntryLabel } => !!item.base);
    const short = fileNameOptions.abbreviate
      ? smartAbbreviate(named.map((item) => item.base.text))
      : named.map((item) => item.base.text);
    return new Map<number, FileLabel>(
      named.map((item, i) => [
        item.id,
        {
          full: item.base.text,
          short: short[i],
          enabled: fileNameOptions.abbreviate,
          path: item.base.path,
          aliased: item.base.aliased,
          hasAlias: item.base.hasAlias,
        },
      ]),
    );
  });

  const isSequenceFrame = $derived(
    (filesState.entries, host.sequenceMode && host.sequenceFiles.length > 0),
  );
  const sequenceFrameInfo = $derived(
    (() => {
      filesState.entries;
      if (!isSequenceFrame) {
        return null;
      }
      const fullPath = host.sequenceFiles[host.sequenceIndex] || '';
      const pathParts = fullPath.split(/[\\/]/);
      const name = pathParts.pop() || `Frame ${host.sequenceIndex + 1}`;
      const shortPath = pathParts.slice(-2).concat(name).join('/');
      return { name, shortPath, index: host.sequenceIndex, total: host.sequenceFiles.length };
    })(),
  );

  const pendingLoadLabel = $derived((filesState.entries, host.pendingLoadLabel));
  const pendingLoadDetail = $derived((filesState.entries, host.pendingLoadDetail));

  $effect(() => {
    setSelectionOrder(entryRows.map((row) => row.entry.id));
  });

  $effect(() => {
    filesState.entries;
    totalEntries;
    labels;
    addTooltipsToTruncatedFilenames();
  });
</script>

{#if isSequenceFrame && sequenceFrameInfo}
  <div class="file-item">
    <div class="file-item-main">
      <input type="checkbox" id="file-0" checked disabled />
      <span class="color-indicator" style="background-color: #888"></span>
      <label for="file-0" class="file-name" data-short-path={sequenceFrameInfo.shortPath}
        >{sequenceFrameInfo.name}</label
      >
    </div>
    <div class="file-info">Frame {sequenceFrameInfo.index + 1} of {sequenceFrameInfo.total}</div>
  </div>
{:else if totalEntries === 0 && !pendingLoadLabel}
  <div class="no-files">No objects loaded</div>
{:else}
  <FileGroups {host} />
  <FileActions {host} />
  {#each entryRows as row (row.entry.id)}
    <FileItem {host} {row} label={labels.get(row.entry.id) ?? null} />
  {/each}
  {#if pendingLoadLabel !== null}
    <div class="file-item file-item-loading">
      <div class="file-item-main">
        <span class="spinner spinner-inline"></span>
        <span class="file-name">Loading {pendingLoadLabel}…</span>
      </div>
      <div class="file-info" id="pending-load-detail">{pendingLoadDetail}</div>
    </div>
  {/if}
{/if}
