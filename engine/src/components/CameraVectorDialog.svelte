<script lang="ts">
  import Modal from './Modal.svelte';
  import DialogButton from './DialogButton.svelte';
  import { parseSpaceSeparatedValues } from '../utils/matrix';

  let {
    title,
    label,
    defaultValue,
    inputId,
    radioName,
    radioOptions,
    resetButtonLabel,
    resetValue,
    errorMessage,
    onApply,
    onClose,
  }: {
    title: string;
    label: string;
    defaultValue: string;
    inputId: string;
    radioName: string;
    radioOptions: Array<{ value: string; label: string; checked: boolean }>;
    resetButtonLabel: string;
    resetValue: string;
    errorMessage: string;
    onApply: (values: number[], constraint: string) => void;
    onClose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(defaultValue);
  // svelte-ignore state_referenced_locally
  let constraint = $state(
    radioOptions.find((option) => option.checked)?.value ?? radioOptions[0]?.value ?? '',
  );
  let error = $state('');

  function apply() {
    const values = parseSpaceSeparatedValues(text);
    if (values.length !== 3) {
      error = errorMessage;
      return;
    }
    onApply(values, constraint);
    onClose();
  }
</script>

<Modal {title} onclose={onClose}>
  <label for={inputId} class="vec-label">{label}</label>
  <textarea id={inputId} class="vec-text" rows="3" placeholder={defaultValue} bind:value={text}
  ></textarea>
  <fieldset class="vec-keep">
    <legend>Keep constant when changing:</legend>
    {#each radioOptions as option (option.value)}
      <label>
        <input type="radio" name={radioName} value={option.value} bind:group={constraint} />
        {option.label}
      </label>
    {/each}
  </fieldset>
  {#if error}<p class="vec-error" role="alert">{error}</p>{/if}
  {#snippet footer()}
    <DialogButton onclick={() => (text = resetValue)}>{resetButtonLabel}</DialogButton>
    <span class="vec-spacer"></span>
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
  .vec-keep {
    border: 0;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
  }
  .vec-keep legend {
    padding: 0;
    margin-bottom: 6px;
  }
  .vec-keep label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
  .vec-error {
    margin: 8px 0 0;
    color: var(--vscode-errorForeground, #f48771);
  }
  .vec-spacer {
    flex: 1;
  }
</style>
