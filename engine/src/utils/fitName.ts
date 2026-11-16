export interface FitNameParams {
  full: string;
  short: string;
  /** Use `short` when `full` does not fit. */
  enabled: boolean;
  /**
   * A path: when even the chosen text does not fit, the ellipsis goes at the
   * start (needs the `fit-path` CSS class), so the file name stays visible.
   */
  path?: boolean;
}

// Left-to-right marks keep leading/trailing punctuation ("/", ".ply") in
// place inside the right-to-left box the start ellipsis needs.
const LRM = '‎';

/**
 * Whether the text is wider than the box. Measures the text itself:
 * scrollWidth is not reliable in a right-to-left box.
 */
function overflows(node: HTMLElement): boolean {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect().width > node.clientWidth + 0.5;
}

/**
 * Svelte action: shows the full name when it fits and the smart abbreviation
 * only when it does not; CSS ellipsis remains the last resort. Re-checks on
 * resize.
 */
export function fitName(node: HTMLElement, params: FitNameParams) {
  let current = params;
  const fit = () => {
    node.classList.toggle('fit-path', !!current.path);
    node.textContent = current.path ? LRM + current.full + LRM : current.full;
    if (current.enabled && current.short !== current.full && overflows(node)) {
      node.textContent = current.path ? LRM + current.short + LRM : current.short;
    }
  };
  const observer = new ResizeObserver(fit);
  observer.observe(node);
  fit();
  return {
    update(next: FitNameParams) {
      current = next;
      fit();
    },
    destroy() {
      observer.disconnect();
    },
  };
}
