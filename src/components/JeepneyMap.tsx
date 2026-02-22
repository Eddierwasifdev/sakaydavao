// src/components/JeepneyMap.tsx
import { api } from "../../convex/_generated/api.js";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import { useEffect, useRef } from "react";
import L from "leaflet";
import { useQuery } from "convex/react";
import "leaflet/dist/leaflet.css";
import type { RouteSuggestion } from "@/lib/routeFinder";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet default icon in Vite
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom coloured pin maker
function makeIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:32px;height:32px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:${color};
      border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.4);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

const BoardingIcon = makeIcon("#22C55E"); // green
const AlightingIcon = makeIcon("#EF4444"); // red
const UserIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#3B82F6;border:3px solid #fff;
    box-shadow:0 0 0 4px rgba(59,130,246,0.35);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
});

interface JeepneyMapProps {
  userLocation?: [number, number]; // [lng, lat]
  suggestion?: RouteSuggestion | null;
}

export function JeepneyMap({ userLocation, suggestion }: JeepneyMapProps) {
  const routes: any[] = useQuery((api as any).jeepneyRoutes.getAll) ?? [];

  // Leaflet uses [lat, lng]
  const defaultCenter: [number, number] = [7.0731, 125.6128];
  const center: [number, number] = userLocation
    ? [userLocation[1], userLocation[0]] // convert [lng,lat] → [lat,lng]
    : defaultCenter;

  // Build all routes GeoJSON feature collection
  const routesGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      id: r.routeId,
      properties: { name: r.name, color: r.color },
      geometry: {
        type: "LineString",
        coordinates: r.geometry.coordinates, // [lng, lat] — GeoJSON order ✅
      },
    })),
  };

  const routeStyle = (feature: any) => ({
    color: feature?.properties?.color ?? "#3388ff",
    weight: 5,
    opacity: 0.75,
  });

  const onEachRoute = (feature: any, layer: L.Layer) => {
    layer.bindPopup(
      `<div style="font-size:13px;font-weight:600">${feature.properties.name}</div>`,
    );
  };

  // Convert the active suggestion route to [lat,lng][] for Leaflet Polyline
  const activeRouteLatLngs: [number, number][] =
    suggestion?.type === "direct" && suggestion.route
      ? suggestion.route.coordinates.map(([lng, lat]) => [lat, lng])
      : [];

  // Walking to boarding — use OSRM geometry if available, else straight line
  const walkToLatLngs: [number, number][] = (() => {
    if (suggestion?.walkToDirections?.geometry) {
      return suggestion.walkToDirections.geometry.map(([lng, lat]) => [
        lat,
        lng,
      ]);
    }
    if (suggestion?.walkToBoard && userLocation) {
      return [
        [userLocation[1], userLocation[0]],
        [
          suggestion.walkToBoard.coordinates[1],
          suggestion.walkToBoard.coordinates[0],
        ],
      ];
    }
    return [];
  })();

  // Walking from alighting — use OSRM geometry if available
  const walkFromLatLngs: [number, number][] = (() => {
    if (suggestion?.walkFromDirections?.geometry) {
      return suggestion.walkFromDirections.geometry.map(([lng, lat]) => [
        lat,
        lng,
      ]);
    }
    return [];
  })();

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="h-screen w-full"
      style={{ zIndex: 0 }}
    >
      {/* OpenStreetMap tile layer */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* All jeepney routes */}
      {routes.length > 0 && (
        <GeoJSON
          key={routes.map((r) => r.routeId).join(",")}
          data={routesGeoJSON}
          style={routeStyle}
          onEachFeature={onEachRoute}
        />
      )}

      {/* User location marker */}
      {userLocation && (
        <Marker position={[userLocation[1], userLocation[0]]} icon={UserIcon}>
          <Popup>📍 You are here</Popup>
        </Marker>
      )}

      {/* Active suggestion overlays */}
      {suggestion?.type === "direct" && suggestion.route && (
        <>
          {/* Highlighted jeepney route – gold, thicker */}
          <Polyline
            positions={activeRouteLatLngs}
            pathOptions={{
              color: suggestion.route.color ?? "#FFD700",
              weight: 8,
              opacity: 1,
            }}
          />

          {/* Walk to boarding – blue dashed */}
          {walkToLatLngs.length >= 2 && (
            <Polyline
              positions={walkToLatLngs}
              pathOptions={{
                color: "#3B82F6",
                weight: 4,
                opacity: 0.9,
                dashArray: "8 8",
              }}
            />
          )}

          {/* Walk from alighting – blue dashed */}
          {walkFromLatLngs.length >= 2 && (
            <Polyline
              positions={walkFromLatLngs}
              pathOptions={{
                color: "#3B82F6",
                weight: 4,
                opacity: 0.9,
                dashArray: "8 8",
              }}
            />
          )}

          {/* Boarding point marker (green) */}
          {suggestion.walkToBoard && (
            <Marker
              position={[
                suggestion.walkToBoard.coordinates[1],
                suggestion.walkToBoard.coordinates[0],
              ]}
              icon={BoardingIcon}
            >
              <Popup>
                <strong>🚌 Board here</strong>
                <br />
                <span style={{ fontSize: 12 }}>{suggestion.route.name}</span>
              </Popup>
            </Marker>
          )}

          {/* Alighting point marker (red) */}
          {suggestion.walkFromAlight && (
            <Marker
              position={[
                suggestion.walkFromAlight.coordinates[1],
                suggestion.walkFromAlight.coordinates[0],
              ]}
              icon={AlightingIcon}
            >
              <Popup>
                <strong>📍 Alight here</strong>
              </Popup>
            </Marker>
          )}

          {/* Auto-fit map bounds to the whole journey */}
          <FitRouteBounds suggestion={suggestion} userLocation={userLocation} />
        </>
      )}
    </MapContainer>
  );
}

// ── FitRouteBounds: auto-zoom to show the entire journey ────────────────────
function FitRouteBounds({
  suggestion,
  userLocation,
}: {
  suggestion: RouteSuggestion;
  userLocation?: [number, number];
}) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current) return;
    if (!suggestion.route?.coordinates?.length) return;

    const latlngs: L.LatLngTuple[] = [
      ...(userLocation
        ? [[userLocation[1], userLocation[0]] as L.LatLngTuple]
        : []),
      ...suggestion.route.coordinates.map(
        ([lng, lat]) => [lat, lng] as L.LatLngTuple,
      ),
      ...(suggestion.walkFromAlight
        ? [
            [
              suggestion.walkFromAlight.coordinates[1],
              suggestion.walkFromAlight.coordinates[0],
            ] as L.LatLngTuple,
          ]
        : []),
    ];

    if (latlngs.length > 0) {
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      didFit.current = true;
    }
  }, [suggestion, userLocation, map]);

  return null;
}
