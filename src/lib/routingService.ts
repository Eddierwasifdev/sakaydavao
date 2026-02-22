// src/lib/routingService.ts
import polyline from "@mapbox/polyline";

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  name: string;
  mode: "walking" | "jeepney";
}

export interface WalkingRoute {
  geometry: [number, number][]; // [lng, lat]
  distance: number; // meters
  duration: number; // seconds
  steps: RouteStep[];
}

/**
 * Get walking directions using OSRM (free, no API key required)
 */
export async function getWalkingDirections(
  start: [number, number], // [lng, lat]
  end: [number, number], // [lng, lat]
): Promise<WalkingRoute> {
  try {
    // Use public OSRM demo server
    const response = await fetch(
      `http://router.project-osrm.org/route/v1/foot/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=polyline&steps=true`,
    );

    if (!response.ok) {
      throw new Error("OSRM routing failed");
    }

    const data = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error("No route found");
    }

    const route = data.routes[0];

    // Decode the @mapbox/polyline encoded geometry → [[lat, lng], ...]
    // then convert each pair to [lng, lat] to keep consistent with the rest of the app
    const decoded: [number, number][] = polyline
      .decode(route.geometry)
      .map(([lat, lng]: [number, number]) => [lng, lat]);

    const steps: RouteStep[] = route.legs[0].steps.map((step: any) => ({
      instruction: step.maneuver?.instruction ?? generateInstruction(step),
      distance: step.distance,
      duration: step.duration,
      name: step.name || "",
      mode: "walking" as const,
    }));

    return {
      geometry: decoded,
      distance: route.distance,
      duration: route.duration,
      steps,
    };
  } catch (error) {
    console.error("Walking route error:", error);
    throw error;
  }
}

/** Best-effort instruction string when OSRM doesn't return one */
function generateInstruction(step: any): string {
  const type: string = step.maneuver?.type ?? "turn";
  const modifier: string = step.maneuver?.modifier ?? "";
  const name: string = step.name ? ` onto ${step.name}` : "";

  switch (type) {
    case "depart":
      return `Head ${modifier}${name}`;
    case "arrive":
      return "Arrive at destination";
    case "turn":
      return `Turn ${modifier}${name}`;
    case "continue":
      return `Continue${name}`;
    case "new name":
      return `Continue${name}`;
    case "merge":
      return `Merge${name}`;
    case "fork":
      return `Keep ${modifier} at fork${name}`;
    case "roundabout":
      return `Enter roundabout${name}`;
    default:
      return `Proceed${name}`;
  }
}

/** Format seconds into a human-readable string */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Format metres into a human-readable string */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Returns a direction arrow / emoji for a maneuver type */
export function getManeuverIcon(step: RouteStep): string {
  const lower = step.instruction.toLowerCase();
  if (lower.startsWith("arrive")) return "📍";
  if (lower.startsWith("head") || lower.startsWith("depart")) return "🚶";
  if (lower.includes("left")) return "↰";
  if (lower.includes("right")) return "↱";
  if (lower.includes("u-turn")) return "↩";
  if (lower.includes("roundabout")) return "🔄";
  if (lower.includes("fork")) return "⑂";
  return "⬆";
}
