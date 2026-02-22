// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  jeepneyRoutes: defineTable({
    routeId: v.string(),
    name: v.string(),
    shortName: v.optional(v.string()),
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
    createdAt: v.number(),
  }).index("by_routeId", ["routeId"]), // ✅ This MUST be here
});
