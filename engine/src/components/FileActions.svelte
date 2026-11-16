<script lang="ts">
  import { fileActions, type FileAction } from '../fileActions';
  import type { FileListHost } from './fileListTypes';
  import type { FileEntry } from '../state/fileEntries';
  import { filesState } from '../state/files.svelte';
  import Modal from './Modal.svelte';
  import DialogButton from './DialogButton.svelte';
  import ChipButton from './ChipButton.svelte';
  import { popover } from '../utils/popover';
  import {
    aliasOf,
    setAlias,
    startNameEdit,
    originalNamesState,
  } from '../state/fileAliases.svelte';
  import { getRenderModeOptions, isRenderModeActive } from '../renderModeOptions';
  import {
    toggleFileNameOption,
    fileNameOptionOn,
    FILE_NAME_OPTIONS,
  } from '../state/fileNames.svelte';
  import {
    fileSelection,
    fileActionUi,
    fileBusy,
    clearSelection,
    selectAllListed,
  } from '../state/fileSelection.svelte';

  let { host }: { host: FileListHost } = $props();

  const entriesOf = (ids: readonly number[]) =>
    ids.map((id) => host.fileEntries.get(id)).filter((entry): entry is FileEntry => !!entry);
  const selected = $derived((filesState.entries, entriesOf(fileSelection.ids)));
  // The right-click menu acts on its own entries (that row, or the selection
  // when the row is part of it).
  const menuEntries = $derived(
    (filesState.entries, fileActionUi.menu ? entriesOf(fileActionUi.menu.ids) : []),
  );
  // Entries a running action is working on are left out of every action.
  const applicable = (action: FileAction, entries: FileEntry[]) =>
    entries.filter((e) => !(e.id in fileBusy.byId) && action.appliesTo(e, host));
  const targets = (action: FileAction) => applicable(action, selected);

  // Alias / rename in viewer: clouds and poses that no action is working on.
  const nameable = $derived(
    menuEntries.filter((e) => e.kind !== 'camera' && !(e.id in fileBusy.byId)),
  );
  const aliased = $derived(nameable.filter((e) => aliasOf(e)));
  const originalNames = $derived((filesState.entries, originalNamesState()));

  // Closing the menu empties its entries: take what is needed first.
  function editName(mode: 'alias' | 'rename') {
    const id = nameable[0]?.id;
    fileActionUi.menu = null;
    if (id !== undefined) startNameEdit(id, mode);
  }
  function removeAliases() {
    const entries = [...aliased];
    fileActionUi.menu = null;
    entries.forEach((entry) => setAlias(entry, null));
  }

  function trigger(action: FileAction, entries: FileEntry[]) {
    fileActionUi.menu = null;
    const usable = applicable(action, entries);
    if (!usable.length) return;
    if (action.form) {
      fileActionUi.form = { action: action.id, ids: usable.map((e) => e.id) };
      return;
    }
    action.run(host, usable);
  }

  function menuSelect(select: () => void) {
    fileActionUi.menu = null;
    select();
  }

  // ---- subsample form ----
  const PREFS_KEY = 'ply-visualizer.subsampleLoaded.v1';
  function loadPrefs() {
    try {
      return { mode: 'percent', percent: 10, max: 1000000, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return { mode: 'percent', percent: 10, max: 1000000 };
    }
  }
  const prefs = loadPrefs();
  let mode = $state<'percent' | 'max'>(prefs.mode === 'max' ? 'max' : 'percent');
  let percent = $state<number>(prefs.percent);
  let maxPoints = $state<number>(prefs.max);

  const subsampleAction = fileActions.find((a) => a.id === 'subsample')!;
  const formTargets = $derived(
    (filesState.entries,
    fileActionUi.form?.action === 'subsample'
      ? applicable(subsampleAction, entriesOf(fileActionUi.form.ids))
      : []),
  );
  const formOptions = $derived(
    mode === 'percent'
      ? percent > 0 && percent < 100
        ? { fraction: percent / 100 }
        : null
      : maxPoints >= 1
        ? { maxPoints: Math.floor(maxPoints) }
        : null,
  );
  const formBefore = $derived(formTargets.reduce((sum, e) => sum + (e.spatial?.data.vertexCount ?? 0), 0));
  const formAfter = $derived(
    formOptions
      ? formTargets.reduce((sum, e) => {
          const n = e.spatial?.data.vertexCount ?? 0;
          return (
            sum +
            (formOptions.fraction !== undefined
              ? Math.max(1, Math.round(n * formOptions.fraction))
              : Math.min(n, formOptions.maxPoints ?? n))
          );
        }, 0)
      : formBefore,
  );

  function applySubsample() {
    if (!formOptions || !formTargets.length) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ mode, percent, max: maxPoints }));
    } catch {
      // per-viewer convenience only
    }
    subsampleAction.run(host, formTargets, formOptions);
    fileActionUi.form = null;
  }

  function formKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySubsample();
    }
  }

  // A form whose files are all gone (removed, or in another group) closes.
  $effect(() => {
    if (fileActionUi.form && !formTargets.length) {
      fileActionUi.form = null;
    }
  });

  // ---- render mode submenu ----
  // The modes of the menu's files, each doing what that mode's button on a
  // card does, for every file that has it: like Shift-clicking the button,
  // it turns the mode on for all of them unless all already have it on.
  const MODE_ORDER = ['points', 'splat', 'mesh', 'wireframe', 'normals'];
  type ModeItem = { mode: string; label: string; files: number[]; on: number };
  const renderModes = $derived.by((): ModeItem[] => {
    filesState.entries;
    const modes = new Map<string, ModeItem>();
    for (const entry of menuEntries) {
      const data = entry.spatial?.data;
      const index = host.fileEntries.indexOf(entry.id);
      if (!data || index < 0 || entry.id in fileBusy.byId) continue;
      for (const option of getRenderModeOptions(host, data)) {
        let item = modes.get(option.mode);
        if (!item) {
          // The card labels without their icon.
          item = { mode: option.mode, label: option.label.replace(/^\S+\s+/, ''), files: [], on: 0 };
          modes.set(option.mode, item);
        }
        item.files.push(index);
        if (isRenderModeActive(host, index, option.mode)) item.on++;
      }
    }
    const rank = (mode: string) => (MODE_ORDER.indexOf(mode) + 1 || 99);
    return [...modes.values()].sort((a, b) => rank(a.mode) - rank(b.mode));
  });
  let renderMenuOpen = $state(false);
  $effect(() => {
    if (!fileActionUi.menu) renderMenuOpen = false;
  });

  function applyRenderMode(item: ModeItem) {
    fileActionUi.menu = null;
    const target = item.on < item.files.length;
    for (const index of item.files) {
      if (isRenderModeActive(host, index, item.mode) !== target) {
        host.toggleUniversalRenderMode(index, item.mode);
      }
    }
    host.requestRender();
  }

  /** Opens the submenu to the left when there is no room on the right. */
  function flyout(node: HTMLElement) {
    const rect = node.getBoundingClientRect();
    if (rect.right > window.innerWidth - 4) node.classList.add('left');
    if (rect.bottom > window.innerHeight - 4) {
      node.style.top = `${Math.round(window.innerHeight - 4 - rect.bottom) - 5}px`;
    }
  }

  const fmt = (n: number) => n.toLocaleString();
