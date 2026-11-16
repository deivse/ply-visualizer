<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The small bordered button of the panel toolbars (Collapse all, Select all,
   * Group, a…z, the selection's actions…). One component, so the same kind of
   * button looks the same in every panel. Pass `on` for a toggle (it then
   * reports aria-pressed), `expanded` for one that opens something.
   */
  let {
    on,
    expanded,
    danger = false,
    round = false,
    disabled = false,
    title,
    onclick,
    children,
  }: {
    on?: boolean;
    expanded?: boolean;
    danger?: boolean;
    /** A round icon button (the "?" help). */
    round?: boolean;
    disabled?: boolean;
    title?: string;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  class="chip"
  class:on={on || expanded}
  class:danger
  class:round
  aria-pressed={on}
  aria-expanded={expanded}
  {disabled}
  {title}
  {onclick}>{@render children()}</button
>

<style>
  .chip {
    font: inherit;
    font-size: 11px;
    line-height: normal;
    color: var(--vscode-foreground);
    background: transparent;
    border: 1px solid var(--vscode-sideBar-border, #555);
    border-radius: 3px;
    padding: 1px 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover:not(:disabled) {
    background: var(--vscode-list-hoverBackground);
  }
  .chip:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .chip.on {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .chip.danger:not(:disabled):hover {
    border-color: #c74e39;
  }
  .chip.round {
    border-radius: 50%;
    width: 18px;
    height: 18px;
    padding: 0;
    font-weight: 700;
  }
</style>
