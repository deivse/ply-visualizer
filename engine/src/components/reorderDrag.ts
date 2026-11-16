// Shared by the two reorder gestures (file list cards, solo panel items), so
// they start, look and cancel the same way. Their hit-testing differs (list vs
// tiles, long press), so the gestures themselves stay separate.

/** Pointer travel (px) that turns a press into a drag. */
export const REORDER_DRAG_THRESHOLD = 5;

/** Class on the item being dragged (dimmed, media/style.css). */
export const REORDER_DRAGGING_CLASS = 'reorder-dragging';

/** The line showing where a dragged item will land; position it, then remove(). */
export function createDropMarker(): HTMLDivElement {
  const marker = document.createElement('div');
  Object.assign(marker.style, {
    position: 'fixed',
    background: 'var(--vscode-focusBorder, #3794ff)',
    pointerEvents: 'none',
    zIndex: '2147483000',
  });
  document.body.append(marker);
  return marker;
}
