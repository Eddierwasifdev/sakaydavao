// convex/syncRoutes.ts
import { internalAction } from "./_generated/server";

// Import JSON files
import route4 from "../src/data/routes/route-4.json";
import routeBunawan from "../src/data/routes/route-bunawan-buhangin.json";

export const syncAllRoutes = internalAction({
  args: {},
  handler: async (ctx) => {
    const routes = [route4, routeBunawan];

    for (const routeData of routes) {
      const feature = routeData.features[0];
      const props = feature.properties;
      const coords = feature.geometry.coordinates;

      const lngs = coords.map((c: number[]) => c[0]);
      const lats = coords.map((c: number[]) => c[1]);

      // Check if route exists using internal query
      const existing = await ctx.runQuery(
        "jeepneyRoutes:findByRouteId" as any,
        { routeId: props.routeId },
      );

      if (existing) {
        // Update existing route
        await ctx.runMutation("jeepneyRoutes:update" as any, {
          id: existing._id,
          geometry: feature.geometry,
          color: props.color,
          landmarks: props.landmarks,
          routeType: props.routeType,
          bbox: {
            minLng: Math.min(...lngs),
            maxLng: Math.max(...lngs),
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
          },
        });
      } else {
        // Insert new route
        await ctx.runMutation("jeepneyRoutes:addRoute" as any, {
          routeId: props.routeId,
          name: props.name,
          shortName: props.shortName,
          coordinates: coords,
          landmarks: props.landmarks,
          color: props.color,
          routeType: props.routeType,
        });
      }
    }

    return { success: true, count: routes.length };
  },
});
