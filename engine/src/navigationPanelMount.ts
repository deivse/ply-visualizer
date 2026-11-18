import { mount, unmount } from 'svelte';
import NavigationPanel from './components/NavigationPanel.svelte';
import { toggleNavigationPanel, navigation } from './state/navigation.svelte';
import type { ViewerLifetime } from './utils/viewerLifetime';

/** Floating scene navigation panel over the viewport (every host gets it). */
export function mountNavigationPanel(lifetime: ViewerLifetime, host: unknown): void {
  const target = document.createElement('div');
  target.id = 'navigation-panel-mount';
  document.body.appendChild(target);
  const component = mount(NavigationPanel, { target, props: { host } });
  // For hosts (desktop View menu) and tests.
  (window as any).plyNavigation = {
    toggle: toggleNavigationPanel,
    get visible() {
      return !navigation.hidden;
    },
  };
  lifetime.add(() => {
    void unmount(component);
    target.remove();
  });
}
