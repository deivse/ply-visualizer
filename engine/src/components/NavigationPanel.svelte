<script lang="ts">
  import { onMount } from 'svelte';
  import { viewerState } from '../state/viewer.svelte';
  import {
    navigation,
    saveNavigation,
    setNavigationPanelHidden,
    FLY_SPEED_MIN,
    FLY_SPEED_MAX,
  } from '../state/navigation.svelte';
  import SliderField from './SliderField.svelte';
  import { startPointerDrag } from '../utils/pointerDrag';

  /**
   * Floating scene navigation panel: the control scheme and the fly scheme's
   * options (flyNavigation.ts). Shown from View → Navigation Panel (desktop)
   * or the Controls tab; everything here is remembered across sessions.
   */
  let { host }: { host: any } = $props();

  const SCHEMES = [
    { type: 'fly', label: 'Trackball + Fly', switch: () => host.switchToFlyControls() },
    { type: 'legacy-trackball', label: 'Legacy Trackball', switch: () => host.switchToLegacyTrackballControls() },
    { type: 'trackball', label: 'Trackball (virtual ball)', switch: () => host.switchToTrackballControls() },
    { type: 'orbit', label: 'Orbit', switch: () => host.switchToOrbitControls() },
    { type: 'arcball', label: 'Arcball', switch: () => host.switchToArcballControls() },
  ];

  const flying = $derived(viewerState.controlScheme === 'fly');
  const trackpadApplies = $derived(flying || viewerState.controlScheme === 'legacy-trackball');

  function setScheme(type: string) {
    SCHEMES.find((scheme) => scheme.type === type)?.switch();
  }

  function setOption(key: 'alwaysFps' | 'trackpad', on: boolean) {
    navigation[key] = on;
    saveNavigation();
  }

  function clamp(value: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, value));
  }
  function setSpeed(value: number) {
    navigation.speed = clamp(value, FLY_SPEED_MIN, FLY_SPEED_MAX);
    saveNavigation();
    return navigation.speed;
  }
  function setSensitivity(value: number) {
    navigation.lookSensitivity = clamp(value, 0.1, 5);
    saveNavigation();
    return navigation.lookSensitivity;
  }

  // ---- floating, draggable panel (width only: the height follows content) ----
  const MIN_W = 220;
  function defaultRect() {
    return { x: 16, y: 56, w: 260 };
  }
  function clampRect(rect: { x: number; y: number; w: number }) {
    const w = Math.max(MIN_W, Math.min(rect.w, window.innerWidth - 8));
    return {
      w,
      x: Math.max(4, Math.min(rect.x, window.innerWidth - w - 4)),
      y: Math.max(4, Math.min(rect.y, window.innerHeight - 40)),
    };
  }
  let rect = $state(clampRect(navigation.rect ?? defaultRect()));
  function persistRect() {
    navigation.rect = { ...rect };
    saveNavigation();
  }
  function onHeaderPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('button')) return;
    const origin = { ...rect };
    startPointerDrag(event, {
      cursor: 'move',
      onMove: (dx, dy) => (rect = clampRect({ ...origin, x: origin.x + dx, y: origin.y + dy })),
      onEnd: persistRect,
    });
  }
  function onResizePointerDown(event: PointerEvent) {
    const origin = { ...rect };
    startPointerDrag(event, {
      cursor: 'ew-resize',
      onMove: (dx) => (rect = clampRect({ ...origin, w: origin.w + dx })),
      onEnd: persistRect,
    });
  }
  onMount(() => {
    const onWindowResize = () => (rect = clampRect(rect));
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  });
</script>

