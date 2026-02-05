# MapLibre Map: Feature Parity and Implementation Plan

This document plans bringing the MapLibre GL map tab to feature parity with the Leaflet map, then adding new features. It is structured so each section can be implemented by an AI agent in order, one after another.

---

## 1. Relevant context (where to find things)

### 1.1 Current MapLibre setup
- **Component:** `routing-app/src/lib/components/RouteMapMaplibre.svelte`
  - Uses `svelte-maplibre-gl` (`MapLibre`, `VectorTileSource`, `CircleLayer`).
  - Default view: Utrecht `[5.1214, 52.0907]`, zoom 13 (same as Leaflet).
  - Base style: Europe vector tiles from Martin; overlay: `active_places_with_geom` as blue circles.
- **Tab switching:** `routing-app/src/lib/stores/activeTab.ts` — `MainTab` includes `'map_maplibre'`. `GameState.svelte` renders `<RouteMapMaplibre />` when `$activeMainTab === 'map_maplibre'`.
- **Tile server:** `routing-app/src/lib/map/tileServerUrl.ts` — `getTileServerUrl()` (default `http://localhost:3000`). Martin config: `routing_server/martin-config.yaml`; PostGIS views/functions are auto-published.

### 1.2 Leaflet reference (feature parity source)
- **Main map:** `routing-app/src/lib/components/RouteMap.svelte`
  - Uses `MapManager` (`routing-app/src/lib/components/map/MapManager.ts`) for init, visible tiles, zoom.
  - Sub-components (all under `routing-app/src/lib/components/map/`):
    - **MarkerRenderer.svelte** — employee markers (animated along route), job markers, popups (HTML strings + `bindPopup`).
    - **RouteRenderer.svelte** — polylines for `displayedRoutes` (active, preview, available).
    - **TravelDestinationMarker.svelte** — travel destination and “Start travel” in popup.
    - **PlacesRenderer.svelte** — POIs from tile API + IndexedDB, Leaflet markers + MarkerClusterGroup; click → place filter / select; popups use `createPlacePopupHTML` (supply/demand, amount, “Accept job”).
  - **“To map” behavior:** `EmployeeCard.svelte` → `handleGoToMap` calls `selectEmployee(employee.id)` and `switchToTab('map')`. RouteMap reacts to `$selectedEmployee` and calls `handleEmployeeSelection` → either `leafletMap.setView([lat, lon], zoom)` (idle) or `zoomToRoute(activeRoute)` (active job).
  - **Route display:** `updateDisplayedRoutes()` in RouteMap builds `displayedRoutes` from `$selectedActiveJobData` (preview), `$fullEmployeeData` (active + travel jobs), and `$displayedRoutes`; `zoomToRoute` uses `L.latLngBounds` + `fitBounds`.

### 1.3 Data and stores
- **Map display:** `routing-app/src/lib/stores/mapDisplay.ts` — `displayedRoutes`, `DisplayableRoute`, `RouteDisplay`, `mapDisplayActions` (addRoute, removeRoute, selectRoute), style presets (SELECTED, ACTIVE, PREVIEW, etc.).
- **Selection:** `selectedEmployee` (`$lib/stores/selectedEmployee`), `selectedRoute` (`$lib/stores/selectedRoute`), `selectedActiveJobData` / `clearSelectedJob` (`$lib/stores/selectedJob`).
- **Game data:** `fullEmployeeData`, `currentGameState`, `gameDataAPI` in `$lib/stores/gameData.ts`. Employee position: `employee.location` (Coordinate: lat/lon).
- **Routes:** `getRoute`, `prefetchRoutes` in `$lib/stores/routeCache.ts`. Route data: `PathPoint[]` with `coordinates.lat/lon`.
- **Places / POIs:**
  - **Schema:** `places` and `active_places` in `routing-app/src/lib/server/db/schema.ts`. Existing view for Martin: `drizzle/0020_active_places_with_geom.sql` (place_id, region_id, category_id, geom).
  - **POI data via Martin (not tile API):** POI data for the MapLibre map should be loaded via Martin vector tiles, not the legacy tile API + IndexedDB. The raw `places` table is not directly useable by the tile server (e.g. it has only category_id/region_id, no human-readable category/region names for tile properties; and/or Martin expects a view with a single geometry column and MVT-friendly properties). A separate implementation step (or migration) must **prepare a Martin-servable table or view based on `places`** — e.g. a view that joins `places` with `categories` and `region` so each row has `place_id`, `category` (name), `region_code`, and `geom`, and optionally restricts to `active_places` so only the game subset is served. That view is then what MapLibre uses as the POI vector-tile source; no tile API or client-side POI cache for the MapLibre tab.
  - **Legacy (Leaflet):** `loadPlacesForTiles` in `routing-app/src/lib/map/placesLoader.ts`; `getPlacesForVisibleTilesGrouped` in `routing-app/src/lib/map/placesGetter.ts`; tile API `GET /api/places/[tile_x]/[tile_y]` and IndexedDB cache remain for the Leaflet map until it is retired.
  - **Place filter:** `placeFilter` store (`$lib/stores/placeFilter.ts`) — `PlaceFilter { selectedPlaceId, selectedGood, filterType, targetType }`. `createPlaceFilterPredicate` in `$lib/places/placeFilter.ts` filters by supply/demand/good.
  - **Place goods:** `placeGoods` store, `placeGoodsConfig` (`$lib/config/placeGoodsTypes.ts`), `selectPlaceGoods` in `$lib/places/placeGoodsSelection.ts`; supply amount: `$lib/places/supplyAmount.ts`.
