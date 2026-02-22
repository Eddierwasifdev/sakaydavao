// src/App.tsx
import { useState, useEffect } from "react";
import { JeepneyMap } from "./components/JeepneyMap";
import { AppSidebar } from "./components/AppSidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "./components/ui/sidebar";
import type { RouteSuggestion } from "./lib/routeFinder";

function App() {
  const [suggestion, setSuggestion] = useState<RouteSuggestion | null>(null);
  const [userLocation, setUserLocation] = useState<
    [number, number] | undefined
  >(undefined);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([
            position.coords.longitude,
            position.coords.latitude,
          ]);
        },
        () => console.log("Location access denied"),
      );
    }
  }, []);

  return (
    <SidebarProvider defaultOpen>
      {/* Left sidebar — search + route results */}
      <AppSidebar userLocation={userLocation} onRouteFound={setSuggestion} />

      {/* Main area — full-screen map */}
      <SidebarInset className="relative p-0 overflow-hidden">
        {/* Floating toggle button (shows when sidebar is collapsed) */}
        <div className="absolute top-3 left-3 z-50">
          <SidebarTrigger className="bg-white shadow-md rounded-xl border border-gray-100 hover:bg-gray-50 w-9 h-9" />
        </div>

        <JeepneyMap userLocation={userLocation} suggestion={suggestion} />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
