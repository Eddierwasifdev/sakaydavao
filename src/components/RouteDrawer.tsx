// src/components/RouteDrawer.tsx
import { useState, useEffect, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Navigation, Search, LocateFixed, MapPin } from "lucide-react";
import {
  findBestJeepneyRoute,
  geocodeAddress,
  type RouteSuggestion,
  type Route,
  type Coordinate,
} from "@/lib/routeFinder";
import { getWalkingDirections } from "@/lib/routingService";
import { useQuery, useMutation } from "convex/react";
import { SearchInput, type PlaceResult } from "./SearchInput";
import { api } from "../../convex/_generated/api.js";
import { DAVAO_ROUTES } from "@/data/routes/all-routes";

interface RouteDrawerProps {
  startingPoint: string;
  setStartingPoint: (value: string) => void;
  destination: string;
  setDestination: (value: string) => void;
  onRouteFound: (result: RouteSuggestion) => void;
  userLocation: [number, number] | undefined;
}

export function RouteDrawer({
  startingPoint,
  setStartingPoint,
  destination,
  setDestination,
  onRouteFound,
  userLocation,
}: RouteDrawerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache coordinates picked from autocomplete — avoids an extra geocode call
  const startCoordsRef = useRef<Coordinate | null>(null);
  const destCoordsRef = useRef<Coordinate | null>(null);

  const allRoutesRaw: any[] = useQuery((api as any).jeepneyRoutes.getAll) ?? [];
  const addRoute = useMutation((api as any).jeepneyRoutes.addRoute);

  // Auto-seed routes into Convex if the database is empty
  useEffect(() => {
    if (allRoutesRaw.length === 0) {
      const existingIds = new Set(allRoutesRaw.map((r: any) => r.routeId));
      const toSeed = DAVAO_ROUTES.filter((r) => !existingIds.has(r.routeId));
      toSeed.forEach((route) => {
        addRoute({
          routeId: route.routeId,
          name: route.name,
          shortName: route.shortName,
          coordinates: route.coordinates,
          landmarks: route.landmarks,
          color: route.color,
          routeType: route.routeType,
        }).catch(console.error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRoutesRaw.length]);

  // When user types manually (not from autocomplete), clear cached coords
  const handleStartingPointChange = (val: string) => {
    setStartingPoint(val);
    if (val !== startingPoint) startCoordsRef.current = null;
  };
  const handleDestinationChange = (val: string) => {
    setDestination(val);
    if (val !== destination) destCoordsRef.current = null;
  };

  // When user picks a result from autocomplete, cache its coords
  const handleStartPlaceSelect = (place: PlaceResult) => {
    setStartingPoint(place.shortName);
    startCoordsRef.current = [place.lng, place.lat]; // [lng, lat]
  };
  const handleDestPlaceSelect = (place: PlaceResult) => {
    setDestination(place.shortName);
    destCoordsRef.current = [place.lng, place.lat]; // [lng, lat]
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [
            position.coords.longitude,
            position.coords.latitude,
          ];
          setStartingPoint("My Current Location");
          startCoordsRef.current = coords;
        },
        () => {
          setError(
            "Unable to get your location. Please allow location access.",
          );
        },
      );
    }
  };

  const handleFindRoute = async () => {
    if (!destination.trim()) {
      setError("Please enter a destination");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (allRoutesRaw.length === 0) {
        throw new Error(
          "Routes are still loading. Please wait a moment and try again.",
        );
      }

      // ── Resolve starting coordinates ──────────────────────────────────
      let userCoords: Coordinate;

      if (startCoordsRef.current) {
        // User selected from autocomplete OR used "Current Location" button
        userCoords = startCoordsRef.current;
        console.log("✅ Using selected start coords:", userCoords);
      } else if (
        startingPoint.trim() &&
        startingPoint !== "My Current Location"
      ) {
        // User typed manually — fall back to Nominatim geocode
        console.log("🌍 Geocoding start:", startingPoint);
        userCoords = await geocodeAddress(startingPoint);
        startCoordsRef.current = userCoords;
      } else if (userLocation) {
        // No start typed — use GPS location
        userCoords = [userLocation[0], userLocation[1]];
      } else {
        userCoords = [125.6128, 7.0731]; // Davao City center fallback
      }

      // ── Resolve destination coordinates ───────────────────────────────
      let destCoords: Coordinate;

      if (destCoordsRef.current) {
        destCoords = destCoordsRef.current;
        console.log("✅ Using selected dest coords:", destCoords);
      } else {
        console.log("🌍 Geocoding destination:", destination);
        destCoords = await geocodeAddress(destination);
        destCoordsRef.current = destCoords;
      }

      // ── Map Convex routes → internal Route type ───────────────────────
      const mappedRoutes: Route[] = allRoutesRaw.map((r) => ({
        _id: r._id,
        routeId: r.routeId,
        name: r.name,
        shortName: r.shortName,
        coordinates: r.geometry.coordinates as Coordinate[],
        landmarks: r.landmarks,
        color: r.color,
        routeType: r.routeType,
      }));

      // ── Find best jeepney route ───────────────────────────────────────
      console.log("🗺️ findBestJeepneyRoute:", userCoords, "→", destCoords);
      const result = await findBestJeepneyRoute(
        userCoords,
        destCoords,
        mappedRoutes,
      );
      console.log("✅ Route result:", result.type);

      // ── Fetch OSRM walking directions (free, no API key) ─────────────
      if (result.type === "direct" && result.walkToBoard) {
        const [walkToDir, walkFromDir] = await Promise.allSettled([
          getWalkingDirections(userCoords, result.walkToBoard.coordinates),
          result.walkFromAlight
            ? getWalkingDirections(
                result.walkFromAlight.coordinates,
                destCoords,
              )
            : Promise.resolve(null),
        ]);

        result.walkToDirections =
          walkToDir.status === "fulfilled" && walkToDir.value
            ? {
                geometry: walkToDir.value.geometry,
                steps: walkToDir.value.steps,
                duration: walkToDir.value.duration,
                distance: walkToDir.value.distance,
              }
            : null;

        result.walkFromDirections =
          walkFromDir.status === "fulfilled" && walkFromDir.value
            ? {
                geometry: walkFromDir.value.geometry,
                steps: walkFromDir.value.steps,
                duration: walkFromDir.value.duration,
                distance: walkFromDir.value.distance,
              }
            : null;
      }

      onRouteFound(result);
    } catch (err) {
      console.error("❌ Route finding error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to find route: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerContent className="h-auto max-h-[80vh] w-full sm:w-96 sm:fixed sm:top-4 sm:left-4 sm:bottom-auto rounded-xl shadow-2xl border-0">
        {/* Header */}
        <DrawerHeader className="pb-0">
          <DrawerTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Navigation className="h-4 w-4 text-white" />
            </div>
            <span>SakayDavao</span>
            <span className="text-xs text-gray-400 font-normal ml-auto">
              Davao City
            </span>
          </DrawerTitle>
        </DrawerHeader>

        <CardContent className="space-y-3 p-4 pt-3">
          {/* Starting point row */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Starting point
            </label>
            <div className="flex gap-2">
              <SearchInput
                id="start-input"
                value={startingPoint}
                onChange={handleStartingPointChange}
                onPlaceSelect={handleStartPlaceSelect}
                placeholder="e.g. Roxas Night Market, SM Davao…"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleUseCurrentLocation}
                title="Use my current location"
                className="shrink-0 rounded-xl border-gray-200 hover:border-blue-400 hover:bg-blue-50"
              >
                <LocateFixed className="h-4 w-4 text-blue-500" />
              </Button>
            </div>
          </div>

          {/* Vertical connector */}
          <div className="flex items-center gap-3 px-1 -my-1">
            <div className="w-2 ml-[2px] flex flex-col items-center gap-0.5">
              <div className="w-0.5 h-2 bg-gray-200 rounded" />
              <div className="w-0.5 h-2 bg-gray-200 rounded" />
            </div>
          </div>

          {/* Destination row */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Destination
            </label>
            <SearchInput
              id="dest-input"
              value={destination}
              onChange={handleDestinationChange}
              onPlaceSelect={handleDestPlaceSelect}
              placeholder="e.g. Abreeza Mall, Davao City Hall…"
              className="w-full"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-700 bg-red-50 rounded-xl border border-red-100">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Find Route button */}
          <Button
            onClick={handleFindRoute}
            disabled={loading || !destination.trim()}
            className="w-full rounded-xl h-11 text-sm font-semibold"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin text-base">⏳</span>
                Finding best jeepney…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Find Jeepney Route
              </span>
            )}
          </Button>

          {/* Routes loaded indicator */}
          <p className="text-[11px] text-gray-400 text-center">
            {allRoutesRaw.length > 0
              ? `${allRoutesRaw.length} jeepney routes · Davao City`
              : "⏳ Loading routes…"}
          </p>
        </CardContent>
      </DrawerContent>
    </Drawer>
  );
}
