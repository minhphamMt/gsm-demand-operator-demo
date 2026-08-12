import { useEffect, useState } from 'react';
import type { LngLat } from '../geo/locations';
import { HAS_MAPBOX_TOKEN } from '../geo/mapboxConfig';
import { fetchDirections } from './directions';
import type { DirectionsRoute } from './directions';

export type DirectionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; route: DirectionsRoute; origin: LngLat; destination: LngLat }
  | { status: 'error'; message: string };

function sameLngLat([leftLng, leftLat]: LngLat, [rightLng, rightLat]: LngLat): boolean {
  return leftLng === rightLng && leftLat === rightLat;
}

/**
 * Fetches a route, but only while `enabled` — so no API call happens until the user
 * actually opens the navigation screen.
 *
 * The AbortController is mandatory rather than optional: the app runs under
 * `<StrictMode>`, and React 19 double-invokes effects in development. Without it every
 * navigation costs two requests and logs a state-update-after-unmount warning.
 *
 * The dependency array uses primitives, not the coordinate objects — passing object
 * references would re-fire the effect on every render and loop indefinitely.
 */
export function useDirections(from: LngLat, to: LngLat, enabled: boolean): DirectionsState {
  const [state, setState] = useState<DirectionsState>({ status: 'idle' });
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;

  useEffect(() => {
    if (!enabled || !HAS_MAPBOX_TOKEN) {
      setState({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });

    fetchDirections([fromLng, fromLat], [toLng, toLat], controller.signal)
      .then((route) => {
        if (!active) return;
        console.log('[directions] API request successful, route:', route);
        setState({
          status: 'ready',
          route,
          origin: [fromLng, fromLat],
          destination: [toLng, toLat],
        });
      })
      .catch((err: Error) => {
        if (!active || err.name === 'AbortError') return;
        console.error('[directions] API request failed with error:', err);
        console.warn('[directions] route request failed; no route will be drawn:', err.message);
        setState({ status: 'error', message: err.message });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fromLng, fromLat, toLng, toLat, enabled]);

  // Effects run after paint. If the caller has already changed the destination,
  // expose loading synchronously instead of briefly reusing the previous route.
  // The saved coordinates also bind a successful response to the request that made it.
  if (
    state.status === 'ready' &&
    (!enabled || !sameLngLat(state.origin, [fromLng, fromLat]) || !sameLngLat(state.destination, [toLng, toLat]))
  ) {
    return { status: enabled ? 'loading' : 'idle' };
  }

  return state;
}
