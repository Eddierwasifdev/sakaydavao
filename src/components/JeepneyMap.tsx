import { api } from "../../convex/_generated/api.js";
import {
  Map,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MapRoute,
  MapControls,
  useMap,
} from "@/components/ui/map";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import type { RouteSuggestion } from "@/lib/routeFinder";
import type { MapDestination } from "@/App";

interface JeepneyMapProps {
  userLocation?: [number, number]; // [lng, lat]
  suggestion?: RouteSuggestion | null;
  onMapClick?: (destination: MapDestination) => void;
  mapDestination?: MapDestination | null;
}

// Custom colored pin icon
function PinIcon({ color }: { color: string }) {
  return (
    <div
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
        background: color,
        border: "3px solid #fff",
        boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      }}
    />
  );
}

// User location icon (blue circle with pulsing effect)
function UserLocationIcon() {
  return (
    <div className="relative">
      <div
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: "#3B82F6",
          border: "3px solid #fff",
          boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.35)",
        }}
      />
    </div>
  );
}

// Destination pin icon with drop animation
function DestinationPinIcon() {
  return (
    <div className="flex flex-col items-center animate-bounce-in">
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50% 50% 50% 0",
          transform: "rotate(-45deg)",
          background: "linear-gradient(135deg, #EF4444, #DC2626)",
          border: "3px solid #fff",
          boxShadow: "0 3px 12px rgba(239, 68, 68, 0.5)",
        }}
      />
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "rgba(0,0,0,0.2)",
          marginTop: "2px",
          filter: "blur(2px)",
        }}
      />
    </div>
  );
}

/**
 * Extract the segment of a route between two points (boarding → alighting).
 * Finds the nearest coordinate indices on the route for both points,
 * then returns only the coordinates between them.
 */
function extractRideSegment(
  routeCoords: [number, number][],
  boardCoords: [number, number],
  alightCoords: [number, number],
): [number, number][] {
  if (routeCoords.length < 2) return routeCoords;

  // Find the index of the nearest point on the route for boarding and alighting
  let boardIdx = 0;
  let alightIdx = 0;
  let minBoardDist = Infinity;
  let minAlightDist = Infinity;

  for (let i = 0; i < routeCoords.length; i++) {
    const coord = routeCoords[i];
    const boardDist =
      (coord[0] - boardCoords[0]) ** 2 + (coord[1] - boardCoords[1]) ** 2;
    const alightDist =
      (coord[0] - alightCoords[0]) ** 2 + (coord[1] - alightCoords[1]) ** 2;

    if (boardDist < minBoardDist) {
      minBoardDist = boardDist;
      boardIdx = i;
    }
    if (alightDist < minAlightDist) {
      minAlightDist = alightDist;
      alightIdx = i;
    }
  }

  // Extract the segment — handle wrap-around for circular routes
  if (boardIdx <= alightIdx) {
    return routeCoords.slice(boardIdx, alightIdx + 1);
  } else {
    // Route wraps around (e.g. boarding is past alighting in coordinate array)
    // Take from boarding to end, then from start to alighting
    return [
      ...routeCoords.slice(boardIdx),
      ...routeCoords.slice(0, alightIdx + 1),
    ];
  }
}

export function JeepneyMap({
  userLocation,
  suggestion,
  onMapClick,
  mapDestination,
}: JeepneyMapProps) {
  // We still query routes but we don't render them on the map anymore
  useQuery((api as any).jeepneyRoutes.getAll);

  // MapLibre uses [lng, lat] - same as GeoJSON
  const defaultCenter: [number, number] = [125.6128, 7.0731]; // Davao City

  return (
    <Map
      center={userLocation ?? defaultCenter}
      zoom={13}
      className="h-screen w-full"
    >
      <MapContent
        userLocation={userLocation}
        suggestion={suggestion}
        onMapClick={onMapClick}
        mapDestination={mapDestination}
      />
    </Map>
  );
}