</script>

{#if selected.length}
  <div class="file-actions-bar" role="toolbar" aria-label="Actions for selected files" data-no-scene-render>
    <span class="fa-count">{selected.length} selected</span>
    {#each fileActions as action (action.id)}
      {@const n = targets(action).length}
      <ChipButton
        danger={action.danger}
        expanded={action.form ? fileActionUi.form?.action === action.id : undefined}
        disabled={!n}
        title={n < selected.length && n ? `${action.title} (${n} of ${selected.length} apply)` : action.title}
        onclick={() => trigger(action, selected)}>{action.label}</ChipButton
      >
    {/each}
  </div>
{/if}
{#if fileActionUi.form?.action === 'subsample' && formTargets.length}
  <Modal
    title={`Subsample ${
      formTargets.length === 1
        ? (formTargets[0].spatial?.data.fileName ?? '1 cloud')
        : `${formTargets.length} clouds`
    }`}
    onclose={() => (fileActionUi.form = null)}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ss-form" onkeydown={formKey}>
      <label><input type="radio" bind:group={mode} value="percent" /> Keep
        <input type="number" min="0.01" max="99.99" step="any" bind:value={percent} disabled={mode !== 'percent'} /> % of points</label>
      <label><input type="radio" bind:group={mode} value="max" /> Keep at most
        <input type="number" min="1" step="100000" bind:value={maxPoints} disabled={mode !== 'max'} /> points per file</label>
      <p class="ss-result">{fmt(formBefore)} → {fmt(formAfter)} points</p>
      <p class="ss-hint">
        Each cloud keeps a random subset of its points, and the rest are freed. Reopen the file to
        get them back.
      </p>
    </div>
    {#snippet footer()}
      <DialogButton onclick={() => (fileActionUi.form = null)}>Cancel</DialogButton>
      <DialogButton primary disabled={!formOptions || formAfter >= formBefore} onclick={applySubsample}
        >Subsample</DialogButton
      >
    {/snippet}
  </Modal>
{/if}

{#if fileActionUi.menu && menuEntries.length}
  <div
    class="file-context-menu popover-menu"
    role="menu"
    aria-label="File actions"
    data-no-scene-render
    use:popover={{ at: fileActionUi.menu, onclose: () => (fileActionUi.menu = null) }}
  >
    <div class="fcm-head">
      {menuEntries.length === 1
        ? host.solo.labelOf(menuEntries[0]).text
        : `${menuEntries.length} selected`}
    </div>
    {#each fileActions as action (action.id)}
      {@const n = applicable(action, menuEntries).length}
      <button
        role="menuitem"
        class:danger={action.danger}
        disabled={!n}
        title={action.title}
        onclick={() => trigger(action, menuEntries)}
        >{action.label}{#if n && n < menuEntries.length}<span class="fcm-n">{n}</span>{/if}</button
      >
    {/each}
    {#if renderModes.length}
      <div class="popover-menu-sep" role="separator"></div>
      <div
        class="fcm-sub"
        role="none"
        onpointerenter={() => (renderMenuOpen = true)}
        onpointerleave={() => (renderMenuOpen = false)}
      >
        <button
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={renderMenuOpen}
          class:open={renderMenuOpen}
          onclick={() => (renderMenuOpen = !renderMenuOpen)}
          >Render mode<span class="fcm-arrow">▸</span></button
        >
        {#if renderMenuOpen}
          <div class="fcm-flyout popover-menu" role="menu" use:flyout>
            {#each renderModes as item (item.mode)}
              <button
                role="menuitemcheckbox"
                aria-checked={item.on === item.files.length
                  ? 'true'
                  : item.on
                    ? 'mixed'
                    : 'false'}
                title={item.on && item.on < item.files.length
                  ? `On for ${item.on} of ${item.files.length}`
                  : ''}
                onclick={() => applyRenderMode(item)}
              >
                <span class="fcm-label">{item.label}</span>
                {#if item.files.length < menuEntries.length}<span class="fcm-n"
                    >{item.files.length}</span
                  >{/if}
                <span
                  class="fcm-box"
                  class:on={item.on === item.files.length}
                  class:mixed={item.on > 0 && item.on < item.files.length}
                  aria-hidden="true"
                ></span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if nameable.length}
      <div class="popover-menu-sep" role="separator"></div>
      {#if nameable.length === 1 && menuEntries.length === 1}
        <button
          role="menuitem"
          title="A label shown instead of the name (double-click the name, or F2). Grouping keeps using the name."
          onclick={() => editName('alias')}
          >{aliased.length ? 'Edit alias…' : 'Set alias…'}</button
        >
      {/if}
      {#if aliased.length}
        <button role="menuitem" onclick={removeAliases}
          >{aliased.length === 1 ? 'Remove alias' : 'Remove aliases'}{#if aliased.length < menuEntries.length}<span
              class="fcm-n">{aliased.length}</span
            >{/if}</button
        >
      {/if}
      {#if nameable.length === 1 && menuEntries.length === 1}
        <button
          role="menuitem"
          title="Changes the name used for display and grouping in this window (Shift+double-click the name, or Shift+F2). The file on disk is not renamed."
          onclick={() => editName('rename')}>Rename in viewer…</button
        >
      {/if}
    {/if}
    <div class="popover-menu-sep" role="separator"></div>
    <button role="menuitem" onclick={() => menuSelect(selectAllListed)}>Select all</button>
    {#if selected.length}
      <button role="menuitem" onclick={() => menuSelect(clearSelection)}>Clear selection</button>
    {/if}
    <!-- How every file's name is shown, not just the ones this menu is for. -->
    <div class="popover-menu-sep" role="separator"></div>
    {#each FILE_NAME_OPTIONS.filter((option) => option.key !== 'originalNames' || originalNames.aliased) as option (option.key)}
      {@const on = fileNameOptionOn(option.key)}
      {@const mixed =
        option.key === 'originalNames' && !on && originalNames.original > 0}
      <button
        role="menuitemcheckbox"
        class="fcm-option"
        aria-checked={mixed ? 'mixed' : on}
        title={option.title}
        onclick={() => menuSelect(() => toggleFileNameOption(option.key))}
      >
        <span class="fcm-label">{option.label}</span>
        <span class="fcm-box" class:on class:mixed aria-hidden="true"></span>
      </button>
    {/each}
  </div>
{/if}

<style>
  /* A plain toolbar row between separators, like the group and collapse rows. */
  .file-actions-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 4px;
    /* The collapse row above ends with a 4px margin: 4 + 4 matches the 8px below. */
    padding: 4px 0 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--vscode-sideBar-border, rgba(127, 127, 127, 0.3));
  }
  .fa-count {
    font-size: 11px;
    font-weight: 600;
    margin-left: 3px;
    margin-right: 6px;
  }
  .ss-form {
    display: grid;
    gap: 10px;
  }
  .ss-form label {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    cursor: pointer;
  }
  .ss-form input[type='number'] {
    width: 8em;
    font: inherit;
    padding: 3px 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  .ss-form input[type='number']:disabled {
    opacity: 0.5;
  }
  .ss-result {
    margin: 2px 0 0;
    padding: 8px 10px;
    border-radius: 4px;
    background: var(--vscode-sideBar-background, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--vscode-sideBar-border, #444);
  }
  .ss-hint {
    margin: 0;
    color: var(--vscode-descriptionForeground, #999);
  }
  :global(.file-context-menu .fcm-head) {
    padding: 3px 12px 5px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
    border-bottom: 1px solid var(--vscode-menu-separatorBackground, rgba(127, 127, 127, 0.3));
    margin-bottom: 3px;
  }
  /* Short, and its Render mode submenu sticks out to the side: no scrolling. */
  :global(.file-context-menu.popover-menu) {
    overflow: visible;
  }
  /* Counts (fcm-n) sit at the right edge of an action. */
  :global(.file-context-menu [role='menuitem']) {
    justify-content: space-between;
  }
  :global(.file-context-menu button.danger:not(:disabled)) {
    color: #f48771;
  }
  :global(.file-context-menu .fcm-head) {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.file-context-menu .fcm-sub) {
    position: relative;
  }
  :global(.file-context-menu .fcm-sub > button.open) {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground, #094771));
    color: var(--vscode-menu-selectionForeground, inherit);
  }
  :global(.file-context-menu .fcm-arrow) {
    opacity: 0.7;
  }
  :global(.file-context-menu .fcm-flyout) {
    position: absolute;
    left: 100%;
    top: -5px;
    min-width: 140px;
  }
  :global(.file-context-menu .fcm-flyout.left) {
    left: auto;
    right: 100%;
  }
  :global(.file-context-menu .fcm-flyout button) {
    justify-content: flex-start;
  }
  /* A checkbox at the right edge of the item: empty, checked, or mixed. */
  :global(.file-context-menu .fcm-box) {
    position: relative;
    flex: none;
    align-self: center;
    width: 12px;
    height: 12px;
    box-sizing: border-box;
    border: 1px solid var(--vscode-checkbox-border, rgba(204, 204, 204, 0.55));
    border-radius: 3px;
    background: var(--vscode-checkbox-background, transparent);
  }
  :global(.file-context-menu .fcm-box.on),
  :global(.file-context-menu .fcm-box.mixed) {
    background: var(--vscode-button-background, #0e639c);
    border-color: var(--vscode-button-background, #0e639c);
  }
  :global(.file-context-menu .fcm-box.on::after) {
    content: '';
    position: absolute;
    left: 3px;
    top: 0px;
    width: 3px;
    height: 7px;
    border: solid var(--vscode-button-foreground, #fff);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  :global(.file-context-menu .fcm-box.mixed::after) {
    content: '';
    position: absolute;
    left: 2px;
    right: 2px;
    top: 4.5px;
    height: 1.5px;
    background: var(--vscode-button-foreground, #fff);
  }
  :global(.file-context-menu .fcm-flyout .fcm-label),
  :global(.file-context-menu .fcm-option .fcm-label) {
    flex: 1;
  }
  :global(.file-context-menu button.fcm-option) {
    justify-content: flex-start;
  }
  :global(.file-context-menu .fcm-n) {
    opacity: 0.6;
    font-size: 11px;
  }
</style>
