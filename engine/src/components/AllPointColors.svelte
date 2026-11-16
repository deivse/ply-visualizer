<script lang="ts">
  import { filesState } from '../state/files.svelte';
  import { getPointCloudColorOptions, type PointCloudColorOption } from '../colorOptions';
  import { fileSelection } from '../state/fileSelection.svelte';

  let { host }: { host: any } = $props();

  type Cloud = { index: number; data: any; options: PointCloudColorOption[] };
  type GlobalOption = PointCloudColorOption & { available: number };

  /**
   * Every cloud not drawn as splats, by file (registry) index; like All
   * Sizes, only the selected ones while any cloud is selected.
   */
  const allClouds = $derived.by((): (Cloud & { id: number })[] => {
    filesState.entries;
    return (host.fileEntries.all as readonly any[]).flatMap((entry, index: number) => {
      const data = entry.kind === 'spatial' ? entry.spatial?.data : null;
      if (!data || host.splatMode?.isActive(index)) {
        return [];
      }
      return [{ id: entry.id, index, data, options: getPointCloudColorOptions(host, data, index) }];
    });
  });
  const selectedClouds = $derived(allClouds.filter((cloud) => fileSelection.ids.includes(cloud.id)));
  const forSelection = $derived(selectedClouds.length > 0);
  const clouds = $derived(forSelection ? selectedClouds : allClouds);
  const cloudCount = $derived(clouds.length);

  const options = $derived.by((): GlobalOption[] => {
    const byValue = new Map<string, { labels: Set<string>; available: number }>();
    for (const cloud of clouds) {
      for (const option of cloud.options) {
        const existing = byValue.get(option.value);
        if (existing) {
          existing.labels.add(option.label);
          existing.available++;
        } else {
          byValue.set(option.value, { labels: new Set([option.label]), available: 1 });
        }
      }
    }

    return Array.from(byValue, ([value, details]) => {
      let label = Array.from(details.labels)[0];
      if (value === 'original' && details.labels.size > 1) {
        label = 'Original / camera-projected';
      } else if (value === 'assigned') {
        label = 'Assigned (per cloud)';
      }
      return { value, label, available: details.available };
    }).sort(
      (a, b) => optionRank(a.value) - optionRank(b.value) || a.label.localeCompare(b.label),
    );
  });

  const commonMode = $derived.by(() => {
    if (cloudCount === 0) {
      return '';
    }
    const first = host.fileEntries.require(clouds[0].index).state.colorMode ?? 'assigned';
    return clouds.every(
      (cloud) => (host.fileEntries.require(cloud.index).state.colorMode ?? 'assigned') === first,
    )
      ? first
      : '';
  });

  function optionRank(value: string): number {
    if (value === 'original') return 0;
    if (value === 'recolored') return 1;
    if (value === 'intensity') return 2;
    if (value === 'intensity-viridis') return 3;
    if (value === 'intensity-colors') return 4;
    if (value.startsWith('scalar:')) return 5;
    if (value === 'assigned') return 6;
    return 7;
  }

  function applyToAll(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) {
      return;
    }
    for (const cloud of clouds) {
      if (cloud.options.some((option) => option.value === value)) {
        // Deliberately call only the colour entry point. In particular, do not
        // engage AllPointSizes: mixed per-cloud sizes must remain mixed.
        host.onFileColorModeChange(cloud.index, value);
      }
    }
  }
</script>

{#if allClouds.length > 1}
  <div
    class="all-point-colors file-list-footer"
  >
    <div class="color-control" style="margin: 0;">
      <label for="all-point-colors-select">{forSelection ? 'Selection color:' : 'All Colors:'}</label>
      <select
        id="all-point-colors-select"
        class="color-selector"
        value={commonMode}
        onchange={applyToAll}
        title={`Applies to ${forSelection ? `the ${cloudCount} selected` : 'all'} cloud${cloudCount === 1 ? '' : 's'} that offer the colour; other colours and all point sizes stay unchanged`}
      >
        {#if !commonMode}
          <option value="" disabled>Mixed</option>
        {/if}
        {#each options as option (option.value)}
          <option value={option.value}
            >{option.label}{option.available < cloudCount
              ? ` (${option.available}/${cloudCount})`
              : ''}</option
          >
        {/each}
      </select>
    </div>
  </div>
{/if}
