import * as THREE from 'three';
import { navigation } from './state/navigation.svelte';
import type { ViewerLifetime } from './utils/viewerLifetime';

/**
 * Keyboard flight and FPS-style aiming on top of the trackball, plus the
 * trackpad mode.
 *
 * Fly scheme ('fly'): a legacy trackball while standing still. Holding a
 * movement key (W/A/S/D, Q/E down/up, Shift faster) flies the camera and
 * its rotation center together, and a left drag then aims the camera from
 * where it stands (yaw about the scene's up axis, pitch about the camera's
 * right) instead of orbiting the center. "Always FPS" keeps that aiming
 * without a key held. The center stays straight ahead at the same distance,
 * so letting go of the keys returns to orbiting whatever is in front.
 *
 * Keys are matched by physical position (`event.code`), so the cluster sits
 * under the left hand on any layout.
 *
 * Trackpad mode (fly and legacy trackball): two-finger scrolling drives the
 * trackball as if dragging (or aims, while FPS aiming is on), pinch zooms
 * toward the center, Shift+scroll pans. A mouse wheel then rotates too.
 */

const MOVE: Record<string, [number, number, number]> = {
  // [right, up, forward]
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyA: [-1, 0, 0],
  KeyD: [1, 0, 0],
  KeyE: [0, 1, 0],
  KeyQ: [0, -1, 0],
};

/** Fraction of the distance to the rotation center flown per second at 1×. */
const BASE_SPEED = 0.6;
const SPRINT = 4;
/** Radians of aim per pixel at sensitivity 1. */
const LOOK_RADIANS_PER_PX = 0.0025;
/** Keeps the view from flipping over the up axis. */
const MIN_POLAR = 0.01;

type TrackballLike = {
  target: THREE.Vector3;
  update(): void;
  rotateSpeed?: number;
  worldUp?: THREE.Vector3;
  // TrackballControls internals, zeroed to stop its momentum.
  _lastAngle?: number;
  _movePrev?: THREE.Vector2;
  _moveCurr?: THREE.Vector2;
  _zoomStart?: THREE.Vector2;
  _zoomEnd?: THREE.Vector2;
  _panStart?: THREE.Vector2;
  _panEnd?: THREE.Vector2;
};

export interface FlyNavigationHost {
  camera: THREE.PerspectiveCamera;
  controls: TrackballLike;
  controlType: string;
  renderer: { domElement: HTMLCanvasElement };
  lifetime: ViewerLifetime;
  requestRender(): void;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** The principal axis closest to `v` (the scene's up when none was set). */
export function nearestAxis(v: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) {
    return new THREE.Vector3(Math.sign(v.x) || 1, 0, 0);
  }
  if (ay >= az) {
    return new THREE.Vector3(0, Math.sign(v.y) || 1, 0);
  }
  return new THREE.Vector3(0, 0, Math.sign(v.z) || 1);
}

export class FlyNavigation {
  private readonly held = new Set<string>();
  private sprint = false;
  /** The pointer aiming the camera, while a look drag runs. */
  private lookPointer: number | null = null;
  /** A left drag passed to the trackball, so a key press can take it over. */
  private trackballPointer: number | null = null;
  private dispatchingSynthetic = false;
  private lastUpdate = 0;

  constructor(private readonly host: FlyNavigationHost) {
    const { lifetime } = host;
    const canvas = host.renderer.domElement;
    // On the canvas' parent in the capture phase: before the controls (on
    // the canvas) see the event, after document-level listeners (the render
    // loop's wake-up) already have.
    const container = canvas.parentElement ?? canvas;
    lifetime.listen(document, 'keydown', e => this.onKeyDown(e as KeyboardEvent), {
      capture: true,
    });
    lifetime.listen(document, 'keyup', e => this.onKeyUp(e as KeyboardEvent), { capture: true });
    lifetime.listen(window, 'blur', () => this.releaseKeys());
    lifetime.listen(container, 'pointerdown', e => this.onPointerDown(e as PointerEvent), {
      capture: true,
    });
    lifetime.listen(window, 'pointermove', e => this.onPointerMove(e as PointerEvent), {
      capture: true,
    });
    lifetime.listen(window, 'pointerup', e => this.onPointerUp(e as PointerEvent), {
      capture: true,
    });
    lifetime.listen(window, 'pointercancel', e => this.onPointerUp(e as PointerEvent), {
      capture: true,
    });
    lifetime.listen(container, 'wheel', e => this.onWheel(e as WheelEvent), {
      capture: true,
      passive: false,
    });
  }

