import { useEffect } from 'react';
import { useNavigationContainerRef } from 'expo-router';

import { addBreadcrumb, isMonitoringEnabled } from './monitoring';

/**
 * Record every screen change as a Sentry breadcrumb.
 *
 * The iOS SDK emits native `ui.lifecycle` breadcrumbs that happen to name the
 * screen (an `RNSScreen` title), so iOS events arrive with a usable trail.
 * Android events do not get that, and arrive with nothing but app-lifecycle and
 * network entries — a crash there currently cannot be traced to a screen at
 * all. These JS-side breadcrumbs close that gap on both platforms.
 *
 * Route *names* only: params can hold note ids, user ids and free text, and
 * monitoring is configured never to send user content.
 */
export function useNavigationBreadcrumbs(): void {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    if (!isMonitoringEnabled() || !navigationRef) return;

    // `ReactNavigation.RootParamList` is empty in this app, which collapses the
    // return type of getCurrentRoute() to `never`. The value is a real route
    // object at runtime, so read the name through a narrow shape.
    const currentRouteName = (): string | null => {
      const route = navigationRef.getCurrentRoute() as { name?: unknown } | undefined;
      return typeof route?.name === 'string' ? route.name : null;
    };

    let previous: string | null = currentRouteName();

    const unsubscribe = navigationRef.addListener('state', () => {
      const current = currentRouteName();
      if (current === previous) return;
      addBreadcrumb({
        category: 'navigation',
        type: 'navigation',
        level: 'info',
        message: `${previous ?? '(none)'} → ${current ?? '(none)'}`,
        data: { from: previous, to: current },
      });
      previous = current;
    });

    return unsubscribe;
  }, [navigationRef]);
}
