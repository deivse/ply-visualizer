<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  /**
   * The header button of a collapsible section: one arrow style and
   * aria-expanded everywhere. The caller owns the state (`open`) and the
   * section body; `ontoggle` flips it. Other attributes (class, data-*,
   * style, title) go on the button, so existing styling and tests keep
   * working. Styles: media/style.css (`.disclosure`).
   */
  let {
    open,
    ontoggle,
    children,
    class: className = '',
    ...rest
  }: {
    open: boolean;
    ontoggle: () => void;
    children: Snippet;
    class?: string;
  } & Omit<HTMLButtonAttributes, 'onclick' | 'class' | 'children' | 'type'> = $props();
</script>

<button
  type="button"
  class="disclosure {className}"
  aria-expanded={open}
  {...rest}
  onclick={ontoggle}
  ><span class="toggle-icon" aria-hidden="true">{open ? '▼' : '▶'}</span> {@render children()}</button
>
