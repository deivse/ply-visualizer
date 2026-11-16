<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import ChipButton from './ChipButton.svelte';
  import { popover } from '../utils/popover';
  import type { FileListHost } from './fileListTypes';
  import { filesState } from '../state/files.svelte';
  import { fileGroupsState } from '../state/fileGroups.svelte';
  import { soloState, soloLayout } from '../state/solo.svelte';
  import { fileSelection, selectAllListed, clearSelection } from '../state/fileSelection.svelte';
  import {
    toggleFileNameOption,
    fileNameOptionOn,
    announceFileNameOptions,
    FILE_NAME_OPTIONS,
  } from '../state/fileNames.svelte';
  import { originalNamesState } from '../state/fileAliases.svelte';
  import { compileGroupRegex, groupRegexPresets, NO_MATCH } from '../utils/regexGroups';

  let { host }: { host: FileListHost } = $props();

  // The ⇄ for all files shows up once any file has an alias; it follows the
  // files' own ⇄ buttons, and so does the desktop View menu.
  const originalNames = $derived((filesState.entries, originalNamesState()));
  const anyAlias = $derived(originalNames.aliased > 0);
  // Numbers, so the effect runs only when they change (not on every list update).
  const aliasedCount = $derived(originalNames.aliased);
  const originalCount = $derived(originalNames.original);
  $effect(() => {
    aliasedCount;
    originalCount;
    untrack(announceFileNameOptions);
  });

  const hasFiles = $derived((filesState.entries, host.solo.topLevel().length > 0));
  const groups = $derived.by(() => {
    filesState.entries;
    fileGroupsState.enabled;
    fileGroupsState.regex;
    return host.solo.groups();
  });
  const active = $derived.by(() => {
    fileGroupsState.active;
    soloState.scopeIds;
    return host.solo.activeGroup(groups);
  });
  const activeIndex = $derived(active ? groups.indexOf(active) : -1);
  const presets = groupRegexPresets();

  // The field is edited locally and applied on Enter / leaving the field, so
  // a half-typed pattern never regroups the scene.
  let draft = $state(fileGroupsState.regex);
  $effect(() => {
    draft = fileGroupsState.regex;
  });
  const draftCheck = $derived(compileGroupRegex(draft));
  const noMatchCount = $derived(groups.find((g) => g.key === NO_MATCH)?.members.length ?? 0);

  let helpOpen = $state(false);

  function apply(source = draft) {
    host.solo.setGroupRegex(source.trim(), true);
  }

  function onRegexKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      apply();
      (event.currentTarget as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      draft = fileGroupsState.regex;
      (event.currentTarget as HTMLInputElement).blur();
    }
  }

  // Recent patterns + presets menu. A custom menu rather than a <select>:
  // the native popup opens left-aligned and as wide as its longest pattern,
  // which runs off the right edge of the window. This one is right-aligned
  // to the button, width-capped and positioned in viewport coordinates so the
  // panel's own scrolling/clipping cannot cut it off.
  type MenuItem = { source: string; label: string | null };
  const menuItems = $derived<{ heading: string; items: MenuItem[] }[]>([
    ...(fileGroupsState.recent.length
      ? [{ heading: 'Recent', items: fileGroupsState.recent.map((source: string) => ({ source, label: null })) }]
      : []),
    { heading: 'Presets', items: presets.map((p) => ({ source: p.source, label: p.label })) },
  ]);
  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);

  function openMenu() {
    menuOpen = true;
  }

  function closeMenu(refocus = true) {
    menuOpen = false;
    if (refocus) menuButton?.focus();
  }

  function pick(source: string) {
    draft = source;
    apply(source);
    closeMenu();
  }

  function setAllCollapsed(collapsed: boolean) {
    for (const entry of host.fileEntries.all) {
      entry.state.collapsed = collapsed;
    }
  }

</script>

