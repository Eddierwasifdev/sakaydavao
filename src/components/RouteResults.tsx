// src/components/RouteResults.tsx
import { useState } from "react";
import {
  X,
  Bus,
  Footprints,
  ChevronDown,
  ChevronUp,
  Navigation,
} from "lucide-react";
import type { RouteSuggestion } from "@/lib/routeFinder";
import {
  getManeuverIcon,
  formatDistance,
  formatDuration,
  type RouteStep,
} from "@/lib/routingService";

interface RouteResultsProps {
  suggestion: RouteSuggestion;
  onClose: () => void;
}

export function RouteResults({ suggestion, onClose }: RouteResultsProps) {
  const [showWalkToSteps, setShowWalkToSteps] = useState(false);
  const [showWalkFromSteps, setShowWalkFromSteps] = useState(false);

  // ── walk-to-route fallback ──
  if (suggestion.type === "walk-to-route") {
    return (
      <PanelWrapper onClose={onClose}>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <Footprints className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                No direct jeepney route found
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {suggestion.suggestion}
              </p>
              {suggestion.walkingDistance && (
                <p className="text-xs text-amber-500 mt-1">
                  Nearest route is {formatDistance(suggestion.walkingDistance)}{" "}
                  away
                </p>
              )}
            </div>
          </div>
        </div>
      </PanelWrapper>
    );
  }

  // ── transfer ──
  if (suggestion.type === "transfer" && suggestion.legs) {
    return (
      <PanelWrapper onClose={onClose}>
        <div className="p-4 space-y-3">
          <SummaryRow
            fare={suggestion.estimatedTotalFare ?? suggestion.estimatedFare}
            time={suggestion.estimatedTime}
          />
          <div className="h-px bg-gray-100" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
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
              <span className="font-semibold text-gray-600">
                {suggestion.transferLocation}
              </span>
            </p>
          )}
        </div>
      </PanelWrapper>
    );
  }

  // ── direct route (main case) ──
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
    <PanelWrapper onClose={onClose}>
      <div className="p-4 space-y-1">
        {/* Summary */}
        <SummaryRow
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
          icon={<Bus className="h-4 w-4 text-green-600" />}
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
            sublabel={`${formatDistance(walkFromAlight.distance)} walk after alighting`}
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
        <div className="flex items-center gap-3 px-1 pt-2">
          <div className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200 shrink-0" />
          <p className="text-sm font-semibold text-gray-800">
            Arrive at destination
          </p>
        </div>
      </div>
    </PanelWrapper>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PanelWrapper({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px] z-1000">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "linear-gradient(to right, #2563eb, #3b82f6)" }}
        >
          <div className="flex items-center gap-2 text-white">
            <Navigation className="h-4 w-4" />
            <span className="font-semibold text-sm">Suggested Route</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-full p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function SummaryRow({ fare, time }: { fare: number; time: number }) {
  return (
    <div className="flex gap-3">
      <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
        <p className="text-xs text-blue-500 font-medium">Est. Fare</p>
        <p className="text-xl font-bold text-blue-700">₱{fare}</p>
      </div>
      <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
        <p className="text-xs text-green-500 font-medium">Est. Time</p>
        <p className="text-xl font-bold text-green-700">{time} min</p>
      </div>
    </div>
  );
}

interface JourneyStepProps {
  icon: React.ReactNode;
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
      {/* Vertical connector */}
      <div
        className="absolute left-[9px] top-5 bottom-0 w-0.5"
        style={{ background: lineColor ?? "#E5E7EB" }}
      />
      {/* Dot */}
      <div
        className={`absolute left-0 top-2 w-4 h-4 rounded-full ${dotColor} ring-2 ring-white`}
      />

      <div
        className={`flex items-start gap-3 ${expandable ? "cursor-pointer select-none" : ""}`}
        onClick={expandable ? onToggle : undefined}
      >
        <div className="mt-0.5 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
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
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ))}
        </div>
      </div>

      {children}
    </div>
  );
}

function TurnList({ steps }: { steps: RouteStep[] }) {
  return (
    <div className="ml-10 mt-1 mb-2 space-y-0.5 border-l-2 border-dashed border-blue-200 pl-3">
      {steps
        .filter((s) => s.instruction)
        .map((step, i) => (
          <div key={i} className="flex items-start gap-2 py-1">
            <span className="text-base shrink-0 leading-tight">
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
