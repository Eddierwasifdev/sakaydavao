import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addRoute = mutation({
  args: {
    routeId: v.string(),
    name: v.string(),
    shortName: v.optional(v.string()),
    coordinates: v.array(v.array(v.number())),
    landmarks: v.array(v.string()),
    color: v.string(),
    routeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lngs = args.coordinates.map((c) => c[0]);
    const lats = args.coordinates.map((c) => c[1]);

    await ctx.db.insert("jeepneyRoutes", {
      routeId: args.routeId,
      name: args.name,
      shortName: args.shortName,
      geometry: {
        type: "LineString",
        coordinates: args.coordinates,
      },
      color: args.color,
      landmarks: args.landmarks,
      routeType: args.routeType || "standard",
      bbox: {
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
      },
      createdAt: Date.now(),
    });
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("jeepneyRoutes").collect();
  },
});

export const findByRouteId = query({
  args: { routeId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jeepneyRoutes")
      .filter((q) => q.eq(q.field("routeId"), args.routeId))
      .first();
  },
});

export const update = mutation({
  args: {
    id: v.id("jeepneyRoutes"),
    geometry: v.object({
      type: v.literal("LineString"),
      coordinates: v.array(v.array(v.number())),
    }),
    color: v.string(),
    landmarks: v.array(v.string()),
    routeType: v.optional(v.string()),
    bbox: v.object({
      minLng: v.number(),
      maxLng: v.number(),
      minLat: v.number(),
      maxLat: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      geometry: args.geometry,
      color: args.color,
      landmarks: args.landmarks,
      routeType: args.routeType,
      bbox: args.bbox,
    });
  },
});
