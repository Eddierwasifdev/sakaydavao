// src/components/AppSidebar.tsx
import { useState, useEffect, useRef } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Navigation,
  Search,
  LocateFixed,
  MapPin,
  Bus,
  Footprints,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
} from "lucide-react";
import {
  findBestJeepneyRoute,
  geocodeAddress,
  type RouteSuggestion,
  type Route,
  type Coordinate,
} from "@/lib/routeFinder";
import { getWalkingDirections } from "@/lib/routingService";
import {
  getManeuverIcon,
  formatDistance,
  formatDuration,
  type RouteStep,
} from "@/lib/routingService";
import { useQuery, useMutation } from "convex/react";
import { SearchInput, type PlaceResult } from "./SearchInput";
import { api } from "../../convex/_generated/api.js";
import { DAVAO_ROUTES } from "@/data/routes/all-routes";
import type { MapDestination } from "@/App";

interface AppSidebarProps {
  userLocation: [number, number] | undefined; // [lng, lat]
  onRouteFound: (result: RouteSuggestion | null) => void;
  mapDestination?: MapDestination | null;
  onClearDestination?: () => void;
}

export function AppSidebar({
  userLocation,
  onRouteFound,
  mapDestination,
  onClearDestination,
}: AppSidebarProps) {
  // ── Search form state ────────────────────────────────────────────────
  const [startingPoint, setStartingPoint] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<RouteSuggestion | null>(null);

  // Cached coordinates from autocomplete selection
  const startCoordsRef = useRef<Coordinate | null>(null);
  const destCoordsRef = useRef<Coordinate | null>(null);

  // ── Auto-fill destination from map click ──────────────────────────────
  const lastConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      mapDestination &&
      mapDestination.placeName !== "Loading..." &&
      lastConsumedRef.current !== mapDestination.placeName
    ) {
      lastConsumedRef.current = mapDestination.placeName;
      setDestination(mapDestination.placeName);
      destCoordsRef.current = mapDestination.coordinates;
      setError(null);
      // Clear the suggestion so user can find a new route
      setSuggestion(null);
      onRouteFound(null);
    }
  }, [mapDestination, onRouteFound]);

  // ── Convex routes ────────────────────────────────────────────────────
  const allRoutesRaw: any[] = useQuery((api as any).jeepneyRoutes.getAll) ?? [];
  const addRoute = useMutation((api as any).jeepneyRoutes.addRoute);

  // Auto-seed routes on first run if DB is empty
  useEffect(() => {
    if (allRoutesRaw.length === 0) {
      const existingIds = new Set(allRoutesRaw.map((r: any) => r.routeId));
      DAVAO_ROUTES.filter((r) => !existingIds.has(r.routeId)).forEach(
        (route) => {
          addRoute({
            routeId: route.routeId,
            name: route.name,
            shortName: route.shortName,
            coordinates: route.coordinates,
            landmarks: route.landmarks,
            color: route.color,
            routeType: route.routeType,
          }).catch(console.error);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRoutesRaw.length]);

  // ── Input change handlers ────────────────────────────────────────────
  const handleStartChange = (val: string) => {
    setStartingPoint(val);
    startCoordsRef.current = null;
  };
  const handleDestChange = (val: string) => {
    setDestination(val);
    destCoordsRef.current = null;
  };
  const handleStartPlaceSelect = (place: PlaceResult) => {
    setStartingPoint(place.shortName);
    startCoordsRef.current = [place.lng, place.lat];
  };
  const handleDestPlaceSelect = (place: PlaceResult) => {
    setDestination(place.shortName);
    destCoordsRef.current = [place.lng, place.lat];
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartingPoint("My Current Location");
        startCoordsRef.current = [pos.coords.longitude, pos.coords.latitude];
        setError(null);
      },
      () =>
        setError("Unable to get your location. Please allow location access."),
    );
  };

  // ── Route finder ─────────────────────────────────────────────────────
  const handleFindRoute = async () => {
    if (!destination.trim()) {
      setError("Please enter a destination.");
      return;
    }
    if (allRoutesRaw.length === 0) {
      setError("Routes are still loading — please wait a moment.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestion(null);
    onRouteFound(null);

    try {
      // Resolve starting coords
      let userCoords: Coordinate;
      if (startCoordsRef.current) {
        userCoords = startCoordsRef.current;
      } else if (
        startingPoint.trim() &&
        startingPoint !== "My Current Location"
      ) {
        userCoords = await geocodeAddress(startingPoint);
        startCoordsRef.current = userCoords;
      } else if (userLocation) {
        userCoords = [userLocation[0], userLocation[1]];
      } else {
        userCoords = [125.6128, 7.0731]; // Davao center fallback
      }

      // Resolve destination coords
      let destCoords: Coordinate;
      if (destCoordsRef.current) {
        destCoords = destCoordsRef.current;
      } else {
        destCoords = await geocodeAddress(destination);
        destCoordsRef.current = destCoords;
      }

      // Map Convex routes → Route type
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

      const result = await findBestJeepneyRoute(
        userCoords,
        destCoords,
        mappedRoutes,
      );

      // Fetch OSRM walking directions for both legs
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

      setSuggestion(result);
      onRouteFound(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Could not find route: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearRoute = () => {
    setSuggestion(null);
    onRouteFound(null);
    onClearDestination?.();
    lastConsumedRef.current = null;
  };

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-gray-100 shadow-xl"
    >
      {/* ── Header / branding ── */}
      <SidebarHeader className="bg-white pb-0 pt-4 px-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm shrink-0"
            style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}
          >
            <Navigation className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-[15px] leading-none">
              SakayDavao
            </h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Jeepney Route Finder
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ── Route search form ── */}
      <SidebarContent className="bg-white overflow-y-auto">
        <SidebarGroup className="px-3 pt-3 pb-1">
          <SidebarGroupLabel className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-0">
            Plan Your Trip
          </SidebarGroupLabel>
          <SidebarGroupContent className="space-y-3">
            {/* Starting point */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                Starting point
              </label>
              <div className="flex gap-2">
                <SearchInput
                  id="sidebar-start"
                  value={startingPoint}
                  onChange={handleStartChange}
                  onPlaceSelect={handleStartPlaceSelect}
                  placeholder="Roxas Night Market, SM Davao…"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  title="Use my current location"
                  className="shrink-0 w-10 h-10 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center transition-colors"
                >
                  <LocateFixed className="h-4 w-4 text-blue-500" />
                </button>
              </div>
            </div>

            {/* Dot connector */}
            <div className="flex items-center gap-2 px-1 -my-0.5 pointer-events-none">
              <div className="flex flex-col items-center gap-[3px] ml-[3px]">
                <div className="w-0.5 h-1.5 rounded bg-gray-200" />
                <div className="w-0.5 h-1.5 rounded bg-gray-200" />
              </div>
            </div>

            {/* Destination */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                Destination
              </label>
              <SearchInput
                id="sidebar-dest"
                value={destination}
                onChange={handleDestChange}
                onPlaceSelect={handleDestPlaceSelect}
                placeholder="Abreeza Mall, Davao City Hall…"
                className="w-full"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                <MapPin className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Find Route button */}
            <Button
              onClick={handleFindRoute}
              disabled={loading || !destination.trim()}
              className="w-full h-11 rounded-xl font-semibold text-sm"
              style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finding best jeepney…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Find Jeepney Route
                </span>
              )}
            </Button>

            {/* Route count badge */}
            <p className="text-center text-[11px] text-gray-400">
              {allRoutesRaw.length > 0
                ? `${allRoutesRaw.length} routes · Davao City`
                : "⏳ Loading routes…"}
            </p>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Route Result (appears in sidebar below search) ── */}
        {suggestion && (
          <>
            <SidebarSeparator />
            <SidebarGroup className="px-3 pb-4">
              <SidebarGroupLabel className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-0 flex items-center justify-between">
                <span>Suggested Route</span>
                <button
                  onClick={handleClearRoute}
                  className="text-gray-300 hover:text-gray-500 transition-colors rounded-full p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <RouteResultInline
                  suggestion={suggestion}
                  onClose={handleClearRoute}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="bg-white border-t border-gray-100 px-4 py-3">
        <p className="text-[10px] text-gray-400 text-center">
          Map data © OpenStreetMap · Routing © OSRM
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}

// ── Inline route result component (lives inside the sidebar) ─────────────────

function RouteResultInline({
  suggestion,
}: {
  suggestion: RouteSuggestion;
  onClose?: () => void;
}) {
  const [showWalkToSteps, setShowWalkToSteps] = useState(false);
  const [showWalkFromSteps, setShowWalkFromSteps] = useState(false);

  if (suggestion.type === "walk-to-route") {
    return (
      <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
        <Footprints className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            No direct route found
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            {suggestion.suggestion}
          </p>
          {suggestion.walkingDistance && (
            <p className="text-xs text-amber-500 mt-1">
              Nearest route: {formatDistance(suggestion.walkingDistance)} away
            </p>
          )}
        </div>
      </div>
    );
  }

  if (suggestion.type === "transfer" && suggestion.legs) {
    return (
      <div className="space-y-3">
        <SummaryCards
          fare={suggestion.estimatedTotalFare ?? suggestion.estimatedFare}
          time={suggestion.estimatedTime}
        />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
          Transfer required
        </p>
        {suggestion.legs.map((leg, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl"
          >
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bus className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {leg.route.name}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{leg.action}</p>
            </div>
          </div>
        ))}
        {suggestion.transferLocation && (
          <p className="text-xs text-gray-400 px-1">
            Transfer at{" "}
            <span className="font-semibold text-gray-700">
              {suggestion.transferLocation}
            </span>
          </p>
        )}
      </div>
    );
  }

  if (suggestion.type !== "direct" || !suggestion.route) return null;

  const {
    route,
    walkToBoard,
    walkFromAlight,
    walkToDirections,
    walkFromDirections,
  } = suggestion;
  const walkToSteps: RouteStep[] = walkToDirections?.steps ?? [];
  const walkFromSteps: RouteStep[] = walkFromDirections?.steps ?? [];

  return (
    <div className="space-y-1">
      {/* Fare + Time summary */}
      <SummaryCards
        fare={suggestion.estimatedFare}
        time={suggestion.estimatedTime}
      />
      <div className="h-px bg-gray-100 my-2" />

      {/* Step 1 — Walk to boarding */}
      {walkToBoard && (
        <JourneyStep
          icon={<Footprints className="h-4 w-4 text-blue-500" />}
          dotColor="bg-blue-500"
          label="Walk to boarding point"
          sublabel={walkToBoard.instructions}
          badge={
            walkToDirections
              ? `${formatDistance(walkToDirections.distance)} · ${formatDuration(walkToDirections.duration)}`
              : formatDistance(walkToBoard.distance)
          }
          expandable={walkToSteps.length > 1}
          expanded={showWalkToSteps}
          onToggle={() => setShowWalkToSteps((v) => !v)}
        >
          {showWalkToSteps && <TurnList steps={walkToSteps} />}
        </JourneyStep>
      )}

      {/* Step 2 — Ride jeepney */}
      <JourneyStep
        icon={<Bus className="h-4 w-4 text-white" />}
        iconBg={route.color}
        dotColor="bg-green-500"
        label={route.name}
        sublabel={
          route.landmarks.length > 0
            ? `Passes: ${route.landmarks.slice(0, 4).join(" · ")}`
            : "Ride to your destination"
        }
        badge={`₱${suggestion.estimatedFare}`}
        lineColor={route.color}
      />

      {/* Step 3 — Walk from alighting */}
      {walkFromAlight && walkFromAlight.distance > 30 && (
        <JourneyStep
          icon={<Footprints className="h-4 w-4 text-blue-500" />}
          dotColor="bg-blue-500"
          label="Walk to destination"
          sublabel={`${formatDistance(walkFromAlight.distance)} after alighting`}
          badge={
            walkFromDirections
              ? `${formatDistance(walkFromDirections.distance)} · ${formatDuration(walkFromDirections.duration)}`
              : formatDistance(walkFromAlight.distance)
          }
          expandable={walkFromSteps.length > 1}
          expanded={showWalkFromSteps}
          onToggle={() => setShowWalkFromSteps((v) => !v)}
        >
          {showWalkFromSteps && <TurnList steps={walkFromSteps} />}
        </JourneyStep>
      )}

      {/* Arrive */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <div className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200 shrink-0" />
        <p className="text-sm font-semibold text-gray-800">
          Arrive at destination
        </p>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SummaryCards({ fare, time }: { fare: number; time: number }) {
  return (
    <div className="flex gap-2">
      <div className="flex-1 bg-blue-50 rounded-xl p-2.5 text-center">
        <p className="text-[10px] text-blue-400 font-medium">Fare</p>
        <p className="text-lg font-bold text-blue-700">₱{fare}</p>
      </div>
      <div className="flex-1 bg-green-50 rounded-xl p-2.5 text-center">
        <p className="text-[10px] text-green-400 font-medium">Time</p>
        <p className="text-lg font-bold text-green-700">{time} min</p>
      </div>
    </div>
  );
}

interface JourneyStepProps {
  icon: React.ReactNode;
  iconBg?: string;
  dotColor: string;
  label: string;
  sublabel?: string;
  badge?: string;
  lineColor?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}

function JourneyStep({
  icon,
  iconBg,
  dotColor,
  label,
  sublabel,
  badge,
  lineColor,
  expandable,
  expanded,
  onToggle,
  children,
}: JourneyStepProps) {
  return (
    <div className="relative pl-6 py-1">
      <div
        className="absolute left-[9px] top-5 bottom-0 w-0.5"
        style={{ background: lineColor ?? "#E5E7EB" }}
      />
      <div
        className={`absolute left-0 top-2 w-4 h-4 rounded-full ${dotColor} ring-2 ring-white`}
      />

      <div
        className={`flex items-start gap-2.5 ${expandable ? "cursor-pointer select-none" : ""}`}
        onClick={expandable ? onToggle : undefined}
      >
        <div
          className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: iconBg ?? "#F3F4F6" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {label}
          </p>
          {sublabel && (
            <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">
              {sublabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {badge && (
            <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
              {badge}
            </span>
          )}
          {expandable &&
            (expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function TurnList({ steps }: { steps: RouteStep[] }) {
  return (
    <div className="ml-9 mt-1 mb-1 space-y-0.5 border-l-2 border-dashed border-blue-100 pl-3">
      {steps
        .filter((s) => s.instruction)
        .map((step, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="text-sm shrink-0 leading-tight">
              {getManeuverIcon(step)}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-gray-700 leading-snug">
                {step.instruction}
              </p>
              {step.distance > 5 && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {formatDistance(step.distance)}
                </p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
