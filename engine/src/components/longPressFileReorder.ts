import type { FileItemHost } from './fileListTypes';
import { moveEntry } from '../utils/reorderEntries';
import { createDropMarker, REORDER_DRAG_THRESHOLD, REORDER_DRAGGING_CLASS } from './reorderDrag';

// Pressing one of these and moving does not drag the card; holding still does.
const CONTROLS = 'button, input, select, textarea, a, label, [role="slider"], [contenteditable]';

/**
 * Reorders a card: drag its header (name, colour, empty space), or hold the
 * header or the card's border/padding for a moment and then drag. Short
 * clicks keep their native behaviour.
 */
export function longPressFileReorder(
  node: HTMLElement,
  options: { host: FileItemHost; entryId: number }
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let y = 0;
  let active = false;
  let suppressClick = false;
  /** The press is on the header outside its controls: moving starts the drag. */
  let dragOnMove = false;
  let frame = 0;
  let beforeId: number | null = null;
  let marker: HTMLDivElement | null = null;
  const row = node.closest<HTMLElement>('.file-item')!;
  const list = node.closest<HTMLElement>('#file-list')!;

  function paint() {
    if (!active) {
      return;
    }
    const rows = [...list.querySelectorAll<HTMLElement>('[data-entry-id]')].filter(
      item => Number(item.dataset.entryId) !== options.entryId
    );
    const target = rows.find(item => {
      const rect = item.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    beforeId = target ? Number(target.dataset.entryId) : null;
    const rect = (target ?? rows.at(-1) ?? row).getBoundingClientRect();
    if (marker) {
      Object.assign(marker.style, {
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        top: `${target ? rect.top : rect.bottom}px`,
      });
    }
    // The scroll container can be the list or a surrounding sidebar.
    for (let parent: HTMLElement | null = list; parent; parent = parent.parentElement) {
      if (
        parent.scrollHeight <= parent.clientHeight ||
        !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)
      ) {
        continue;
      }
      const bounds = parent.getBoundingClientRect();
      parent.scrollTop += y < bounds.top + 32 ? -8 : y > bounds.bottom - 32 ? 8 : 0;
      break;
    }
    frame = requestAnimationFrame(paint);
  }

  function finish(commit = false) {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    if (active && commit) {
      moveEntry(options.host.fileEntries.all, options.entryId, { beforeId });
    }
    active = false;
    row.classList.remove(REORDER_DRAGGING_CLASS);
    node.style.removeProperty('cursor');
    marker?.remove();
    marker = null;
    const releasedPointer = pointer;
    pointer = null;
    if (releasedPointer !== null && node.hasPointerCapture(releasedPointer)) {
      node.releasePointerCapture(releasedPointer);
    }
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    // Expanded settings keep their own pointer gestures (sliders, inputs, etc.).
    if (event.target instanceof Element && event.target.closest('.file-item-content')) {
      return;
    }
    finish();
    suppressClick = false;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = y = event.clientY;
    dragOnMove =
      event.target instanceof Element &&
      !!event.target.closest('.file-item-main') &&
      !event.target.closest(CONTROLS);
    timer = setTimeout(start, 400);
  }
  function start() {
    clearTimeout(timer);
    if (pointer === null) {
      return;
    }
    active = true;
    suppressClick = true;
    node.setPointerCapture(pointer);
    row.classList.add(REORDER_DRAGGING_CLASS);
    node.style.cursor = 'grabbing';
    marker = createDropMarker();
    marker.style.height = '2px';
    paint();
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) {
      return;
    }
    y = event.clientY;
    if (!active && Math.hypot(event.clientX - startX, y - startY) > REORDER_DRAG_THRESHOLD) {
      if (dragOnMove) {
        start();
      } else {
        finish();
      }
    }
    if (active) {
      event.preventDefault();
    }
  }
  function up(event: PointerEvent) {
    if (event.pointerId === pointer) {
      finish(active);
    }
  }
  function cancel() {
    finish();
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'Escape' && pointer !== null) {
      // Cancels the drag only; solo's Esc must not fire too.
      if (active) {
        event.stopPropagation();
      }
      finish();
    }
  }
  function click(event: MouseEvent) {
    if (!suppressClick) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }
  function resetClick() {
    suppressClick = false;
  }
  node.addEventListener('pointerdown', down);
  window.addEventListener('pointerdown', resetClick, true);
  window.addEventListener('click', click, true);
  node.addEventListener('lostpointercapture', cancel);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', key, true);
  return {
    update(value: typeof options) {
      options = value;
    },
    destroy() {
      finish();
      node.removeEventListener('pointerdown', down);
      window.removeEventListener('click', click, true);
      window.removeEventListener('pointerdown', resetClick, true);
      node.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
    },
  };
}
