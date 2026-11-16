import { createDropMarker, REORDER_DRAG_THRESHOLD, REORDER_DRAGGING_CLASS } from './reorderDrag';

/**
 * Drag a solo panel item to reorder: the same order as the file list, which
 * shows the move too. A press that does not move stays a click (solo).
 * Works in both layouts: a list drops above/below an item, tiles left/right.
 */
export function soloReorder(
  node: HTMLElement,
  options: {
    entryId: number;
    move: (id: number, target: { beforeId?: number; afterId?: number }) => void;
  }
) {
  let pointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let active = false;
  let suppressClick = false;
  let marker: HTMLDivElement | null = null;
  let target: { beforeId?: number; afterId?: number } | null = null;

  const body = () => node.closest<HTMLElement>('.solo-body');
  const tiles = () => !body()?.classList.contains('list');

  function place(x: number, y: number) {
    const items = [...(body()?.querySelectorAll<HTMLElement>('.solo-item[data-entry-id]') ?? [])];
    let best: HTMLElement | null = null;
    let bestDistance = Infinity;
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    if (!best || !marker) {
      return;
    }
    const r = best.getBoundingClientRect();
    const id = Number(best.dataset.entryId);
    const horizontal = tiles();
    const before = horizontal ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
    target = id === options.entryId ? null : before ? { beforeId: id } : { afterId: id };
    marker.style.display = target ? 'block' : 'none';
    Object.assign(
      marker.style,
      horizontal
        ? {
            left: `${(before ? r.left : r.right) - 1}px`,
            top: `${r.top}px`,
            width: '2px',
            height: `${r.height}px`,
          }
        : {
            left: `${r.left}px`,
            top: `${(before ? r.top : r.bottom) - 1}px`,
            width: `${r.width}px`,
            height: '2px',
          }
    );
  }

  function finish(commit: boolean) {
    if (active && commit && target) {
      options.move(options.entryId, target);
    }
    active = false;
    target = null;
    node.classList.remove(REORDER_DRAGGING_CLASS);
    marker?.remove();
    marker = null;
    if (pointer !== null && node.hasPointerCapture(pointer)) {
      node.releasePointerCapture(pointer);
    }
    pointer = null;
  }

  function down(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    suppressClick = false;
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) {
      return;
    }
    if (!active) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < REORDER_DRAG_THRESHOLD) {
        return;
      }
      active = true;
      suppressClick = true;
      node.setPointerCapture(pointer);
      node.classList.add(REORDER_DRAGGING_CLASS);
      marker = createDropMarker();
    }
    event.preventDefault();
    place(event.clientX, event.clientY);
  }
  function up(event: PointerEvent) {
    if (event.pointerId === pointer) {
      finish(true);
    }
  }
  function cancel() {
    finish(false);
  }
  function key(event: KeyboardEvent) {
    if (active && event.key === 'Escape') {
      event.stopPropagation();
      finish(false);
    }
  }
  function click(event: MouseEvent) {
    if (!suppressClick) {
      return;
    }
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('lostpointercapture', cancel);
  node.addEventListener('click', click, true);
  window.addEventListener('keydown', key, true);
  return {
    update(next: typeof options) {
      options = next;
    },
    destroy() {
      finish(false);
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('lostpointercapture', cancel);
      node.removeEventListener('click', click, true);
      window.removeEventListener('keydown', key, true);
    },
  };
}
