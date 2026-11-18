import { viewerState } from './state/viewer.svelte';
import { saveControlScheme } from './state/navigation.svelte';

export type ControlType = 'trackball' | 'orbit' | 'legacy-trackball' | 'arcball' | 'fly';

export interface ControlSchemeHost {
  controlType: ControlType;
  initializeControls(): void;
  updateControlStatus(): void;
  showStatus(message: string): void;
}

/** Switches scheme and remembers it for the next session. */
function switchTo(host: ControlSchemeHost, type: ControlType, message: string): void {
  if (host.controlType === type) {
    return;
  }
  host.controlType = type;
  saveControlScheme(type);
  host.initializeControls();
  host.updateControlStatus();
  host.showStatus(message);
}

export function switchToTrackballControls(host: ControlSchemeHost): void {
  switchTo(host, 'trackball', 'Switched to Trackball controls');
}

export function switchToOrbitControls(host: ControlSchemeHost): void {
  switchTo(host, 'orbit', 'Switched to Orbit controls');
}

export function switchToLegacyTrackballControls(host: ControlSchemeHost): void {
  switchTo(host, 'legacy-trackball', 'Switched to Legacy Trackball controls (delta-based)');
}

export function switchToArcballControls(host: ControlSchemeHost): void {
  switchTo(host, 'arcball', 'Switched to Arcball controls');
}

export function switchToFlyControls(host: ControlSchemeHost): void {
  switchTo(
    host,
    'fly',
    'Switched to Trackball + Fly: hold W/A/S/D (Q/E down/up, Shift faster) and drag to aim'
  );
}

export function updateControlStatus(host: ControlSchemeHost): void {
  viewerState.controlScheme = host.controlType;
  const status = host.controlType.toUpperCase();
  console.log(`📊 Camera Controls: ${status}`);

  // Update UI if there's a status display
  const statusElement = document.getElementById('camera-control-status');
  if (statusElement) {
    statusElement.textContent = status;
  }

  // Update button active states
  const controlButtons = [
    { id: 'trackball-controls', type: 'trackball' },
    { id: 'orbit-controls', type: 'orbit' },
    { id: 'legacy-trackball-controls', type: 'legacy-trackball' },
    { id: 'arcball-controls', type: 'arcball' },
    { id: 'fly-controls', type: 'fly' },
  ];

  controlButtons.forEach(button => {
    const btn = document.getElementById(button.id);
    if (btn) {
      if (button.type === host.controlType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
}