{#if hasFiles}
  <div class="file-list-toolbar">
    <ChipButton
      on={!soloLayout.hidden}
      title="Show or hide the floating solo panel"
      onclick={() => host.solo.togglePanel()}>Solo panel</ChipButton
    >
    <span class="flt-spacer"></span>
    <ChipButton
      on={fileGroupsState.enabled}
      title="Group files by a pattern in their names and show one group at a time"
      onclick={() => host.solo.setGroupingEnabled(!fileGroupsState.enabled)}>Group</ChipButton
    >
    <ChipButton round expanded={helpOpen} title="How grouping works" onclick={() => (helpOpen = !helpOpen)}
      >?</ChipButton
    >
  </div>

  {#if helpOpen}
    <Modal title="How grouping works" width={520} onclose={() => (helpOpen = false)}>
    <div class="group-help">
      <p>
        <b>Group</b> splits the open files into groups and shows <b>one group at a time</b> — in
        the 3D view, this list and the solo panel. Switch groups with <kbd>←</kbd> <kbd>→</kbd>
        (or <kbd>,</kbd> <kbd>.</kbd>).
      </p>
      <p>
        A <b>regular expression</b> is matched against each file's name. The text its
        <b>capture group</b> <code>( … )</code> matches is the group: files that capture the same
        text belong together. Without a capture group the whole match is used; files that don't
        match go to “{NO_MATCH}”.
      </p>
      <p>
        A file's name is its path inside an opened folder (e.g.
        <code>kitchen{presets[0].source.includes('\\\\') ? '\\' : '/'}methodA.ply</code>), or just its
        file name.
      </p>
      <table>
        <tbody>
          <tr><td><code>{presets[0].source}</code></td><td>by top-level folder</td></tr>
          <tr><td><code>^([^_]+)_</code></td><td>text before the first “_”</td></tr>
          <tr><td><code>_(\d+)\.ply$</code></td><td>by a trailing number</td></tr>
          <tr><td><code>(gt|ours|baseline)</code></td><td>by one of several words</td></tr>
        </tbody>
      </table>
      <p>
        When you switch groups, a solo moves to the file whose name is the same apart from the
        captured text — e.g. from <code>kitchen/methodA</code> to <code>office/methodA</code>.
      </p>
      <p class="muted">Each file's own visibility checkbox is kept and comes back when grouping is turned off.</p>
    </div>
    </Modal>
  {/if}

  {#if fileGroupsState.enabled}
    <div class="group-regex-row">
      <input
        class="group-regex"
        class:invalid={!draftCheck.ok}
        spellcheck="false"
        autocomplete="off"
        aria-label="Grouping regular expression"
        title="Regular expression; its first capture group is the group. Enter to apply, Esc to cancel."
        bind:value={draft}
        onkeydown={onRegexKeydown}
        onblur={() => draft !== fileGroupsState.regex && apply()}
      />
      <button
        bind:this={menuButton}
        class="group-recent"
        class:open={menuOpen}
        title="Recent patterns and presets"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen ? closeMenu() : openMenu())}
        onkeydown={(e) => {
          if (e.key === 'ArrowDown' && !menuOpen) {
            e.preventDefault();
            openMenu();
          }
        }}>Recent ▾</button
      >
      {#if menuOpen}
        <div
          bind:this={menuEl}
          class="group-menu popover-menu"
          role="menu"
          tabindex="-1"
          aria-label="Recent patterns and presets"
          use:popover={{
            anchor: menuButton,
            align: 'end',
            onclose: () => closeMenu(false),
            initialFocus: () => menuEl?.querySelector<HTMLElement>('.group-menu-item.current'),
          }}
        >
          {#each menuItems as section (section.heading)}
            <div class="popover-menu-heading">{section.heading}</div>
            {#each section.items as item (section.heading + item.source)}
              <button
                class="group-menu-item"
                class:current={item.source === fileGroupsState.regex}
                role="menuitem"
                tabindex="-1"
                title={item.label ? `${item.label}\n${item.source}` : item.source}
                onpointerenter={(event) => (event.currentTarget as HTMLElement).focus()}
                onclick={() => pick(item.source)}
              >
                {#if item.label}<span class="group-menu-label">{item.label}</span>{/if}
                <code class="group-menu-source">{item.source}</code>
              </button>
            {/each}
          {/each}
        </div>
      {/if}
    </div>
    {#if !draftCheck.ok}
      <div class="group-status error">{draftCheck.error}</div>
    {:else if groups.length}
      <div class="group-status">
        {groups.length} group{groups.length === 1 ? '' : 's'}{noMatchCount
          ? ` · ${noMatchCount} file${noMatchCount === 1 ? '' : 's'} not matched`
          : ''}
      </div>
    {/if}

    {#if active}
      <div class="group-switcher" title="← → or , . switch groups">
        <span class="group-label">Group</span>
        <ChipButton title="Previous group (← , PageUp)" onclick={() => host.solo.stepGroup(-1)}
          >‹</ChipButton
        >
        <select
          class="group-select"
          value={active.key}
          title={active.key}
          onchange={(e) => host.solo.setActiveGroup((e.currentTarget as HTMLSelectElement).value)}
        >
          {#each groups as group (group.key)}
            <option value={group.key}>{group.key} ({group.members.length})</option>
          {/each}
        </select>
        <ChipButton title="Next group (→ . PageDown)" onclick={() => host.solo.stepGroup(1)}
          >›</ChipButton
        >
        <span class="group-pos">{activeIndex + 1}/{groups.length}</span>
      </div>
    {/if}
  {/if}

  <div class="file-list-collapse-row" data-no-scene-render>
    <ChipButton title="Collapse all objects" onclick={() => setAllCollapsed(true)}
      >▶ Collapse all</ChipButton
    >
    <ChipButton title="Expand all objects" onclick={() => setAllCollapsed(false)}
      >▼ Expand all</ChipButton
    >
    {#each FILE_NAME_OPTIONS.filter((option) => option.key !== 'originalNames' || anyAlias) as option (option.key)}
      <ChipButton
        on={fileNameOptionOn(option.key)}
        title={option.title}
        onclick={() => toggleFileNameOption(option.key)}>{option.chip}</ChipButton
      >
    {/each}
    <span class="flt-spacer"></span>
    <!-- Kept together: when the panel is narrow they wrap as a pair. -->
    <span class="flt-group">
      <ChipButton title="Select every listed file" onclick={selectAllListed}>Select all</ChipButton>
      <ChipButton
        title="Clear the selection"
        disabled={!fileSelection.ids.length}
        onclick={clearSelection}>Clear selection</ChipButton
      >
    </span>
  </div>
{/if}

<style>
  .file-list-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 2px 0;
    margin-bottom: 8px;
    position: relative;
  }
  .flt-spacer {
    flex: 1;
  }
  .file-list-collapse-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 0 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--vscode-sideBar-border, rgba(127, 127, 127, 0.3));
  }
  .flt-group {
    display: flex;
    gap: 6px;
  }
  .group-help {
    line-height: 1.5;
    user-select: text;
  }
  .group-help p {
    margin: 0 0 10px;
  }
  .group-help table {
    border-collapse: collapse;
    margin: 0 0 10px;
  }
  .group-help td {
    padding: 2px 12px 2px 0;
    vertical-align: top;
  }
  .group-help code,
  .group-help kbd {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    background: rgba(127, 127, 127, 0.18);
    border-radius: 3px;
    padding: 0 3px;
    white-space: nowrap;
  }
  .group-help .muted {
    opacity: 0.7;
    margin: 0;
  }
  .group-regex-row {
    display: flex;
    gap: 4px;
    margin-bottom: 3px;
  }
  .group-regex {
    flex: 1;
    min-width: 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11.5px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    padding: 2px 5px;
  }
  .group-regex.invalid {
    border-color: var(--vscode-inputValidation-errorBorder, #be1100);
  }
  .group-recent {
    flex-shrink: 0;
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
    padding: 1px 6px;
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
    border-radius: 3px;
  }
  .group-recent.open {
    border-color: var(--vscode-focusBorder, #0078d4);
  }
  /* Surface and items: .popover-menu (media/style.css). Long patterns
     ellipsize (hover shows them in full) instead of stretching the menu. */
  .group-menu {
    min-width: 220px;
    max-width: min(480px, calc(100vw - 16px));
  }
  .group-menu-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }
  .group-menu-item.current .group-menu-source::after {
    content: '  ✓';
  }
  .group-menu-label {
    font-size: 11px;
    opacity: 0.85;
  }
  .group-menu-label,
  .group-menu-source {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group-menu-source {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }
  .group-status {
    font-size: 10.5px;
    opacity: 0.7;
    margin: 0 0 6px 2px;
  }
  .group-status.error {
    color: var(--vscode-errorForeground, #f48771);
    opacity: 1;
  }
  .group-pos {
    font-size: 11px;
    min-width: 12px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
  .group-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 6px;
    margin-bottom: 6px;
    border: 1px solid var(--vscode-sideBar-border);
    border-left: 3px solid var(--vscode-focusBorder, #0078d4);
    border-radius: 4px;
    background: var(--vscode-list-hoverBackground);
    font-size: 11px;
  }
  .group-label {
    font-weight: 600;
  }
  .group-select {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
    border-radius: 3px;
    padding: 1px 2px;
  }
</style>
