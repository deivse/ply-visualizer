import { maskPointerInput } from './pointerMask';

/**
 * Runs a UI drag (moving or resizing a panel) from a pointerdown: captures
 * the pointer on the pressed element, masks the scene underneath and stops
 * text selection for the duration, and reports the movement since the press.
 * Ends exactly once - on release, cancel, or lost capture (gestures, focus
 * changes can take capture away without a pointerup).
 */
export function startPointerDrag(
  event: PointerEvent,
  options: {
    /** Cursor shown everywhere while dragging. */
    cursor: string;
    onMove: (dx: number, dy: number, event: PointerEvent) => void;
    onEnd?: () => void;
  }
): void {
  // No text selection or native drag from the handle: on macOS a stray one
  // can leave the window ignoring clicks.
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  const startX = event.clientX;
  const startY = event.clientY;
  target.setPointerCapture(event.pointerId);
  const unmask = maskPointerInput(options.cursor);
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  const move = (e: PointerEvent) => options.onMove(e.clientX - startX, e.clientY - startY, e);
  let ended = false;
  const end = () => {
    if (ended) {
      return;
    }
    ended = true;
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    target.removeEventListener('lostpointercapture', end);
    document.body.style.userSelect = previousUserSelect;
    unmask();
    options.onEnd?.();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('lostpointercapture', end);
}
