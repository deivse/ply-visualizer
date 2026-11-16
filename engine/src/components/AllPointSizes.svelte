<script lang="ts">
  import { filesState } from '../state/files.svelte';
  import { fileSelection } from '../state/fileSelection.svelte';
  import { pointSizeSliderMax } from '../utils/pointSizeRange';
  import { pointSizeTargets } from '../utils/pointSizeTargets';
  import SliderField from './SliderField.svelte';

  let { host }: { host: any } = $props();

  /**
   * One size for every loaded cloud, at the foot of the file list - or, while
   * files are selected, for the selected clouds only ("Selection size").
   *
   * Absolute rather than a multiplier: the per-file sliders show real sizes, and
   * a hidden factor between what they read and what is drawn is worse than
   * simply setting them.
   *
   * It stays *inactive* until used, and goes back to inactive whenever the
   * clouds disagree — which happens the moment someone adjusts one row on its
   * own. An active control claiming a single number while the scene holds three
   * different ones would be lying, and stepping such a slider would silently
   * flatten sizes the user had deliberately set.
   */
  /** Every cloud this sets, by file (registry) index (utils/pointSizeTargets). */
  const allIndices = $derived((filesState.entries, pointSizeTargets(host)));
  /** The selected ones; other kinds of selected entries do not count. */
  const selectedIndices = $derived(
    (filesState.entries, pointSizeTargets(host, fileSelection.ids)),
  );
  const forSelection = $derived(selectedIndices.length > 0);
  /** The clouds this control sets. */
  const targets = $derived(forSelection ? selectedIndices : allIndices);
  const sizes = $derived(
    (filesState.entries,
    targets.map((index: number) => host.fileEntries.require(index).state.pointSize ?? 0)),
  );
  const cloudCount = $derived(allIndices.length);
  const inSync = $derived(
    sizes.length > 0 && sizes.every((size: number) => Math.abs(size - sizes[0]) < 1e-9),
  );

  // Dimmed means one thing only: the clouds are not all on the same size, so
  // there is no single number for this control to honestly show. Clouds that
  // already agree - the normal case on load - leave it live.
  const active = $derived(inSync);
  const shownSize = $derived(inSync ? sizes[0] : 0);
  /**
   * The per-file sliders' range (utils/pointSizeRange), taken for the cloud
   * with the largest one. It must not follow the current size: a range of
   * "twice the size" grew with every step of a drag, so the size compounded
   * and ran off to points larger than the screen. It widens only to include a
   * size typed beyond it.
   */
  const rangeMax = $derived(
    (filesState.entries,
    targets.reduce(
      (max: number, index: number) =>
        Math.max(
          max,
          pointSizeSliderMax(host.fileEntries.require(index).spatial?.data?.metadata?.recommendedPointSize),
        ),
      0,
    )),
  );
  const sliderMax = $derived(Math.max(rangeMax, shownSize));

  function applyToAll(size: number) {
    if (!(size > 0)) {
      return;
    }
    for (const index of targets) {
      host.updatePointSize(index, size);
    }
    // The per-file rows read their slider positions from this tick.

    host.requestRender();
  }

  /**
   * Clicking a dimmed control adopts the first cloud's size for everything,
   * which is what makes it meaningful again - and it is an explicit action
   * rather than a silent flattening of sizes someone chose per file.
   */
  function engage() {
    if (!inSync) {
      applyToAll(sizes[0] || 0.005);
    }
  }
</script>

{#if cloudCount > 1}
  <!-- The file rows' own frame, without their class: several specs count
       `.file-item`, and this is a footer control rather than a file. -->
  <div
    class="all-point-sizes file-list-footer"
    style:opacity={active ? 1 : 0.65}
  >
    <!-- Same markup and classes as a file row's own point-size control, so the
         shared one reads as the same kind of thing rather than as a stray
         widget with its own look. -->
    <SliderField
      style="margin-top: 0;"
      label={forSelection ? 'Selection size:' : 'All Sizes:'}
      sliderId="all-point-sizes-slider"
      inputId="all-point-sizes-value"
      value={shownSize}
      min="0.0001"
      max={sliderMax}
      step="0.0001"
      format={(size) => (inSync ? size.toFixed(4) : '')}
      placeholder="mixed"
      valueWidth={44}
      valueTitle="Type a size, including one beyond the slider's range"
      onslide={(size) => {
        applyToAll(size);
        return size;
      }}
      oncommit={(size) => {
        if (!(size > 0)) return undefined;
        applyToAll(size);
        return size;
      }}
      onsliderpointerdown={engage}
      sliderTitle={active
        ? forSelection
          ? `Sets the ${selectedIndices.length} selected cloud${selectedIndices.length === 1 ? '' : 's'}`
          : 'Sets every loaded cloud'
        : `The ${forSelection ? 'selected ' : ''}clouds are at different sizes - click to put them all on one`}
    />
  </div>
{/if}
