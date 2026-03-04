# 🚐 Jeepney Route Tracker 
 
> A modern, mobile-first web application designed to help commuters navigate local jeepney routes in Davao City efficiently.

This interactive map application provides real-time route suggestions, fare estimates, and walking directions, ensuring a seamless commuting experience.

---

## ✨ Key Features

- **🗺️ Interactive Map:** View all jeepney routes overlaid on OpenStreetMap.
- **🚶 Walking Directions:** Turn-by-step directions to the nearest boarding and alighting points.
- **🚐 Route Suggestions:** Clear, smart recommendations on which jeepney to ride, including necessary transfers.
- **💰 Fare & Time Estimates:** Know your expected travel time and how much you'll pay before you ride.
- **📱 Mobile-Optimized:** A mobile-first interface designed for commuters on the go.

---

## 🔍 Feature Breakdown

| Feature                   | Description                                                            |
| :------------------------ | :--------------------------------------------------------------------- |
| **🗺️ Interactive Map**    | View all jeepney routes overlaid seamlessly on OpenStreetMap.          |
| **🔍 Smart Search**       | Search destinations by landmark, address, or your current location.    |
| **🚌 Route Suggestions**  | Get recommended jeepney routes, including multi-ride transfers.        |
| **🚶 Walking Directions** | Get step-by-step guidance to boarding and alighting points.            |
| **💰 Fare Estimates**     | Calculate expected trip costs before getting on the jeepney.           |
| **⏱️ Time Estimates**     | View estimated travel times for your entire journey.                   |
| **📱 Mobile-First UI**    | Optimized specifically for phone screens where commuters need it most. |
| **🔄 Real-Time Sync**     | Routes and data update instantly via the Convex backend.               |

---

## 🛠️ Tech Stack

### Frontend

| Technology       | Purpose                                               |
| :--------------- | :---------------------------------------------------- |
| **React 18**     | Core UI framework                                     |
| **TypeScript**   | Type-safe JavaScript for robust code                  |
| **Vite**         | Lightning-fast build tool & dev server with HMR       |
| **Tailwind CSS** | Utility-first styling for rapid UI development        |
| **shadcn/ui**    | Pre-built, customizable, and accessible UI components |
| **@mapcn/map**   | Beautiful MapLibre GL-based map component             |

### Backend

| Technology           | Purpose                                 |
| :------------------- | :-------------------------------------- |
| **Convex**           | Serverless backend & real-time database |
| **Convex Functions** | Server-side queries & mutations         |
