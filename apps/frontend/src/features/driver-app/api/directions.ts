import type { LineString } from 'geojson';
import type { LngLat } from '../geo/locations';
import { MAPBOX_TOKEN } from '../geo/mapboxConfig';

/** Narrow types for just the slice of the Directions response we consume. */
export interface Maneuver {
  type: string;
  /** 'left' | 'right' | 'slight left' | 'straight' | … — used to orient the turn icon. */
  modifier?: string;
  instruction: string;
}

export interface DirectionsStep {
  distance: number;
  duration: number;
  name: string;
  maneuver: Maneuver;
}

export interface DirectionsRoute {
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  geometry: LineString;
  legs: Array<{ steps: DirectionsStep[] }>;
}

const BASE = 'https://api.mapbox.com/directions/v5/mapbox';

function buildUrl(profile: string, from: LngLat, to: LngLat): string {
  // Coordinates are lng,lat — reversing them is the classic first-run bug and puts
  // the route in the Indian Ocean.
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    language: 'vi',
    access_token: MAPBOX_TOKEN,
  });
  return `${BASE}/${profile}/${coords}?${params}`;
}

async function request(profile: string, from: LngLat, to: LngLat, signal: AbortSignal) {
  const url = buildUrl(profile, from, to);
  console.log(`[directions] Fetching Mapbox endpoint (${profile}):`, url);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const err = new Error(`Directions HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch a driving route between two points.
 *
 * Uses `driving-traffic` so the returned duration reflects real Hanoi conditions —
 * that is what keeps the scripted "9 phút" honest. Falls back to plain `driving`
 * if traffic data is unavailable for the pair (422).
 */
export async function fetchDirections(from: LngLat, to: LngLat, signal: AbortSignal): Promise<DirectionsRoute> {
  let data: { routes?: DirectionsRoute[] };
  try {
    data = await request('driving-traffic', from, to, signal);
  } catch (err) {
    if ((err as { status?: number }).status === 422) {
      data = await request('driving', from, to, signal);
    } else {
      throw err;
    }
  }

  const route = data.routes?.[0];
  if (!route) throw new Error('Directions returned no route');
  return route;
}

/**
 * The first meaningful manoeuvre.
 *
 * `steps[0]` is always a `depart` step whose instruction is a useless
 * "Đi về hướng…", so it is skipped.
 */
export function firstTurn(route: DirectionsRoute): DirectionsStep | undefined {
  const steps = route.legs?.[0]?.steps ?? [];
  return steps.find((s) => s.maneuver.type !== 'depart');
}

/** The step after the first meaningful manoeuvre, for the "Sau đó" strip. */
export function followingTurn(route: DirectionsRoute): DirectionsStep | undefined {
  const steps = route.legs?.[0]?.steps ?? [];
  const idx = steps.findIndex((s) => s.maneuver.type !== 'depart');
  if (idx === -1) return undefined;
  return steps.slice(idx + 1).find((s) => s.name);
}
