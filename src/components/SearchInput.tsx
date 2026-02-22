// src/components/SearchInput.tsx
// Live place search using Nominatim (OpenStreetMap) — no API key needed
import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, X } from "lucide-react";

export interface PlaceResult {
  displayName: string; // full label shown in dropdown
  shortName: string; // what goes in the input box after selection
  lat: number;
  lng: number;
  type: string; // e.g. "amenity", "highway", "place"
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceResult) => void; // optional callback with coords
  placeholder?: string;
  className?: string;
  id?: string;
}

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Nominatim search — returns places in Davao City / Region XI
async function searchNominatim(query: string): Promise<PlaceResult[]> {
  if (!query || query.length < 2) return [];

  const params = new URLSearchParams({
    q: `${query}, Davao City`,
    format: "json",
    addressdetails: "1",
    limit: "8",
    countrycodes: "ph",
    // viewbox biases results toward Davao City
    viewbox: "125.45,7.30,125.80,6.85",
    bounded: "0",
  });

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        "User-Agent": "SakayDavao/1.0 (davao-commute-app)",
        "Accept-Language": "en",
      },
    },
  );
  if (!res.ok) return [];
  const data: any[] = await res.json();

  return data.map((item) => {
    const addr = item.address ?? {};
    // Build a clean short name: landmark > road > suburb > city
    const shortName =
      addr.amenity ??
      addr.shop ??
      addr.tourism ??
      addr.leisure ??
      addr.building ??
      addr.road ??
      addr.neighbourhood ??
      addr.suburb ??
      item.name ??
      item.display_name.split(",")[0];

    // Build a readable sub-label (district, city)
    const district =
      addr.suburb ?? addr.neighbourhood ?? addr.city_district ?? "";
    const city = addr.city ?? addr.town ?? addr.municipality ?? "Davao City";
    const subLabel = [district, city].filter(Boolean).join(", ");

    return {
      displayName: item.display_name,
      shortName: shortName.trim(),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type ?? item.class ?? "place",
      _subLabel: subLabel,
      _icon: resolveIcon(item.class, item.type),
    } as PlaceResult & { _subLabel: string; _icon: string };
  });
}

function resolveIcon(cls: string, type: string): string {
  if (cls === "amenity") {
    if (type === "restaurant" || type === "cafe" || type === "fast_food")
      return "🍽️";
    if (type === "school" || type === "university" || type === "college")
      return "🎓";
    if (type === "hospital" || type === "clinic" || type === "pharmacy")
      return "🏥";
    if (type === "bank" || type === "atm") return "🏦";
    if (type === "fuel") return "⛽";
    if (type === "place_of_worship") return "⛪";
    if (type === "marketplace" || type === "marketplace") return "🛒";
  }
  if (cls === "shop" || type === "mall" || type === "supermarket") return "🛍️";
  if (cls === "tourism" || type === "hotel" || type === "resort") return "🏨";
  if (cls === "highway") return "🛣️";
  if (cls === "boundary" || cls === "place") return "🏘️";
  if (type === "park" || cls === "leisure") return "🌳";
  return "📍";
}

export function SearchInput({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search location",
  className,
  id,
}: SearchInputProps) {
  const [results, setResults] = useState<
    (PlaceResult & { _subLabel: string; _icon: string })[]
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(value, 350);

  // Fetch from Nominatim whenever debounced query changes
  useEffect(() => {
    if (!focused || debouncedQuery.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    searchNominatim(debouncedQuery)
      .then((r) => {
        setResults(r as any);
        setOpen(r.length > 0);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery, focused]);

  const handleSelect = useCallback(
    (place: PlaceResult & { _subLabel: string }) => {
      onChange(place.shortName);
      onPlaceSelect?.(place);
      setOpen(false);
      setFocused(false);
      inputRef.current?.blur();
    },
    [onChange, onPlaceSelect],
  );

  const handleClear = () => {
    onChange("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {/* Input with prefix icon */}
      <div
        className={`
        flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 shadow-sm
        transition-all duration-150
        ${focused ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"}
      `}
      >
        <MapPin
          className={`h-4 w-4 shrink-0 ${focused ? "text-blue-500" : "text-gray-400"}`}
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
        />
        {loading && (
          <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
        )}
        {!loading && value && (
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-9999 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden">
          {results.map((place, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click fires
                handleSelect(place);
              }}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-b-0"
            >
              <span className="text-lg leading-none mt-0.5 shrink-0">
                {(place as any)._icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {place.shortName}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {(place as any)._subLabel ||
                    place.displayName.split(",").slice(1, 3).join(",")}
                </p>
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center gap-1">
            <span className="text-[10px] text-gray-400">Powered by</span>
            <span className="text-[10px] font-semibold text-gray-500">
              OpenStreetMap
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
