// src/lib/routeFinder.ts
import * as turf from "@turf/turf";

export type Coordinate = [number, number]; // [lng, lat] - ALWAYS this order!

export interface Route {
  _id?: string;
  routeId: string;
  name: string;
  shortName?: string;
  coordinates: Coordinate[]; // [lng, lat]
  landmarks: string[];
  color: string;
  routeType?: string;
}

export interface RouteSuggestion {
  type: "direct" | "transfer" | "walk-to-route";
  route?: Route;
  walkToBoard?: {
    distance: number;
    coordinates: Coordinate;
    instructions: string;
  };
  walkFromAlight?: {
    distance: number;
    coordinates: Coordinate;
  };
  // OSRM walking directions (geometry + steps)
  walkToDirections?: {
    geometry: [number, number][]; // [lng, lat][]
    steps: import("./routingService").RouteStep[];
    duration: number;
    distance: number;
  } | null;
  walkFromDirections?: {
    geometry: [number, number][]; // [lng, lat][]
    steps: import("./routingService").RouteStep[];
    duration: number;
    distance: number;
  } | null;
  legs?: Array<{
    route: Route;
    action: string;
  }>;
  transferLocation?: string;
  estimatedFare: number;
  estimatedTime: number;
  estimatedTotalFare?: number;
  suggestion?: string;
  walkingDistance?: number;
}

export async function findBestJeepneyRoute(
  userLocation: Coordinate, // [lng, lat]
  destination: Coordinate, // [lng, lat]
  allRoutes: Route[],
): Promise<RouteSuggestion> {
  console.log("🔍 findBestJeepneyRoute called:");
  console.log("  userLocation:", userLocation);
  console.log("  destination:", destination);
  console.log("  routes count:", allRoutes.length);

  const userPoint = turf.point(userLocation);
  const destPoint = turf.point(destination);

  // Find accessible routes (800m walking tolerance - jeepney stops are not fixed)
  const accessibleRoutes = allRoutes.filter((route) => {
    const routeLine = turf.lineString(route.coordinates);
    const distance = turf.pointToLineDistance(userPoint, routeLine, {
      units: "meters",
    });
    console.log(
      `  Route "${route.name}" distance from user: ${distance.toFixed(0)}m`,
    );
    return distance <= 800;
  });

  console.log(
    "  Accessible routes:",
    accessibleRoutes.map((r) => r.name),
  );

  // Find routes near destination (1000m tolerance)
  const destinationRoutes = allRoutes.filter((route) => {
    const routeLine = turf.lineString(route.coordinates);
    const distance = turf.pointToLineDistance(destPoint, routeLine, {
      units: "meters",
    });
    return distance <= 1000;
  });

  console.log(
    "  Destination routes:",
    destinationRoutes.map((r) => r.name),
  );

  // Check for direct route
  const directRoute = accessibleRoutes.find((route) =>
    destinationRoutes.some((r) => r.routeId === route.routeId),
  );

  if (directRoute) {
    console.log("✅ Direct route found:", directRoute.name);
    const routeLine = turf.lineString(directRoute.coordinates);
    const snapped = turf.nearestPointOnLine(routeLine, userPoint, {
      units: "meters",
    });
    const walkDistance = turf.distance(userPoint, snapped, { units: "meters" });

    const destSnapped = turf.nearestPointOnLine(routeLine, destPoint, {
      units: "meters",
    });
    const walkFromDistance = turf.distance(destSnapped, destPoint, {
      units: "meters",
    });

    return {
      type: "direct",
      route: directRoute,
      walkToBoard: {
        distance: walkDistance,
        coordinates: snapped.geometry.coordinates as Coordinate,
        instructions: `Walk ${Math.round(walkDistance)}m to board ${directRoute.name}`,
      },
      walkFromAlight: {
        distance: walkFromDistance,
        coordinates: destSnapped.geometry.coordinates as Coordinate,
      },
      estimatedFare: estimateFare(directRoute),
      estimatedTime: estimateTravelTime(userLocation, destination, directRoute),
    };
  }

  console.log("❌ No direct route found, checking transfers...");

  // Check for transfer
  if (accessibleRoutes.length > 0 && destinationRoutes.length > 0) {
    return findTransferRoute(accessibleRoutes, destinationRoutes);
  }

  // No route found - suggest walking to nearest
  console.log("❌ No route found, finding nearest...");
  const nearestRoute = findNearestRoute(userLocation, allRoutes);
  return {
    type: "walk-to-route",
    suggestion: `Walk to nearest ${nearestRoute.route.name} stop`,
    walkingDistance: nearestRoute.distance,
    estimatedFare: estimateFare(nearestRoute.route),
    estimatedTime: Math.round((nearestRoute.distance / 80) * 60),
  };
}

function findNearestRoute(
  userLocation: Coordinate,
  allRoutes: Route[],
): { route: Route; distance: number } {
  let nearest = allRoutes[0];
  let minDistance = Infinity;

  allRoutes.forEach((route) => {
    const routeLine = turf.lineString(route.coordinates);
    const userPoint = turf.point(userLocation);
    const distance = turf.pointToLineDistance(userPoint, routeLine, {
      units: "meters",
    });

    if (distance < minDistance) {
      minDistance = distance;
      nearest = route;
    }
  });

  return { route: nearest, distance: minDistance };
}
function findTransferRoute(
  fromRoutes: Route[],
  toRoutes: Route[],
): RouteSuggestion {
  const fromLandmarks = new Set(fromRoutes.flatMap((r) => r.landmarks));
  const commonLandmark = toRoutes
    .flatMap((r) => r.landmarks)
    .find((landmark) => fromLandmarks.has(landmark));

  if (commonLandmark && fromRoutes[0] && toRoutes[0]) {
    const totalFare = estimateFare(fromRoutes[0]) + estimateFare(toRoutes[0]);

    return {
      type: "transfer",
      legs: [
        {
          route: fromRoutes[0],
          action: `Take ${fromRoutes[0].name} to ${commonLandmark}`,
        },
        {
          route: toRoutes[0],
          action: `Transfer to ${toRoutes[0].name}`,
        },
      ],
      transferLocation: commonLandmark,
      estimatedTotalFare: totalFare, // ✅ Use estimatedTotalFare
      estimatedFare: totalFare, // ✅ Also set estimatedFare for consistency
      estimatedTime: 45,
    };
  }

  return {
    type: "walk-to-route",
    suggestion: "No direct route found. Try walking to a major landmark.",
    estimatedFare: 0,
    estimatedTime: 0,
  };
}

function estimateFare(route: Route): number {
  if (route.routeType === "long-distance") {
    return 20;
  }
  return 12;
}

function estimateTravelTime(
  origin: Coordinate,
  destination: Coordinate,
  _route: Route,
): number {
  const distance = turf.distance(turf.point(origin), turf.point(destination), {
    units: "kilometers",
  });
  const travelTime = (distance / 25) * 60 + 5;
  return Math.round(travelTime);
}

export async function geocodeAddress(query: string): Promise<Coordinate> {
  console.log(`🌍 Geocoding: "${query}"`);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query + ", Davao City",
    )}&limit=1`,
    { headers: { "User-Agent": "davao-commute-app/1.0" } },
  );
  const data = await res.json();

  console.log("  Raw result:", data);

  if (data[0]) {
    // Nominatim returns {lat, lon} - convert to [lng, lat]
    const result: Coordinate = [
      parseFloat(data[0].lon),
      parseFloat(data[0].lat),
    ];
    console.log("  Converted to [lng, lat]:", result);
    return result;
  }
  throw new Error(`Location "${query}" not found`);
}