- **Job from two POIs:** `POST /api/jobs/accept-from-places` — body `{ employeeId, gameStateId, supplyPlaceId, demandPlaceId }`; see `routing-app/src/routes/api/jobs/accept-from-places/+server.ts`.
- **Popups (content only):** `routing-app/src/lib/components/map/popups/placePopup.ts` — `createPlacePopupHTML(...)` (supply/demand, amount, job value, “Accept job” button). Prefer replacing with Svelte components instead of generated HTML.

### 1.4 Region overlay (NUTS)
- **Store:** `regionOverlayEnabled`, `NUTS_HOVER_MAX_ZOOM`, `NUTS_LEVEL` in `$lib/stores/regionOverlay.ts`.
- **Logic:** `$lib/map/nutsOverlay.ts` — `loadNutsGeoJson()` (static `/regions/combined_01m.geojson`), `createNutsLayer(L, geojson)`, `setNutsInteractivity(map, layer, ...)`. GeoJSON is EPSG:3857; converted to WGS84 for Leaflet. NUTS level 2; show at some zoom levels, hover highlight below `NUTS_HOVER_MAX_ZOOM` (8).

### 1.5 Travel mode
- **Stores:** `travelModeState`, `travelModeActions`, `isInTravelMode` in `$lib/stores/travelMode.ts`. Travel destination marker and “Start travel” are in Leaflet’s `TravelDestinationMarker.svelte`.

---

## 2. Architecture and constraints

- **UI:** Use **Svelte components only** for all map-related UI (markers, popups, panels). **No generated HTML** (no `createXPopupHTML` or `innerHTML` for map content); use Svelte components rendered in the DOM (e.g. absolute-positioned overlays or MapLibre popup/marker slots if the library supports it).
- **Performance:** Prefer MapLibre **vector layers and one GeoJSON/source update** over many DOM markers where possible. For POIs: small circle/symbol layer with filter; for “popup” content use a single Svelte panel bound to selected feature/place. Avoid clustering; **draw POIs smaller** and rely on **filter UI** to find specific supply/demand.
- **Libraries:** Keep **svelte-maplibre-gl** for the map. Use **maplibre-gl** types and API for programmatic control (flyTo, getBounds, etc.). No Leaflet in the MapLibre tab.
- **State:** Reuse existing stores (`selectedEmployee`, `displayedRoutes`, `placeFilter`, `fullEmployeeData`, `selectedActiveJobData`, `regionOverlayEnabled`, `travelModeState`, etc.) so both tabs stay in sync when switching; “To map” should be able to switch to the MapLibre tab and pan/zoom the same way (see “Pan/zoom on ‘To map’” below).
- **Tab behavior:** “To map” from EmployeeCard currently switches to `'map'` (Leaflet). Have it switch to a single “map” tab that uses MapLibre.

---

## 3. Implementation steps (in order)

Each step is intended for one AI agent run. Do them sequentially.

---

### Step 1: Map control and "To map" pan/zoom ✅ COMPLETE

**Goal:** Get a reference to the MapLibre map instance, expose center/zoom reactively, and pan/zoom when the user clicks “To map” for an employee (and optionally when selecting a route).

