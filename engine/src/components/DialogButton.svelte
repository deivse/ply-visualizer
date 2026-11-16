<script lang="ts">
  import type { Snippet } from 'svelte';

  /** A dialog's action button (Cancel, Apply…); `primary` for the main one. */
  let {
    primary = false,
    disabled = false,
    title,
    onclick,
    children,
  }: {
    primary?: boolean;
    disabled?: boolean;
    title?: string;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button type="button" class="dialog-btn" class:primary {disabled} {title} {onclick}
  >{@render children()}</button
>

<style>
  .dialog-btn {
    padding: 5px 14px;
    border-radius: 3px;
    font: inherit;
    cursor: pointer;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
  }
  .dialog-btn.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }
  .dialog-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