// Reverse geocode coordinates to place name using Nominatim
async function reverseGeocode(lng: number, lat: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lon=${lng}&lat=${lat}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "SakayDavao/1.0 (davao-commute-app)",
          "Accept-Language": "en",
        },
      },
    );
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = await res.json();

    const addr = data.address ?? {};
    // Build a readable short name
    const name =
      addr.amenity ??
      addr.shop ??
      addr.tourism ??
      addr.building ??
      addr.road ??
      addr.neighbourhood ??
      addr.suburb ??
      data.name ??
      "";

    const district =
      addr.suburb ?? addr.neighbourhood ?? addr.city_district ?? "";

    if (name && district) return `${name}, ${district}`;
    if (name) return name;
    if (data.display_name) {
      // Take first 2 parts of the display name
      return data.display_name.split(",").slice(0, 2).join(",").trim();
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// Inner component that only renders when map is loaded
function MapContent({
  userLocation,
  suggestion,
  onMapClick,
  mapDestination,
}: {
  userLocation?: [number, number];
  suggestion?: RouteSuggestion | null;
  onMapClick?: (destination: MapDestination) => void;
  mapDestination?: MapDestination | null;
}) {
  const { map, isLoaded } = useMap();
  const geocodingRef = useRef(false);

  // Extract only the ride segment (boarding → alighting) from the full route
  const rideSegment = useMemo(() => {
    if (
      suggestion?.type === "direct" &&
      suggestion.route &&
      suggestion.walkToBoard &&
      suggestion.walkFromAlight
    ) {
      return extractRideSegment(
        suggestion.route.coordinates,
        suggestion.walkToBoard.coordinates,
        suggestion.walkFromAlight.coordinates,
      );
    }
    return null;
  }, [suggestion]);

  // Set up map click handler for setting destination
  const handleMapClick = useCallback(
    async (e: { lngLat: { lng: number; lat: number } }) => {
      if (!onMapClick || geocodingRef.current) return;

      const { lng, lat } = e.lngLat;
      geocodingRef.current = true;

      // Show immediately with coordinates, then update with place name
      onMapClick({
        coordinates: [lng, lat],
        placeName: "Loading...",
      });

      const placeName = await reverseGeocode(lng, lat);

      onMapClick({
        coordinates: [lng, lat],
        placeName,
      });

      geocodingRef.current = false;
    },
    [onMapClick],
  );

  // Register/unregister click handler
  useEffect(() => {
    if (!isLoaded || !map || !onMapClick) return;

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [isLoaded, map, handleMapClick, onMapClick]);

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      {/* User location marker */}
      {userLocation && (
        <MapMarker longitude={userLocation[0]} latitude={userLocation[1]}>
          <MarkerContent>
            <UserLocationIcon />
          </MarkerContent>
          <MarkerPopup>📍 You are here</MarkerPopup>
        </MapMarker>
      )}

      {/* Clicked destination marker (before finding a route) */}
      {mapDestination && !suggestion && (
        <MapMarker
          longitude={mapDestination.coordinates[0]}
          latitude={mapDestination.coordinates[1]}
        >
          <MarkerContent>
            <DestinationPinIcon />
          </MarkerContent>
          <MarkerPopup>
            <div className="min-w-[140px]">
              <strong className="text-sm">📍 Destination</strong>
              <br />
              <span className="text-xs text-gray-600">
                {mapDestination.placeName}
              </span>
            </div>
          </MarkerPopup>
        </MapMarker>
      )}

      {/* Active suggestion overlays — only show the user's journey */}
      {suggestion?.type === "direct" && suggestion.route && (
        <>
          {/* Only the ride segment (boarding → alighting), NOT the full route */}
          {rideSegment && rideSegment.length >= 2 && (
            <MapRoute
              id="active-route"
              coordinates={rideSegment}
              color={suggestion.route.color ?? "#FFD700"}
              width={6}
              opacity={1}
            />
          )}

          {/* Walk to boarding - blue dashed */}
          {suggestion.walkToDirections?.geometry && (
            <MapRoute
              id="walk-to"
              coordinates={suggestion.walkToDirections.geometry}
              color="#3B82F6"
              width={4}
              opacity={0.9}
              dashArray={[8, 8]}
            />
          )}

          {/* Walk from alighting - blue dashed */}
          {suggestion.walkFromDirections?.geometry && (
            <MapRoute
              id="walk-from"
              coordinates={suggestion.walkFromDirections.geometry}
              color="#3B82F6"
              width={4}
              opacity={0.9}
              dashArray={[8, 8]}
            />
          )}

          {/* Boarding point marker (green) */}
          {suggestion.walkToBoard && (
            <MapMarker
              longitude={suggestion.walkToBoard.coordinates[0]}
              latitude={suggestion.walkToBoard.coordinates[1]}
            >
              <MarkerContent>
                <PinIcon color="#22C55E" />
              </MarkerContent>
              <MarkerPopup>
                <div>
                  <strong>🚌 Board here</strong>
                  <br />
                  <span style={{ fontSize: 12 }}>{suggestion.route.name}</span>
                </div>
              </MarkerPopup>
            </MapMarker>
          )}

          {/* Alighting point marker (red) */}
          {suggestion.walkFromAlight && (
            <MapMarker
              longitude={suggestion.walkFromAlight.coordinates[0]}
              latitude={suggestion.walkFromAlight.coordinates[1]}
            >
              <MarkerContent>
                <PinIcon color="#EF4444" />
              </MarkerContent>
              <MarkerPopup>
                <strong>📍 Alight here</strong>
              </MarkerPopup>
            </MapMarker>
          )}

          {/* Destination marker (when route is found) */}
          {mapDestination && (
            <MapMarker
              longitude={mapDestination.coordinates[0]}
              latitude={mapDestination.coordinates[1]}
            >
              <MarkerContent>
                <DestinationPinIcon />
              </MarkerContent>
              <MarkerPopup>
                <div className="min-w-[140px]">
                  <strong className="text-sm">🏁 Destination</strong>
                  <br />
                  <span className="text-xs text-gray-600">
                    {mapDestination.placeName}
                  </span>
                </div>
              </MarkerPopup>
            </MapMarker>
          )}

          {/* Auto-fit map bounds to the journey */}
          <FitRouteBounds
            rideSegment={rideSegment}
            suggestion={suggestion}
            userLocation={userLocation}
            mapDestination={mapDestination}
          />
        </>
      )}

      {/* Tip overlay when no destination is set */}
      {!mapDestination && !suggestion && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
            <span className="text-base">👆</span>
            Tap anywhere on the map to set your destination
          </div>
        </div>
      )}

      <MapControls showZoom showLocate />
    </>
  );
}