**Where:**
- `RouteMapMaplibre.svelte` — add bind to map instance if svelte-maplibre-gl exposes it (e.g. `bind:this` or `getMap` callback). Check `svelte-maplibre-gl` docs/package for how to get the underlying `maplibre-gl` map.
- Same file or a small `useMapLibreMap.ts` — provide a way to call `map.flyTo({ center: [lng, lat], zoom })` and `map.fitBounds(bounds, options)`.

**Tasks:**
1. ✅ In `RouteMapMaplibre.svelte`, obtain the raw MapLibre map instance (from child ref or event/callback from `MapLibre`).
   - **Implementation:** Used `bind:map={mapInstance}` prop binding on `MapLibre` component (per svelte-maplibre-gl API).
2. ✅ Subscribe to `selectedEmployee` (and optionally `selectedRoute`). When `selectedEmployee` is set:
   - Resolve employee position from `fullEmployeeData` (reuse logic from Leaflet’s `getEmployeePosition` in RouteMap.svelte).
   - If employee has an active job with route: get route path from `displayedRoutes` or by fetching route data, compute bounds, call `map.fitBounds(bounds, { padding: 20 })`.
   - Else: call `map.flyTo({ center: [lon, lat], zoom: currentZoom or 14 })`.
   - **Implementation:** Added reactive statement that handles both cases (active job with route → fitBounds, idle → flyTo). Reused `getEmployeePosition()` logic from Leaflet RouteMap.
3. ✅ Ensure “To map” from EmployeeCard can switch to the MapLibre tab: either pass a query/flag so GameState switches to `map_maplibre`, or for this step only switch to `map` and in a later step change to MapLibre. Document the choice.
   - **Implementation:** Updated `EmployeeCard.svelte`'s `handleGoToMap()` to call `switchToTab('map_maplibre')` instead of `'map'.

**Acceptance:** ✅ Clicking “To map” for an employee opens the map tab, and the map pans/zooms to that employee (or to the route if they have an active job).

---

### Step 2: Employee positions (and animation when moving)

**Goal:** Show each employee as a marker on the MapLibre map; if they have an active or travel job with a route, animate position along the path.

**Where:**
- New component e.g. `routing-app/src/lib/components/map/maplibre/EmployeeMarkers.svelte` (or under a single `RouteMapMaplibreLayers.svelte` that composes all overlay components).
- Reuse animation idea from Leaflet: `MarkerRenderer.svelte` uses `animationTimestamp` and `routesByEmployee` to interpolate position along `path` (see RouteMap.svelte `routesByEmployee` and MarkerRenderer’s use of it).

**Tasks:**
1. Add a **GeoJSON source** (or single source with FeatureCollection) for “employee positions”. Data: one point per employee; properties: employee id, name, etc. Use a **symbol or circle layer** to render them (no HTML markers if we can avoid it for performance).
2. Derive positions: from `fullEmployeeData` — if employee has active/travel job with `startTime`, use interpolated position along route (same formula as Leaflet: progress based on elapsed time and path length); else use `employee.location`.
3. Run an animation loop (e.g. requestAnimationFrame or 30 FPS timer) that updates a store (e.g. `animationTimestamp`) and recomputes positions; update the GeoJSON source from Svelte.
4. Style: distinct color/shape for selected employee (from `selectedEmployee` store).

**Acceptance:** All employees visible on map; moving employees (on job/travel) animate along their route; selected employee visually distinct.

---

### Step 3: Region borders (NUTS) at some zoom levels

**Goal:** Display NUTS region borders at appropriate zoom levels, with optional hover highlight (no click yet).

**Where:**
- `routing-app/src/lib/map/nutsOverlay.ts` — already loads GeoJSON (WGS84 after conversion in Leaflet). For MapLibre we need GeoJSON in [lng, lat]. Either store WGS84 in a static file or convert once and expose.
- RouteMapMaplibre (or a child component): add a GeoJSON source + fill/line layers for regions; visibility or opacity based on zoom and `regionOverlayEnabled`.

**Tasks:**
1. Ensure NUTS GeoJSON is available in WGS84 [lng, lat] for MapLibre (same as Leaflet or convert in build/script). Add a source `regions-geojson` (e.g. from `/regions/combined_01m.geojson` or a converted copy).
2. Add fill layer (low opacity) and line layer for boundaries. Use `regionOverlayEnabled` to show/hide. Optionally restrict to zoom &lt;= `NUTS_HOVER_MAX_ZOOM` (8) or another threshold so borders don’t clutter at high zoom.
3. Optional: hover highlight (change layer paint or use a separate “highlight” layer with a single feature). Can be deferred to “clickable regions” step.

