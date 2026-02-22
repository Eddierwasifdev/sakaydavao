// src/lib/directions.ts
// Calls the Mapbox Directions API (walking profile) to get turn-by-turn steps
// and the exact route geometry as a GeoJSON LineString.

export interface DirectionStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  maneuver: {
    type: string;
    modifier?: string;
  };
}

export interface DirectionsResult {
  geometry: GeoJSON.LineString;
  steps: DirectionStep[];
  distance: number; // total meters
  duration: number; // total seconds
}

export async function fetchWalkingDirections(
  from: [number, number], // [lng, lat]
  to: [number, number], // [lng, lat]
  mapboxToken: string,
): Promise<DirectionsResult | null> {
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/walking/` +
      `${from[0]},${from[1]};${to[0]},${to[1]}` +
      `?steps=true&geometries=geojson&overview=full` +
      `&access_token=${mapboxToken}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const leg = route.legs[0];

    const steps: DirectionStep[] = (leg.steps || []).map((s: any) => ({
      instruction: s.maneuver?.instruction || "",
      distance: s.distance || 0,
      duration: s.duration || 0,
      maneuver: {
        type: s.maneuver?.type || "turn",
        modifier: s.maneuver?.modifier,
      },
    }));

    return {
      geometry: route.geometry,
      steps,
      distance: route.distance,
      duration: route.duration,
    };
  } catch {
    return null;
  }
}

/** Get the maneuver icon character for a given step */
export function getManeuverIcon(step: DirectionStep): string {
  const { type, modifier } = step.maneuver;
  if (type === "arrive") return "📍";
  if (type === "depart") return "🚶";
  if (type === "turn") {
    if (
      modifier === "left" ||
      modifier === "sharp left" ||
      modifier === "slight left"
    )
      return "↰";
    if (
      modifier === "right" ||
      modifier === "sharp right" ||
      modifier === "slight right"
    )
      return "↱";
    if (modifier === "uturn") return "↩";
  }
  if (type === "continue" || type === "new name") return "⬆";
  if (type === "roundabout" || type === "rotary") return "🔄";
  if (type === "fork") return "⑂";
  return "⬆";
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}
