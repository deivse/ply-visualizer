<script lang="ts">
  import Disclosure from './Disclosure.svelte';
  let { host, fileIndex }: { host: any; fileIndex: number } = $props();

  const calibration = $derived(host.fileEntries.require(fileIndex).state.depthForm?.calibration);
  let open = $state(false);

  function toggle() {
    open = !open;
  }
</script>

<div class="depth-group" style="margin-bottom: 8px;">
  <Disclosure
    class="depth-section-toggle"
    data-section={`load-calibration-${fileIndex}`}
    {open}
    ontoggle={toggle}>Load Calibration (beta)</Disclosure
  >
  <div
    class="depth-section-content"
    id={`load-calibration-${fileIndex}`}
    style="display: {open ? 'block' : 'none'}; margin-top: 4px;"
  >
    <button
      class="load-calibration-btn"
      data-file-index={fileIndex}
      style="width: 100%; padding: 4px 8px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-panel-border); border-radius: 2px; cursor: pointer; font-size: 10px;"
      onclick={() => host.openCalibrationFileDialog(fileIndex)}
    >
      📁 Load Calibration File
    </button>
    <div
      class="calibration-info"
      id={`calibration-info-${fileIndex}`}
      style="display: {calibration ? 'block' : 'none'}; margin-top: 4px; padding: 4px; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 2px;"
    >
      <div style="display: flex; align-items: center; gap: 8px;">
        <div
          id={`calibration-filename-${fileIndex}`}
          style="font-size: 9px; font-weight: bold; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
        >{calibration?.fileName ?? ''}</div>
        <select
          id={`camera-select-${fileIndex}`}
          style="flex: 0 0 25%; font-size: 9px; padding: 1px 2px;"
          value={calibration?.selectedCamera ?? ''}
          onchange={(e: Event) =>
            host.onCameraSelectionChange(fileIndex, (e.target as HTMLSelectElement).value)}
        >
          <option value="">Select camera...</option>
          {#each Object.keys(calibration?.data.cameras ?? {}) as name}<option value={name}>{name}</option>{/each}
        </select>
      </div>
    </div>
  </div>
</div>