**Acceptance:** Toggle “Regions” shows NUTS borders on the MapLibre map at appropriate zooms; style similar to Leaflet (e.g. blue outline, light fill).

---

### Step 4: Active and previewed routes

**Goal:** Draw the active route and the currently previewed job route (when a job is selected in the list) as lines on the map.

**Where:**
- `mapDisplay.ts` — same `displayedRoutes` and `DisplayableRoute` structure. Route path: array of points with `coordinates.lat`, `coordinates.lon` (or parse from `routeData`).
- New component or layer in RouteMapMaplibre: one GeoJSON source for “routes” (MultiLineString or multiple LineString features), with a property for route id and type (active/preview/available). One line layer (or more for different styles).

**Tasks:**
1. Subscribe to `displayedRoutes` and optionally `selectedRoute`. Build a GeoJSON FeatureCollection of LineString features from `route.path` (or parsed route data). Properties: routeId, isActive, isPreview, isSelected.
2. Add a MapLibre source (e.g. `routes`) and a line layer. Use data-driven paint (e.g. `line-color`, `line-width`) from feature properties so active/preview/selected have different colors/weights (reuse colors from `mapDisplay.ts` ROUTE_STYLES).
3. Ensure routes update when `fullEmployeeData`, `selectedActiveJobData`, or `selectedRoute` change (same reactive deps as Leaflet’s `updateDisplayedRoutes`).

**Acceptance:** Active job and travel routes and the preview route (when a job is selected) appear as lines with correct styles; selection state is visible.

---

### Step 5: POIs from places via Martin — no clustering, small symbols

**Goal:** Show POIs as small circles/symbols from **Martin vector tiles**; no clustering. POIs only need to indicate “something here”; finding a specific type is done via filter UI (later step).

**Where:**
- **Martin-servable POI source (prepare first):** The raw `places` table is not directly useable by the tile server. Add a **table or view** that Martin can serve, based on `places`: e.g. a view that joins `places` with `categories` and `region` so each row has one geometry column plus properties like `place_id`, `category` (name), `region_code`. Optionally restrict to `active_places` so only the game subset is in the tiles. Document or implement this in a migration when ready; do not run migrations as part of the plan — the plan only states that this preparation is required.
- Current MapLibre setup uses `active_places_with_geom` (place_id, region_id, category_id, geom). Either switch to the new view once it exists, or extend that view to add category name and region code so the client can filter/display without extra lookups.
- Per-POI data for popups (supply/demand, amount): supply/demand and amount are derived from game state and config (e.g. `selectPlaceGoods`, `generateSupplyAmount`), not stored in the DB per place. So the tile layer only needs enough to identify the place (place_id, category, region_code); the app fetches or computes supply/demand/amount when showing the popup (e.g. from place_id + game state).

