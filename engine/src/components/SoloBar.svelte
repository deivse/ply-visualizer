<script lang="ts">
  import { onMount } from 'svelte';
  import { filesState } from '../state/files.svelte';
  import { soloState, soloLayout, saveSoloLayout, seedSoloAbbreviate } from '../state/solo.svelte';
  import { fileGroupsState } from '../state/fileGroups.svelte';
  import type { FileEntry } from '../state/fileEntries';
  import type { SoloController } from '../soloMode';
  import { smartAbbreviate } from '../utils/smartAbbreviate';
  import { fitName } from '../utils/fitName';
  import { soloReorder } from './soloReorder';
  import { fileNameOptions, FILE_NAME_OPTIONS } from '../state/fileNames.svelte';
  import ChipButton from './ChipButton.svelte';
  import { startPointerDrag } from '../utils/pointerDrag';

  let { solo, sequenceMode }: { solo: SoloController; sequenceMode: () => boolean } = $props();

  const items = $derived.by(() => {
    filesState.entries;
    soloState.scopeIds;
    return solo.soloable();
  });
  const groupName = $derived.by(() => {
    filesState.entries;
    soloState.scopeIds;
    fileGroupsState.enabled;
    fileGroupsState.active;
    return fileGroupsState.enabled ? (solo.activeGroup()?.key ?? '') : '';
  });
  const active = $derived(soloState.ids.length > 0);
  const show = $derived(
    (filesState.entries,
    (items.length >= 2 || (!!groupName && solo.groups().length > 1)) && !sequenceMode()),
  );
  // Full paths follow the file list's option; abbreviation is this panel's
  // own (soloLayout.abbreviate), seeded from the file list's (see below).
  // As in the file list: aliases instead of names (state/fileAliases).
  const entryNames = $derived(items.map((entry) => solo.labelOf(entry)));
  const names = $derived(entryNames.map((name) => name.text));
  $effect(() => {
    if (show) seedSoloAbbreviate(fileNameOptions.abbreviate);
  });
  const shortNames = $derived(smartAbbreviate(names));
  const primaryIndex = $derived(items.findIndex((item) => item.id === soloState.primaryId));

  // ---- floating, draggable, resizable panel --------------------------------
  let panel = $state<HTMLDivElement | null>(null);
  const MIN_W = 220;
  const MIN_H = 90;

  function defaultRect() {
    const w = Math.min(640, window.innerWidth - 32);
    const h = 150;
    return { x: Math.round((window.innerWidth - w) / 2), y: window.innerHeight - h - 16, w, h };
  }

  function clampRect(rect: { x: number; y: number; w: number; h: number }) {
    const w = Math.max(MIN_W, Math.min(rect.w, window.innerWidth - 8));
    const h = Math.max(MIN_H, Math.min(rect.h, window.innerHeight - 8));
    return {
      w,
      h,
      x: Math.max(4, Math.min(rect.x, window.innerWidth - w - 4)),
      y: Math.max(4, Math.min(rect.y, window.innerHeight - h - 4)),
    };
  }

  let rect = $state(clampRect(soloLayout.rect ?? defaultRect()));

  function persistRect() {
    soloLayout.rect = { ...rect };
    saveSoloLayout();
  }

  function onHeaderPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button')) return;
    const origin = { ...rect };
    startPointerDrag(event, {
      cursor: 'move',
      onMove: (dx, dy) => (rect = clampRect({ ...origin, x: origin.x + dx, y: origin.y + dy })),
      onEnd: persistRect,
    });
  }

  function onResizePointerDown(event: PointerEvent) {
    const origin = { ...rect };
    startPointerDrag(event, {
      cursor: 'nwse-resize',
      onMove: (dx, dy) => (rect = clampRect({ ...origin, w: origin.w + dx, h: origin.h + dy })),
      onEnd: persistRect,
    });
  }

  onMount(() => {
    const onWindowResize = () => (rect = clampRect(rect));
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  });

  function setMode(mode: 'list' | 'tiles') {
    soloLayout.mode = mode;
    saveSoloLayout();
  }
  function setColumns(delta: number) {
    soloLayout.columns = Math.min(12, Math.max(1, soloLayout.columns + delta));
    saveSoloLayout();
  }
  // This panel's own a…z, presented like the file list's.
  const abbreviateOption = FILE_NAME_OPTIONS.find((option) => option.key === 'abbreviate')!;

  function toggleAbbreviate() {
    soloLayout.abbreviate = !soloLayout.abbreviate;
    saveSoloLayout();
  }

  // Keep the soloed item in view when stepping with the keyboard.
  $effect(() => {
    soloState.primaryId;
    const el = panel?.querySelector('.solo-item.primary');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
</script>

{#if show}
  {#if !soloLayout.hidden}
    <div
      bind:this={panel}
      class="solo-panel"
      role="toolbar"
      aria-label="Solo"
      style:left="{rect.x}px"
      style:top="{rect.y}px"
      style:width="{rect.w}px"
      style:height="{rect.h}px"
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="solo-header" onpointerdown={onHeaderPointerDown} title="Drag to move">
        <span class="solo-label" class:lit={active}>SOLO</span>
        <span class="solo-count">{active ? `${soloState.ids.length}/${items.length}` : items.length}</span>
        {#if groupName}
          <button class="hb" title="Previous group (←)" onclick={() => solo.stepGroup(-1)}>«</button>
          <span class="solo-group" title={`Group: ${groupName}`}>{groupName}</span>
          <button class="hb" title="Next group (→)" onclick={() => solo.stepGroup(1)}>»</button>
        {/if}
        <button class="hb" title="Previous ([ or ↑)" onclick={() => solo.step(-1)}>‹</button>
        <button class="hb" title="Next (] or ↓)" onclick={() => solo.step(1)}>›</button>
        <span class="spacer"></span>
        <div class="seg" role="group" aria-label="Layout">
          <button class:on={soloLayout.mode === 'list'} title="List" onclick={() => setMode('list')}>☰</button>
          <button class:on={soloLayout.mode === 'tiles'} title="Tiles" onclick={() => setMode('tiles')}>▦</button>
        </div>
        {#if soloLayout.mode === 'tiles'}
          <button class="hb" title="Fewer columns" onclick={() => setColumns(-1)}>−</button>
          <span class="solo-cols" title="Columns">{soloLayout.columns}</span>
          <button class="hb" title="More columns" onclick={() => setColumns(1)}>+</button>
        {/if}
        <ChipButton on={soloLayout.abbreviate} title={abbreviateOption.title} onclick={toggleAbbreviate}
          >{abbreviateOption.chip}</ChipButton
        >
        {#if active}
          <button class="hb end-solo" title="End solo (0 or Esc)" onclick={() => solo.exit()}
            >End solo</button
          >
        {/if}
        <button
          class="hb"
          title="Hide solo panel (show it again from View → Solo Panel or the file list)"
          onclick={() => solo.setPanelHidden(true)}>✕</button
        >
      </div>
      <div
        class="solo-body"
        class:list={soloLayout.mode === 'list'}
        style:grid-template-columns={soloLayout.mode === 'tiles'
          ? `repeat(${soloLayout.columns}, minmax(0, 1fr))`
          : '1fr'}
      >
        {#each items as entry, i (entry.id)}
          {@const lit = soloState.ids.includes(entry.id)}
          {@const locked = soloState.locked.includes(entry.id)}
          <button
            class="solo-item"
            class:lit
            class:primary={entry.id === soloState.primaryId}
            class:dim={active && !lit}
            class:locked
            class:muted={!solo.baseVisible(entry)}
            title={`${names[i]}${entryNames[i].aliased ? `\nAlias of ${entryNames[i].original}` : ''}\nClick: solo · Ctrl/Shift-click: add to solo · Drag: reorder${i < 9 ? ` · key ${i + 1}` : ''}`}
            data-entry-id={entry.id}
            use:soloReorder={{ entryId: entry.id, move: (id, target) => solo.move(id, target) }}
            onclick={(e) => solo.click(entry.id, e)}
          >
            <span class="solo-key">{i + 1}</span>
            <span
              class="solo-name"
              class:aliased={entryNames[i].aliased}
              use:fitName={{
                full: names[i],
                short: shortNames[i],
                enabled: soloLayout.abbreviate,
                path: entryNames[i].path,
              }}
            ></span>
            {#if locked}<span class="solo-locked" title="Locked: unlock it in the file list to solo it">🔒</span>{/if}
          </button>
        {/each}
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="solo-grip" title="Resize" onpointerdown={onResizePointerDown}></div>
    </div>
  {/if}
{/if}

<style>
  .solo-panel {
    position: fixed;
    z-index: 900;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 90%, transparent);
    border: 1px solid var(--vscode-panel-border, #444);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: 12px;
    color: var(--vscode-foreground, #ccc);
    backdrop-filter: blur(6px);
    user-select: none;
    overflow: hidden;
  }
  .solo-header {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 6px;
    cursor: move;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    flex-shrink: 0;
  }
  .spacer {
    flex: 1;
  }
  .solo-label {
    font-weight: 700;
    letter-spacing: 0.08em;
    font-size: 10px;
    padding: 0 4px;
    opacity: 0.6;
  }
  .solo-label.lit {
    color: #f5c518;
    opacity: 1;
  }
  .solo-group {
    font-weight: 600;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .solo-count,
  .solo-cols {
    font-size: 10px;
    opacity: 0.6;
    padding: 0 3px;
    font-variant-numeric: tabular-nums;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    padding: 2px 6px;
    white-space: nowrap;
  }
  button:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.08));
  }
  .hb {
    opacity: 0.8;
  }
  .seg button.on {
    background: rgba(127, 127, 127, 0.28);
    opacity: 1;
  }
  .seg {
    display: flex;
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 5px;
    overflow: hidden;
    margin: 0 4px;
  }
  .seg button {
    border-radius: 0;
    padding: 1px 6px;
  }
  .solo-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: 4px;
    padding: 6px;
    align-content: start;
    scrollbar-width: thin;
  }
  .solo-body.list {
    gap: 2px;
  }
  .solo-item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    text-align: left;
    border-color: var(--vscode-panel-border, #444);
  }
  .solo-body.list .solo-item {
    border-color: transparent;
  }
  .solo-item.lit {
    background: #f5c518;
    border-color: #f5c518;
    color: #1a1a1a;
    font-weight: 600;
  }
  .solo-item.primary {
    outline: 1px solid #f5c518;
    outline-offset: 1px;
  }
  .solo-item.dim {
    opacity: 0.55;
  }
  /* Locked: its solo state is fixed, so the row does not respond. */
  .solo-item.locked {
    opacity: 0.4;
    cursor: default;
  }
  .solo-locked {
    flex: none;
    font-size: 9px;
    opacity: 0.8;
  }
  .solo-item.muted .solo-name {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .solo-key {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    min-width: 16px;
    height: 15px;
    line-height: 15px;
    text-align: center;
    border-radius: 3px;
    background: rgba(127, 127, 127, 0.25);
    font-variant-numeric: tabular-nums;
  }
  .solo-item.lit .solo-key {
    background: rgba(0, 0, 0, 0.18);
  }
  .solo-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A path loses its start, not the file name, when it does not fit. */
  .solo-name.aliased {
    color: var(--ply-alias-color, #8cc8ff);
  }
  /* On the yellow of a soloed item. */
  .solo-item.lit .solo-name.aliased {
    color: #0a3f7a;
  }
  .solo-name:global(.fit-path) {
    direction: rtl;
    text-align: left;
  }
  .solo-grip {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    background: linear-gradient(
      135deg,
      transparent 50%,
      rgba(127, 127, 127, 0.6) 50%,
      rgba(127, 127, 127, 0.6) 60%,
      transparent 60%,
      transparent 70%,
      rgba(127, 127, 127, 0.6) 70%,
      rgba(127, 127, 127, 0.6) 80%,
      transparent 80%
    );
  }
  .end-solo {
    font-size: 11px;
    color: #f5c518;
  }
</style>
