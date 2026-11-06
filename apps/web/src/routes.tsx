/**
 * routes.tsx
 *
 * React Router route tree for KinetiCare web app.
 */

import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const App = lazy(() => import('./App').then((m) => ({ default: m.default })));
const LiveSession = lazy(() =>
  import('./components/live-session/LiveSession').then((m) => ({
    default: m.LiveSession,
  }))
);

export default [
  {
    path: '/',
    Component: App,
    children: [
      {
        index: true,
        Component: LiveSession,
      },
      {
        path: 'live',
        Component: LiveSession,
      },
    ],
  },
] satisfies RouteObject[];