**Tasks:**
1. **Preparation (document only; implement in a separate step):** Ensure a Martin-servable POI source exists: a view (or table) based on `places` that exposes one geometry column and MVT-friendly properties (at least place_id, category name, region code). Restrict to active_places if desired. Do not run any database migrations from this plan.
2. In MapLibre, use that source as a **vector tile layer** (same tile server URL, source id = the view/table name). Replace or drop the current `active_places_with_geom` layer in favour of the new source if the new one is the canonical POI layer.
3. Use **small** circle/style (e.g. radius 3–5px) so many POIs don’t overlap; no clustering.
4. Apply **filter** from `placeFilter` / `createPlaceFilterPredicate` in the client: use MapLibre layer filter expressions on the POI layer (e.g. filter by `category` or other tile properties) when a filter is active; for supply/demand/good type the filter may require client-side logic if those are not in the tile (they're derived from place_id + game state).

**Acceptance:** POIs are loaded via Martin (vector tiles) from a prepared table/view based on places; they appear as small circles; no clustering; filter UI can narrow what's shown where possible from tile properties.

---

### Step 6: POI click → Svelte popup (supply/demand, good type, amount)

**Goal:** Clicking a POI opens a popup (Svelte component, no generated HTML) showing place info: supply or demand, good type, amount (and later “Accept job” when a second POI is selected).

**Where:**
- New Svelte component e.g. `routing-app/src/lib/components/map/maplibre/PlacePopup.svelte` — receives `place`, `placeGoodsConfig`, selected goods, supply amount, etc., and displays them (reuse data logic from `createPlacePopupHTML` / PlacesRenderer).
- MapLibre: use map `click` (or `mouseup`) on the places layer; query features under cursor (`map.queryRenderedFeatures`), get place id, then look up full place + goods from stores/API and show the popup.

**Tasks:**
1. On MapLibre `click`, if the click is on the places layer, get feature’s place id (and any other props). Resolve full place (from places cache or by tile) and compute `selectPlaceGoods`, supply amount, etc. (same as Leaflet PlacesRenderer).
2. Add a **single** popup UI: a Svelte component rendered in the DOM (e.g. absolute div next to the map), positioned at clicked point (or above it). Pass in `place`, goods info, amounts. No `innerHTML`; all content is Svelte.
3. Popup shows: region, type (Supply/Demand), good name, amount (for supply). For demand, optionally show job value/duration/XP when we have a selected supply (next step).

**Acceptance:** Click POI → Svelte popup with correct supply/demand, good type, and amount; no raw HTML strings.

---

### Step 7: Second POI selection and “Start job”

**Goal:** Allow selecting a second POI after the first: first click = supply (or demand), second = the other; then show “Start job” and call accept-from-places API.

**Where:**
- Reuse `placeFilter` store concept: first selection sets “supply” or “demand” and the selected place; second selection sets the other. Alternatively introduce a small “job draft” store: `{ supplyPlaceId, demandPlaceId } | null`.
- `POST /api/jobs/accept-from-places` — body `{ employeeId, gameStateId, supplyPlaceId, demandPlaceId }`. Need `selectedEmployee` and `currentGameState`.

**Tasks:**
1. Define flow: e.g. first POI click → if supply, store as “supply place”; if demand, store as “demand place”. Second POI click → set the other leg. If both set, show “Start job” in popup or in a small floating panel.
2. In the Svelte popup (or a small “Job draft” panel): when one place is selected, show “Select a [demand/supply] place to create a job”. When both selected, show both names and a “Start job” button.
3. On “Start job”: call `POST /api/jobs/accept-from-places` with `selectedEmployee`, `currentGameState.id`, `supplyPlaceId`, `demandPlaceId`. On success, refresh game data (e.g. `gameDataAPI.loadAllEmployeeData()`), clear the two-place selection, close popup. On error, show message.
4. Visually distinguish the two selected POIs on the map (e.g. different color or ring).

**Acceptance:** User can select supply then demand (or vice versa); “Start job” creates the job and updates the game; selection state is clear on the map.

---

### Step 8: Travel destination and travel mode on MapLibre

**Goal:** Show travel destination marker when in travel mode; allow starting travel from the map (same behavior as Leaflet’s TravelDestinationMarker).

**Where:**
- `TravelDestinationMarker.svelte` (Leaflet) — shows a marker at travel destination; popup with “Start travel”. Use `travelModeState`, `travelModeActions.startTravel(travelJobId)`.
- MapLibre: add a point (or symbol) for the travel destination when `travelModeState.employeeId` and destination exist; add a Svelte popup/panel with “Start travel” button that calls `travelModeActions.startTravel`.

**Tasks:**
1. From `fullEmployeeData` and `travelModeState`, get the travel job and its destination (route end). Add one feature to a “travel-destination” source or a separate layer.
2. On click on that destination, open a small Svelte panel with “Start travel” and optional employee name. Button calls `travelModeActions.startTravel(travelJobId)`.
3. Style so it’s visually distinct from job POIs and employee markers.

**Acceptance:** Travel destination is visible; clicking it and “Start travel” starts the travel job as in Leaflet.

---

### Step 9 (New): Clickable regions — region experience and points

**Goal:** Make NUTS regions clickable; on click show a panel with “region experience” and “points” for that region.

**Where:**
- Backend: today there is no “region XP” or “region points” in schema. Options: (1) Add `region_experience` (or similar) table/keyed by region_id and game_state (e.g. sum of XP from jobs that started/ended in that region), and an API to return it. (2) Or compute on the fly from active_jobs / history. (3) Or show placeholder “Region: name, code” and “XP / Points: coming soon” until backend exists. Plan for (3) in UI, with a clear extension point for (1).
- MapLibre: use `queryRenderedFeatures` on the regions layer on click; get region id or code from feature properties. Ensure the GeoJSON source for regions includes `id` and name/code in properties.

**Tasks:**
1. Ensure region features in the GeoJSON (or vector source) have properties: at least region id/code and name. Add a click handler on the regions layer.
2. Add a Svelte component e.g. `RegionPanel.svelte` that shows region name, code, and “Experience: …”, “Points: …”. For now these can be placeholders or “—”; later an API can feed real values.
3. Optional: backend — add endpoint e.g. `GET /api/game-states/[id]/region-stats` returning per-region XP/points; then wire RegionPanel to it.

**Acceptance:** Clicking a region opens a Svelte panel with region info and placeholders for experience/points; no generated HTML.

---

### Step 10 (New): POI filter UI — by supply type and amount

**Goal:** UI to filter POIs by supply type (good) and optionally by “amount offered” (e.g. min amount), so the map only shows matching POIs.

**Where:**
- `placeFilter` store and `createPlaceFilterPredicate` already support “show places that supply/demand good X”. Extend to “min amount” or “amount range” for supply.
- New component: e.g. `POIFilterPanel.svelte` — dropdown or list for good type (from placeGoods config), toggle supply/demand, optional number input for “min amount” (supply). Apply filter to the POI layer source (or to the list that feeds the GeoJSON source).

**Tasks:**
1. Extend `PlaceFilter` (or a separate “POI filter” store) with e.g. `minSupplyAmount: number | null` and ensure the predicate used for the MapLibre POI source filters by it (compare with `generateSupplyAmount` / stored amount).
2. Add `POIFilterPanel.svelte`: good type selector, supply/demand, min amount. Use Tailwind + DaisyUI; place it as a floating panel on the map (same as Leaflet’s place filter indicator).
3. When filter changes, update the POI source or the predicate so only matching places are rendered (small circles). No clustering; user relies on this UI to find specific POIs.

**Acceptance:** User can filter POIs by good type and (optionally) min supply amount; map shows only matching POIs; UI is Svelte + Tailwind/DaisyUI.

---

## 4. File and component layout (suggested)

- **RouteMapMaplibre.svelte** — Orchestrator: map instance, center/zoom, subscriptions to stores, composes layers and panels.
- **map/maplibre/** (or **map/maplibre/** under components):
  - **EmployeeMarkers.svelte** — employee positions GeoJSON + animation.
  - **RouteLines.svelte** — routes GeoJSON from `displayedRoutes`.
  - **PlacesLayer.svelte** — POI source + circle layer; click → emit place + show popup.
  - **RegionBorders.svelte** — NUTS source + layers; click → emit region + show panel.
  - **PlacePopup.svelte** — Svelte popup content (supply/demand, amount, “Start job” when two selected).
  - **RegionPanel.svelte** — Region name, XP/points (placeholder or API).
  - **POIFilterPanel.svelte** — Filter by good type and amount.
  - **TravelDestinationMarker.svelte** (MapLibre version) — or inline into orchestrator.

Keep popups/panels as Svelte components in the DOM (absolute/fixed), not inside the map canvas; use a single “selected feature” state (place or region) to show one popup/panel at a time.

---

## 5. Libraries and references

- **svelte-maplibre-gl:** Check repo/docs for how to get the underlying `Map` instance (e.g. slot or callback).
- **maplibre-gl:** `map.flyTo()`, `map.fitBounds()`, `map.queryRenderedFeatures()`, `map.getBounds()`, `map.getZoom()`. Use GeoJSON sources and `setData()` for dynamic data (employees, routes, places).
- **GeoJSON:** Use WGS84 [lng, lat] for MapLibre GeoJSON sources.
- **Stores:** Reuse `selectedEmployee`, `displayedRoutes`, `placeFilter`, `fullEmployeeData`, `selectedActiveJobData`, `regionOverlayEnabled`, `travelModeState`, `currentGameState`, `placeGoods` — no duplication of state.

---

## 6. Testing and “To map” default

- After Step 1, verify “To map” from EmployeeCard: either switch to MapLibre tab and pan/zoom, or switch to Leaflet and in a follow-up change the default tab to MapLibre.
- After each step, manually test the new behavior on the MapLibre tab; keep Leaflet tab working.
- Optional: add a query param or setting “preferred map = maplibre” so “To map” opens MapLibre by default once parity is done.

This completes the plan. Implement steps 1–10 in order; each step can be one agent task.
