<script lang="ts">
  /**
   * A labelled slider with an editable number beside it (point size, splat
   * size, joint radius, camera scale, All Sizes). One place for the
   * behaviour: typing commits on Enter or blur, input that is not accepted
   * reverts, focus selects the text, double-click on the slider resets.
   *
   * The callbacks return the value that resulted (or undefined to reject a
   * typed one), and the field shows that - so sources that are not reactive
   * state (the splat size) stay in step without anyone poking at the DOM.
   * It also follows `value` when it changes from outside (Shift on another
   * row, All Sizes).
   */
  let {
    label,
    sliderId,
    inputId,
    value,
    min,
    max,
    step,
    format,
    toSlider = (v: number) => v,
    onslide,
    oncommit,
    onreset,
    onsliderpointerdown,
    onsliderpointerend,
    class: className = 'point-size-control',
    style,
    labelStyle,
    sliderClass = 'size-slider',
    sliderTitle = 'Double-click to reset',
    valueTitle,
    valueLabel,
    valueWidth = 30,
    placeholder,
  }: {
    label: string;
    sliderId: string;
    inputId: string;
    value: number;
    min: number | string;
    max: number | string;
    step: number | string;
    /** Text for the number field ('' shows `placeholder`). */
    format: (value: number) => string;
    /** Slider position for a value (a log scale, say). */
    toSlider?: (value: number) => number;
    onslide: (sliderValue: number) => number | undefined;
    /** A typed number; return the resulting value, or undefined to revert. */
    oncommit: (typed: number) => number | undefined;
    onreset?: () => number | undefined;
    onsliderpointerdown?: (event: PointerEvent) => void;
    onsliderpointerend?: () => void;
    class?: string;
    style?: string;
    labelStyle?: string;
    sliderClass?: string;
    sliderTitle?: string;
    valueTitle?: string;
    valueLabel?: string;
    valueWidth?: number;
    placeholder?: string;
  } = $props();

  // svelte-ignore state_referenced_locally
  let current = $state(value);
  $effect(() => {
    current = value;
  });

  function show(next: number | undefined) {
    if (next !== undefined) current = next;
  }

  function commit(event: Event) {
    const input = event.target as HTMLInputElement;
    const typed = parseFloat(input.value);
    const next = Number.isFinite(typed) ? oncommit(typed) : undefined;
    show(next);
    // Rejected (or unchanged): put the shown value back.
    input.value = format(current);
  }
</script>

<div class={className} {style}>
  <label for={sliderId} style={labelStyle}>{label}</label>
  <input
    type="range"
    id={sliderId}
    class={sliderClass}
    {min}
    {max}
    {step}
    value={toSlider(current)}
    title={sliderTitle}
    style="width: 100%;"
    oninput={(event) => show(onslide(parseFloat((event.target as HTMLInputElement).value)))}
    ondblclick={(event) => {
      if (!onreset) return;
      event.preventDefault();
      show(onreset());
    }}
    onpointerdown={onsliderpointerdown}
    onpointerup={onsliderpointerend}
    onpointercancel={onsliderpointerend}
  />
  <input
    type="text"
    id={inputId}
    class="size-input"
    value={format(current)}
    {placeholder}
    title={valueTitle}
    aria-label={valueLabel}
    style="width: {valueWidth}px;"
    onblur={commit}
    onkeydown={(event) => {
      if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
    }}
    onfocus={(event) => (event.target as HTMLInputElement).select()}
  />
</div>
