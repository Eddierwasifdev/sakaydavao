export interface RouteProperties {
  routeId: string;
  name: string;
  shortName?: string;
  color: string;
  landmarks: string[];
  routeType?: "standard" | "long-distance" | "express";
}

export interface RouteFeature {
  type: "Feature";
  id: string;
  properties: RouteProperties;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export interface RouteCollection {
  type: "FeatureCollection";
  features: RouteFeature[];
}
