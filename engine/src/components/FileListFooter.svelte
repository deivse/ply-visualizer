<script lang="ts">
  import { filesState } from '../state/files.svelte';
  import AllPointColors from './AllPointColors.svelte';
  import AllPointSizes from './AllPointSizes.svelte';
  import type { FileListHost } from './fileListTypes';

  let { host }: { host: FileListHost } = $props();

  /**
   * The scene-wide controls (All/Selection size and color), mounted below
   * #file-list rather than inside it: the list scrolls on its own, and these
   * stay in view however long it gets. Hidden for sequence frames, which the
   * list shows as a single placeholder row.
   */
  const isSequenceFrame = $derived(
    (filesState.entries, host.sequenceMode && host.sequenceFiles.length > 0),
  );
</script>

{#if !isSequenceFrame}
  <AllPointSizes {host} />
  <AllPointColors {host} />
{/if}
