<script lang="ts">
  import Modal from './Modal.svelte';
  import DialogButton from './DialogButton.svelte';
  import { parseSpaceSeparatedValues } from '../utils/matrix';

  let {
    title,
    label,
    helpLines,
    defaultValue,
    expectedCount,
    errorMessage,
    inputId,
    onApply,
    onClose,
  }: {
    title: string;
    label: string;
    helpLines: string[];
    defaultValue: string;
    expectedCount: number;
    errorMessage: string;
    inputId: string;
    onApply: (values: number[]) => void;
    onClose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(defaultValue);
  let error = $state('');

  function apply() {
    const values = parseSpaceSeparatedValues(text);
    if (values.length !== expectedCount) {
      error = errorMessage;
      return;
    }
    onApply(values);
    onClose();
  }
</script>

<Modal {title} onclose={onClose}>
  <label for={inputId} class="vec-label">{label}</label>
  <div class="vec-help">
    {#each helpLines as line, i (i)}
      {line}<br />
    {/each}
  </div>
  <textarea id={inputId} class="vec-text" rows="4" placeholder={defaultValue} bind:value={text}
  ></textarea>
  {#if error}<p class="vec-error" role="alert">{error}</p>{/if}
  {#snippet footer()}
    <DialogButton onclick={onClose}>Cancel</DialogButton>
    <DialogButton primary onclick={apply}>Apply</DialogButton>
  {/snippet}
</Modal>

<style>
  .vec-label {
    display: block;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .vec-help {
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #999);
    margin-bottom: 8px;
  }
  .vec-text {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    font: 12px var(--vscode-editor-font-family, monospace);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    resize: vertical;
  }
  .vec-error {
    margin: 8px 0 0;
    color: var(--vscode-errorForeground, #f48771);
  }
</style>
