/**
 * A menu or other popup that floats over everything (Svelte action). Shared
 * by the file card menu and the group pattern menu, so they place, close and
 * navigate the same way. Styles: media/style.css (`.popover-menu`).
 *
 * - Moved to <body>, so no panel's overflow or stacking clips it.
 * - Placed at a point (right-click), or under an anchor element (a menu
 *   button) aligned to its start or end edge; kept inside the window, with a
 *   max height so a long menu scrolls instead of running off screen.
 * - Closes on a press outside it (and outside the anchor, which toggles it
 *   itself), Esc, the window losing focus, a wheel outside it, or a resize.
 * - Arrow keys, Home and End move focus over its enabled menu items; Enter
 *   and Space are the items' own button clicks.
 */
export interface PopoverOptions {
  onclose: () => void;
  /** Where a context menu opened (viewport px). */
  at?: { x: number; y: number };
  /** The element a dropdown hangs from. */
  anchor?: HTMLElement | null;
  /** Which edge of the anchor the popover lines up with. */
  align?: 'start' | 'end';
  /** Item to focus first (else the menu itself, so keys work). */
  initialFocus?: () => HTMLElement | null | undefined;
}

const MARGIN = 4;
const ITEMS = '[role^="menuitem"]:not(:disabled)';

export function popover(node: HTMLElement, options: PopoverOptions) {
  let current = options;
  document.body.appendChild(node);
  node.style.position = 'fixed';
  if (!node.hasAttribute('tabindex')) {
    node.tabIndex = -1;
  }

  function place() {
    const anchor = current.anchor?.getBoundingClientRect();
    node.style.maxHeight = '';
    let x = current.at?.x ?? 0;
    let y = current.at?.y ?? 0;
    if (anchor) {
      y = anchor.bottom + 2;
      node.style.maxHeight = `${Math.max(120, window.innerHeight - y - MARGIN)}px`;
    }
    const rect = node.getBoundingClientRect();
    if (anchor) {
      x = current.align === 'end' ? anchor.right - rect.width : anchor.left;
    }
    node.style.left = `${Math.max(MARGIN, Math.min(x, window.innerWidth - rect.width - MARGIN))}px`;
    node.style.top = `${Math.max(MARGIN, Math.min(y, window.innerHeight - rect.height - MARGIN))}px`;
  }

  const outside = (target: EventTarget | null) =>
    !(target instanceof Node) || (!node.contains(target) && !current.anchor?.contains(target));

  function onPointerDown(event: PointerEvent) {
    if (outside(event.target)) {
      current.onclose();
    }
  }
  function onWheel(event: WheelEvent) {
    if (outside(event.target)) {
      current.onclose();
    }
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      current.anchor?.focus();
      current.onclose();
      return;
    }
    if (!node.contains(document.activeElement) && document.activeElement !== node) {
      return;
    }
    const items = [...node.querySelectorAll<HTMLElement>(ITEMS)].filter(
      item => item.offsetParent !== null
    );
    if (!items.length) {
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (event.key === 'ArrowDown') {
      next = at < 0 ? 0 : (at + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Tab') {
      current.onclose();
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    items[next].focus();
    items[next].scrollIntoView({ block: 'nearest' });
  }
  const onBlur = () => current.onclose();
  const onResize = () => current.onclose();

  place();
  (current.initialFocus?.() ?? node).focus({ preventScroll: true });
  current.initialFocus?.()?.scrollIntoView({ block: 'nearest' });
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  return {
    update(next: PopoverOptions) {
      current = next;
    },
    destroy() {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      node.remove();
    },
  };
}