{#if !navigation.hidden}
  <div
    class="nav-panel"
    role="group"
    aria-label="Navigation"
    style:left="{rect.x}px"
    style:top="{rect.y}px"
    style:width="{rect.w}px"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="nav-header" onpointerdown={onHeaderPointerDown} title="Drag to move">
      <span class="nav-title">NAVIGATION</span>
      <span class="spacer"></span>
      <button
        class="hb"
        title="Hide navigation panel (show it again from View → Navigation Panel or the Controls tab)"
        onclick={() => setNavigationPanelHidden(true)}>✕</button
      >
    </div>
    <div class="nav-body">
      <label class="nav-row">
        <span>Controls</span>
        <select
          id="nav-control-scheme"
          value={viewerState.controlScheme}
          onchange={(event) => setScheme((event.target as HTMLSelectElement).value)}
        >
          {#each SCHEMES as scheme (scheme.type)}
            <option value={scheme.type}>{scheme.label}</option>
          {/each}
        </select>
      </label>
      <label class="nav-check" class:off={!flying} title="Drag aims from where the camera stands, even with no movement key held (Trackball + Fly)">
        <input
          id="nav-always-fps"
          type="checkbox"
          checked={navigation.alwaysFps}
          disabled={!flying}
          onchange={(event) => setOption('alwaysFps', (event.target as HTMLInputElement).checked)}
        />
        Always aim (FPS)
      </label>
      <label
        class="nav-check"
        class:off={!trackpadApplies}
        title="Two-finger scroll rotates (or aims), pinch zooms, Shift+scroll pans; no click-and-drag needed. A mouse wheel rotates too. (Trackball + Fly, Legacy Trackball)"
      >
        <input
          id="nav-trackpad"
          type="checkbox"
          checked={navigation.trackpad}
          disabled={!trackpadApplies}
          onchange={(event) => setOption('trackpad', (event.target as HTMLInputElement).checked)}
        />
        Trackpad mode
      </label>
      <SliderField
        class="point-size-control nav-slider"
        label="Fly speed"
        sliderId="nav-fly-speed"
        inputId="nav-fly-speed-value"
        value={navigation.speed}
        min={Math.log10(FLY_SPEED_MIN)}
        max={Math.log10(FLY_SPEED_MAX)}
        step={0.01}
        toSlider={(v) => Math.log10(v)}
        format={(v) => `${v.toFixed(2)}`}
        valueWidth={34}
        valueLabel="Fly speed multiplier"
        sliderTitle="Relative to the distance to the rotation center. Double-click to reset"
        onslide={(sv) => setSpeed(10 ** sv)}
        oncommit={setSpeed}
        onreset={() => setSpeed(1)}
      />
      <SliderField
        class="point-size-control nav-slider"
        label="Aim speed"
        sliderId="nav-look-sensitivity"
        inputId="nav-look-sensitivity-value"
        value={navigation.lookSensitivity}
        min={Math.log10(0.1)}
        max={Math.log10(5)}
        step={0.01}
        toSlider={(v) => Math.log10(v)}
        format={(v) => `${v.toFixed(2)}`}
        valueWidth={34}
        valueLabel="Aim sensitivity"
        onslide={(sv) => setSensitivity(10 ** sv)}
        oncommit={setSensitivity}
        onreset={() => setSensitivity(1)}
      />
      <div class="nav-hint" class:off={!flying}>
        <b>W A S D</b> move · <b>Q</b>/<b>E</b> down/up · <b>Shift</b> faster · drag while moving to aim
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="nav-grip" title="Resize" onpointerdown={onResizePointerDown}></div>
  </div>
{/if}

<style>
  .nav-panel {
    position: fixed;
    z-index: 900;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 90%, transparent);
    border: 1px solid var(--vscode-panel-border, #444);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: 12px;
    color: var(--vscode-foreground, #ccc);
    backdrop-filter: blur(6px);
    user-select: none;
  }
  .nav-header {
    display: flex;
    align-items: center;
    padding: 3px 6px;
    cursor: move;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
  }
  .nav-title {
    font-weight: 700;
    letter-spacing: 0.08em;
    font-size: 10px;
    padding: 0 4px;
    opacity: 0.6;
  }
  .spacer {
    flex: 1;
  }
  .hb {
    font: inherit;
    color: inherit;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    padding: 2px 6px;
    opacity: 0.8;
  }
  .hb:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.08));
  }
  .nav-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px 10px;
  }
  .nav-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-row select {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: var(--vscode-dropdown-foreground, inherit);
    background: var(--vscode-dropdown-background, #3c3c3c);
    border: 1px solid var(--vscode-dropdown-border, #555);
    border-radius: 3px;
    padding: 2px 4px;
  }
  .nav-check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .off {
    opacity: 0.5;
  }
  .nav-check.off {
    cursor: default;
  }
  .nav-hint {
    font-size: 10.5px;
    opacity: 0.75;
    line-height: 1.4;
  }
  .nav-hint.off {
    opacity: 0.4;
  }
  .nav-grip {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
  }
</style>