// ── FitRouteBounds: auto-zoom to show the user's journey ────────────────────
function FitRouteBounds({
  rideSegment,
  suggestion,
  userLocation,
  mapDestination,
}: {
  rideSegment: [number, number][] | null;
  suggestion: RouteSuggestion;
  userLocation?: [number, number];
  mapDestination?: MapDestination | null;
}) {
  const { map, isLoaded } = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (!isLoaded || !map || didFit.current) return;

    // Collect all relevant coordinates for bounds
    const allCoords: [number, number][] = [];

    // User location
    if (userLocation) allCoords.push(userLocation);

    // Ride segment (boarding → alighting portion)
    if (rideSegment && rideSegment.length > 0) {
      allCoords.push(...rideSegment);
    }

    // Walking legs
    if (suggestion.walkToDirections?.geometry) {
      allCoords.push(...suggestion.walkToDirections.geometry);
    }
    if (suggestion.walkFromDirections?.geometry) {
      allCoords.push(...suggestion.walkFromDirections.geometry);
    }

    // Destination
    if (mapDestination) {
      allCoords.push(mapDestination.coordinates);
    } else if (suggestion.walkFromAlight) {
      allCoords.push(suggestion.walkFromAlight.coordinates);
    }

    if (allCoords.length > 0) {
      const lngs = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];

      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        maxZoom: 16,
      });
      didFit.current = true;
    }
  }, [suggestion, rideSegment, userLocation, mapDestination, map, isLoaded]);

  return null;
}