  private get flying(): boolean {
    return this.host.controlType === 'fly';
  }

  /** Whether a left drag aims rather than orbits right now. */
  get aiming(): boolean {
    return this.flying && (navigation.alwaysFps || this.held.size > 0 || this.lookPointer !== null);
  }

  /** A movement key the fly scheme takes, so the shortcut handler skips it. */
  consumes(event: KeyboardEvent): boolean {
    return this.flying && event.code in MOVE && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  // ---- keys ------------------------------------------------------------------

  private onKeyDown(event: KeyboardEvent): void {
    this.sprint = event.shiftKey;
    if (!this.consumes(event) || isTyping(event.target)) {
      return;
    }
    event.preventDefault();
    const wasIdle = this.held.size === 0;
    this.held.add(event.code);
    if (wasIdle) {
      this.lastUpdate = performance.now();
      this.stopMomentum();
      this.takeOverTrackballDrag();
      this.host.requestRender();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.sprint = event.shiftKey;
    this.held.delete(event.code);
  }

  private releaseKeys(): void {
    this.held.clear();
    this.sprint = false;
  }

  // ---- movement ----------------------------------------------------------------

  /**
   * Flies the camera for this frame; called by the render loop before the
   * controls update. True while it moved (keeps the loop awake).
   */
  update(): boolean {
    const now = performance.now();
    const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
    this.lastUpdate = now;
    if (!this.flying || this.held.size === 0) {
      return false;
    }
    let right = 0;
    let up = 0;
    let forward = 0;
    for (const code of this.held) {
      const [r, u, f] = MOVE[code] ?? [0, 0, 0];
      right += r;
      up += u;
      forward += f;
    }
    if (right === 0 && up === 0 && forward === 0) {
      return false;
    }
    const { camera, controls } = this.host;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const worldUp = this.worldUp();
    const side = new THREE.Vector3().crossVectors(dir, worldUp);
    if (side.lengthSq() < 1e-10) {
      side.setFromMatrixColumn(camera.matrixWorld, 0);
    }
    side.normalize();
    const move = new THREE.Vector3()
      .addScaledVector(dir, forward)
      .addScaledVector(side, right)
      .addScaledVector(worldUp, up)
      .normalize();
    const distance = Math.max(camera.position.distanceTo(controls.target), 1e-3);
    const speed = distance * BASE_SPEED * navigation.speed * (this.sprint ? SPRINT : 1);
    move.multiplyScalar(speed * dt);
    camera.position.add(move);
    controls.target.add(move);
    this.host.requestRender();
    return true;
  }

  // ---- aiming --------------------------------------------------------------------

  private worldUp(): THREE.Vector3 {
    const controls = this.host.controls;
    if (!controls.worldUp) {
      controls.worldUp = nearestAxis(this.host.camera.up);
    }
    return controls.worldUp.clone().normalize();
  }

  /** Turns the view by a pointer movement in pixels (right/down positive). */
  private aim(dx: number, dy: number): void {
    const { camera, controls } = this.host;
    const up = this.worldUp();
    const distance = Math.max(camera.position.distanceTo(controls.target), 1e-3);
    const radians = LOOK_RADIANS_PER_PX * navigation.lookSensitivity;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    dir.applyAxisAngle(up, -dx * radians);
    const side = new THREE.Vector3().crossVectors(dir, up);
    if (side.lengthSq() > 1e-10) {
      const pitched = dir.clone().applyAxisAngle(side.normalize(), -dy * radians);
      const polar = pitched.angleTo(up);
      if (polar > MIN_POLAR && polar < Math.PI - MIN_POLAR) {
        dir.copy(pitched);
      }
    }
    camera.up.copy(up);
    controls.target.copy(camera.position).addScaledVector(dir, distance);
    camera.lookAt(controls.target);
    this.host.requestRender();
  }

  private onPointerDown(event: PointerEvent): void {
    if (
      !this.flying ||
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      event.target !== this.host.renderer.domElement
    ) {
      return;
    }
    if (this.aiming) {
      event.stopPropagation();
      event.preventDefault();
      this.startLook(event.pointerId);
    } else {
      this.trackballPointer = event.pointerId;
    }
  }

  private startLook(pointerId: number): void {
    this.stopMomentum();
    this.lookPointer = pointerId;
    try {
      this.host.renderer.domElement.setPointerCapture(pointerId);
    } catch {
      // A synthetic or already released pointer: window events still arrive.
    }
  }

  /** A movement key pressed mid-orbit: end the trackball's drag, aim instead. */
  private takeOverTrackballDrag(): void {
    const pointerId = this.trackballPointer;
    if (pointerId === null) {
      return;
    }
    this.trackballPointer = null;
    this.dispatchingSynthetic = true;
    try {
      this.host.renderer.domElement.ownerDocument.dispatchEvent(
        new PointerEvent('pointerup', { pointerId, button: 0, bubbles: true })
      );
    } finally {
      this.dispatchingSynthetic = false;
    }
    this.startLook(pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId === this.lookPointer) {
      this.aim(event.movementX, event.movementY);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.dispatchingSynthetic) {
      return;
    }
    if (event.pointerId === this.trackballPointer) {
      this.trackballPointer = null;
    }
    // Aiming lasts until the button is released, even if the keys were let
    // go first: switching to orbiting mid-drag would swing the view.
    if (event.pointerId === this.lookPointer) {
      this.lookPointer = null;
      try {
        this.host.renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        // Not captured.
      }
    }
  }

  /** Ends trackball damping, so it does not keep turning under flight. */
  private stopMomentum(): void {
    const c = this.host.controls;
    if (typeof c._lastAngle === 'number') {
      c._lastAngle = 0;
    }
    if (c._movePrev && c._moveCurr) {
      c._movePrev.copy(c._moveCurr);
    }
    if (c._zoomStart && c._zoomEnd) {
      c._zoomStart.copy(c._zoomEnd);
    }
    if (c._panStart && c._panEnd) {
      c._panStart.copy(c._panEnd);
    }
  }

  // ---- trackpad --------------------------------------------------------------------

  private onWheel(event: WheelEvent): void {
    const type = this.host.controlType;
    if (
      !navigation.trackpad ||
      (type !== 'fly' && type !== 'legacy-trackball') ||
      event.target !== this.host.renderer.domElement
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    this.stopMomentum();
    if (event.ctrlKey) {
      // Pinch (browsers report it as Ctrl+wheel).
      this.zoom(dy);
    } else if (event.shiftKey) {
      this.pan(-dx, -dy);
    } else if (this.aiming) {
      this.aim(-dx, -dy);
    } else {
      this.rotate(-dx, -dy);
    }
    this.host.requestRender();
  }

  private zoom(delta: number): void {
    const { camera, controls } = this.host;
    const eye = camera.position.clone().sub(controls.target);
    eye.multiplyScalar(Math.exp(delta * 0.01));
    if (eye.length() < 1e-4) {
      eye.setLength(1e-4);
    }
    camera.position.copy(controls.target).add(eye);
  }

  /** Moves the scene with the fingers, `gx`/`gy` in pixels (down positive). */
  private pan(gx: number, gy: number): void {
    const { camera, controls } = this.host;
    const height = this.host.renderer.domElement.clientHeight || 1;
    const distance = camera.position.distanceTo(controls.target);
    const perPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const offset = right.multiplyScalar(-gx * perPixel).addScaledVector(up, gy * perPixel);
    camera.position.add(offset);
    controls.target.add(offset);
  }

  /** TrackballControls' rotation for a drag of `gx`/`gy` pixels (down positive). */
  private rotate(gx: number, gy: number): void {
    const { camera, controls } = this.host;
    const halfWidth = (this.host.renderer.domElement.clientWidth || 2) / 2;
    const eye = camera.position.clone().sub(controls.target);
    const eyeDirection = eye.clone().normalize();
    const objectUp = camera.up.clone().normalize();
    const sideways = new THREE.Vector3().crossVectors(objectUp, eyeDirection).normalize();
    objectUp.setLength(-gy / halfWidth);
    sideways.setLength(gx / halfWidth);
    const moveDirection = objectUp.add(sideways);
    const angle = moveDirection.length() * (controls.rotateSpeed ?? 5);
    if (!angle) {
      return;
    }
    const axis = new THREE.Vector3().crossVectors(moveDirection, eye).normalize();
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    eye.applyQuaternion(quaternion);
    camera.up.applyQuaternion(quaternion);
    camera.position.copy(controls.target).add(eye);
    camera.lookAt(controls.target);
  }
}
