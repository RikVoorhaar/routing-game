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
    - **TravelDestinationMarker.svelte** — travel destination and "Start travel" in popup.
    - **PlacesRenderer.svelte** — POIs from tile API + IndexedDB, Leaflet markers + MarkerClusterGroup; click → place filter / select; popups use `createPlacePopupHTML` (supply/demand, amount, "Accept job").
  - **"To map" behavior:** `EmployeeCard.svelte` → `handleGoToMap` calls `selectEmployee(employee.id)` and `switchToTab('map')`. RouteMap reacts to `$selectedEmployee` and calls `handleEmployeeSelection` → either `leafletMap.setView([lat, lon], zoom)` (idle) or `zoomToRoute(activeRoute)` (active job).
  - **Route display:** `updateDisplayedRoutes()` in RouteMap builds `displayedRoutes` from `$selectedActiveJobData` (preview), `$fullEmployeeData` (active + travel jobs), and `$displayedRoutes`; `zoomToRoute` uses `L.latLngBounds` + `fitBounds`.
  - **Region overlay:** Toggle in `GameState.svelte` controls `regionOverlayEnabled` store; `loadNutsGeoJson()` loads from static file `/regions/combined_01m.geojson`.

### 1.3 Data and stores
- **Map display:** `routing-app/src/lib/stores/mapDisplay.ts` — `displayedRoutes`, `DisplayableRoute`, `RouteDisplay`, `mapDisplayActions` (addRoute, removeRoute, selectRoute), style presets (SELECTED, ACTIVE, PREVIEW, etc.).
- **Selection:** `selectedEmployee` (`$lib/stores/selectedEmployee`), `selectedRoute` (`$lib/stores/selectedRoute`), `selectedActiveJobData` / `clearSelectedJob` (`$lib/stores/selectedJob`).
- **Game data:** `fullEmployeeData`, `currentGameState`, `gameDataAPI` in `$lib/stores/gameData.ts`. Employee position: `employee.location` (Coordinate: lat/lon).
- **Routes:** `getRoute`, `prefetchRoutes` in `$lib/stores/routeCache.ts`. Route data: `PathPoint[]` with `coordinates.lat/lon`.
- **Places / POIs:**
  - **Schema:** `places` and `active_places` in `routing-app/src/lib/server/db/schema.ts`. Existing view for Martin: `drizzle/0020_active_places_with_geom.sql` (place_id, region_id, category_id, geom).
  - **POI data via Martin (not tile API):** POI data for the MapLibre map should be loaded via Martin vector tiles, not the legacy tile API + IndexedDB. The raw `places` table is not directly useable by the tile server (e.g. it has only category_id/region_id, no human-readable category/region names for tile properties; and/or Martin expects a view with a single geometry column and MVT-friendly properties). A separate implementation step (or migration) must **prepare a Martin-servable table or view based on `places`** — e.g. a view that joins `places` with `categories` and `region` so each row has `place_id`, `category` (name), `region_code`, and `geom`, and optionally restricts to `active_places` so only the game subset is served. That view is then what MapLibre uses as the POI vector-tile source; no tile API or client-side POI cache for the MapLibre tab.
  - **Legacy (Leaflet):** `loadPlacesForTiles` in `routing-app/src/lib/map/placesLoader.ts`; `getPlacesForVisibleTilesGrouped` in `routing-app/src/lib/map/placesGetter.ts`; tile API `GET /api/places/[tile_x]/[tile_y]` and IndexedDB cache remain for the Leaflet map until it is retired.
  - **⚠️ TODO: Delete legacy tile API endpoints once MapLibre migration is complete:**
    - `GET /api/places/tiles` - Returns list of all tiles with places data (used by `placesBackgroundLoader.ts` for prefetching)
    - `GET /api/places/[tile_x]/[tile_y]` - Returns gzipped places data for a specific tile (used by `placesLoader.ts`)
    - These endpoints are only used by the old Leaflet map system. MapLibre uses Martin vector tiles directly, so these can be removed once Leaflet is retired.
  - **Place filter:** `placeFilter` store (`$lib/stores/placeFilter.ts`) — `PlaceFilter { selectedPlaceId, selectedGood, filterType, targetType }`. `createPlaceFilterPredicate` in `$lib/places/placeFilter.ts` filters by supply/demand/good.
  - **Place goods:** `placeGoods` store, `placeGoodsConfig` (`$lib/config/placeGoodsTypes.ts`), `selectPlaceGoods` in `$lib/places/placeGoodsSelection.ts`; supply amount: `$lib/places/supplyAmount.ts`.
- **Job from two POIs:** `POST /api/jobs/accept-from-places` — body `{ employeeId, gameStateId, supplyPlaceId, demandPlaceId }`; see `routing-app/src/routes/api/jobs/accept-from-places/+server.ts`.
- **Popups (content only):** `routing-app/src/lib/components/map/popups/placePopup.ts` — `createPlacePopupHTML(...)` (supply/demand, amount, job value, "Accept job" button). Prefer replacing with Svelte components instead of generated HTML.

### 1.4 Region overlay (NUTS)
- **Store:** `regionOverlayEnabled`, `NUTS_HOVER_MAX_ZOOM`, `NUTS_LEVEL` in `$lib/stores/regionOverlay.ts`.
- **Leaflet:** `$lib/map/nutsOverlay.ts` — `loadNutsGeoJson()` (static `/regions/combined_01m.geojson`), `createNutsLayer(L, geojson)`, `setNutsInteractivity(map, layer, ...)`. GeoJSON is EPSG:3857; converted to WGS84 for Leaflet. NUTS level 2; show at some zoom levels, hover highlight below `NUTS_HOVER_MAX_ZOOM` (8).
- **MapLibre:** `$lib/components/map/maplibre/RegionBorders.svelte` — loads from `/api/regions/geojson` API endpoint (queries `regions` table), caches in IndexedDB, displays with `FillLayer` and `LineLayer`.

### 1.5 Travel mode
- **Stores:** `travelModeState`, `travelModeActions`, `isInTravelMode` in `$lib/stores/travelMode.ts`. Travel destination marker and "Start travel" are in Leaflet's `TravelDestinationMarker.svelte`.

---

## 2. Architecture and constraints

- **UI:** Use **Svelte components only** for all map-related UI (markers, popups, panels). **No generated HTML** (no `createXPopupHTML` or `innerHTML` for map content); use Svelte components rendered in the DOM (e.g. absolute-positioned overlays or MapLibre popup/marker slots if the library supports it).
- **Performance:** Prefer MapLibre **vector layers and one GeoJSON/source update** over many DOM markers where possible. For POIs: small circle/symbol layer with filter; for "popup" content use a single Svelte panel bound to selected feature/place. Avoid clustering; **draw POIs smaller** and rely on **filter UI** to find specific supply/demand.
- **Libraries:** Keep **svelte-maplibre-gl** for the map. Use **maplibre-gl** types and API for programmatic control (flyTo, getBounds, etc.). No Leaflet in the MapLibre tab.
- **State:** Reuse existing stores (`selectedEmployee`, `displayedRoutes`, `placeFilter`, `fullEmployeeData`, `selectedActiveJobData`, `regionOverlayEnabled`, `travelModeState`, etc.) so both tabs stay in sync when switching; "To map" should be able to switch to the MapLibre tab and pan/zoom the same way (see "Pan/zoom on 'To map'" below).
- **Tab behavior:** "To map" from EmployeeCard currently switches to `'map'` (Leaflet). Have it switch to a single "map" tab that uses MapLibre.

---

## 3. Implementation steps (in order)

Each step is intended for one AI agent run. Do them sequentially.

**Note on step ordering:** Step 4 (Active and previewed routes) has been moved to after Step 6 (Second POI selection and "Start job") because the route preview/job selection UI is broken in Leaflet. This means:
- Travel time computation must be correct for Step 6 even though routes are not yet displayed on the map
- Travel time should be shown in the POI popup (Step 5)
- Proper testing of the "Start job" logic will require route display to be implemented (Step 7)

---

### Step 1: Map control and "To map" pan/zoom ✅ COMPLETE

**Goal:** Get a reference to the MapLibre map instance, expose center/zoom reactively, and pan/zoom when the user clicks "To map" for an employee (and optionally when selecting a route).

**Where:**
- `RouteMapMaplibre.svelte` — add bind to map instance if svelte-maplibre-gl exposes it (e.g. `bind:this` or `getMap` callback). Check `svelte-maplibre-gl` docs/package for how to get the underlying `maplibre-gl` map.
- Same file or a small `useMapLibreMap.ts` — provide a way to call `map.flyTo({ center: [lng, lat], zoom })` and `map.fitBounds(bounds, options)`.

**Tasks:**
1. ✅ In `RouteMapMaplibre.svelte`, obtain the raw MapLibre map instance (from child ref or event/callback from `MapLibre`).
   - **Implementation:** Used `bind:map={mapInstance}` prop binding on `MapLibre` component (per svelte-maplibre-gl API).
2. ✅ Subscribe to `selectedEmployee` (and optionally `selectedRoute`). When `selectedEmployee` is set:
   - Resolve employee position from `fullEmployeeData` (reuse logic from Leaflet's `getEmployeePosition` in RouteMap.svelte).
   - If employee has an active job with route: get route path from `displayedRoutes` or by fetching route data, compute bounds, call `map.fitBounds(bounds, { padding: 20 })`.
   - Else: call `map.flyTo({ center: [lon, lat], zoom: currentZoom or 14 })`.
   - **Implementation:** Added reactive statement that handles both cases (active job with route → fitBounds, idle → flyTo). Reused `getEmployeePosition()` logic from Leaflet RouteMap.
3. ✅ Ensure "To map" from EmployeeCard can switch to the MapLibre tab: either pass a query/flag so GameState switches to `map_maplibre`, or for this step only switch to `map` and in a later step change to MapLibre. Document the choice.
   - **Implementation:** Updated `EmployeeCard.svelte`'s `handleGoToMap()` to call `switchToTab('map_maplibre')` instead of `'map'.

**Acceptance:** ✅ Clicking "To map" for an employee opens the map tab, and the map pans/zooms to that employee (or to the route if they have an active job).

---

### Step 2: Employee positions (and animation when moving) ✅ COMPLETE

**Goal:** Show each employee as a marker on the MapLibre map; if they have an active or travel job with a route, animate position along the path.

**Where:**
- New component e.g. `routing-app/src/lib/components/map/maplibre/EmployeeMarkers.svelte` (or under a single `RouteMapMaplibreLayers.svelte` that composes all overlay components).
- Reuse animation idea from Leaflet: `MarkerRenderer.svelte` uses `animationTimestamp` and `routesByEmployee` to interpolate position along `path` (see RouteMap.svelte `routesByEmployee` and MarkerRenderer's use of it).

**Tasks:**
1. ✅ Add a **GeoJSON source** (or single source with FeatureCollection) for "employee positions". Data: one point per employee; properties: employee id, name, etc. Use a **symbol or circle layer** to render them (no HTML markers if we can avoid it for performance).
2. ✅ Derive positions: from `fullEmployeeData` — if employee has active/travel job with `startTime`, use interpolated position along route (same formula as Leaflet: progress based on elapsed time and path length); else use `employee.location`.
3. ✅ Run an animation loop (e.g. requestAnimationFrame or 30 FPS timer) that updates a store (e.g. `animationTimestamp`) and recomputes positions; update the GeoJSON source from Svelte.
4. ✅ Style: distinct color/shape for selected employee (from `selectedEmployee` store).

**Acceptance:** ✅ All employees visible on map; moving employees (on job/travel) animate along their route; selected employee visually distinct.

**Implementation Details:**
- ✅ Created `EmployeeMarkers.svelte` component using `GeoJSONSource` and `CircleLayer` from `svelte-maplibre-gl`
- ⚠️ **TODO:** Replace CircleLayer with emoji symbols (SymbolLayer) - attempted but not working, needs investigation
- ✅ GeoJSON FeatureCollection contains one Point feature per employee with properties: `employeeId`, `employeeName`, `isSelected`, `isAnimated`
- ✅ `getEmployeeCurrentPosition()` checks for active/travel jobs, calculates elapsed time, and uses `interpolateLocationAtTime()` to interpolate along route path
- ✅ Route paths retrieved from `displayedRoutes` store by matching route IDs (`active-{jobId}` or `travel-{jobId}`)
- ✅ Animation loop uses `setInterval` with 33ms interval (30 FPS) to update `animationTimestamp` when employees have active/travel jobs
- ✅ Reactive statements watch `animationTimestamp`, `fullEmployeeData`, `selectedEmployee`, and `displayedRoutes` to trigger position updates
- ✅ CircleLayer uses MapLibre data-driven styling: selected employees (radius 8px, red `#dc2626`, stroke 2px), animated employees (blue `#3b82f6`), idle employees (green `#10b981`), all with white stroke
- ✅ Integrated into `RouteMapMaplibre.svelte` as a child component within the `MapLibre` component
- ✅ Fixed pan/zoom to only trigger on actual employee selection changes (not on tab switches) by tracking `lastHandledEmployeeId`
- ✅ Map state (center/zoom) persisted to localStorage and restored on load; defaults only used if no stored state exists
- ⚠️ **Note:** Route animation testing is limited - the Leaflet version has bugs preventing route starts, so full animation testing will need to wait until routes can be started successfully

---

### Step 3: Region borders (NUTS) at some zoom levels ✅ COMPLETE

**Goal:** Display NUTS region borders at appropriate zoom levels, with optional hover highlight (no click yet).

**Where:**
- `routing-app/src/routes/api/regions/geojson/+server.ts` — API endpoint that queries `regions` table and converts PostGIS geometry (EPSG:3857) to GeoJSON (WGS84 [lng, lat]).
- `routing-app/src/lib/stores/regionsCache.ts` — IndexedDB cache utility for regions GeoJSON (regions are static, cache persists across reloads).
- `routing-app/src/lib/components/map/maplibre/RegionBorders.svelte` — MapLibre component with GeoJSON source + fill/line layers.
- `routing-app/src/lib/components/GameState.svelte` — Added Regions toggle UI for MapLibre tab (matches Leaflet tab).

**Tasks:**
1. ✅ Create API endpoint `/api/regions/geojson` that queries `regions` table using Drizzle ORM, transforms geometry from EPSG:3857 to WGS84 using `ST_Transform`, and converts to GeoJSON using `ST_AsGeoJSON`.
2. ✅ Create IndexedDB cache utility (`regionsCache.ts`) following pattern from `routeCache.ts` — cache-first loading strategy.
3. ✅ Create `RegionBorders.svelte` component:
   - Loads regions from API with IndexedDB caching (check cache first, fetch from API on miss, store in cache)
   - Uses `GeoJSONSource` with `FillLayer` (low opacity fill) and `LineLayer` (blue outline)
   - Reacts to `regionOverlayEnabled` store to show/hide layers
   - Style matches Leaflet: `#3b82f6` blue, 0.1 fill opacity, 0.6 line opacity, 1px width
4. ✅ Add Regions toggle UI in `GameState.svelte` for MapLibre tab (matches Leaflet tab toggle).
5. ✅ Integrate `RegionBorders` component into `RouteMapMaplibre.svelte`.

**Implementation Details:**
- ✅ API endpoint uses PostGIS `ST_Transform(geom::geometry(MultiPolygon, 3857), 4326)` then `ST_AsGeoJSON()` to convert to GeoJSON
- ✅ IndexedDB cache uses single key `'regions-geojson'` since regions are static data
- ✅ Component loads regions once on mount, caches in IndexedDB for subsequent loads
- ✅ Layers use MapLibre `layout.visibility` property bound to `regionOverlayEnabled` store
- ✅ Optional zoom restriction (zoom <= 8) can be added later if needed for performance

**Acceptance:** ✅ Toggle "Regions" shows NUTS borders on the MapLibre map; regions loaded from database via API; IndexedDB caching works; style matches Leaflet (blue outline, light fill).

---

### Step 4: POIs from places via Martin — no clustering, small symbols ✅ COMPLETE

**Goal:** Show POIs as small circles/symbols from **Martin vector tiles**; no clustering. POIs only need to indicate "something here"; finding a specific type is done via filter UI (later step).

**Where:**
- `routing-app/drizzle/0025_enhanced_active_places_with_geom.sql` — Database migration creating enhanced view with category_name and region_code.
- `routing-app/drizzle/0026_add_active_places_place_id_index.sql` — Database migration adding critical index on `active_places.place_id` for JOIN performance.
- `routing-app/src/lib/components/map/maplibre/PlacesLayer.svelte` — MapLibre component rendering POIs from Martin vector tiles.
- `routing_server/martin-config.yaml` — Martin configuration with explicit table config including minzoom: 8 for places.
- `routing_server/docker-compose.yml` — Increased PostgreSQL shared memory to 512MB for MVT tile generation.

**Tasks:**
1. ✅ Created `enhanced_active_places_with_geom` view that joins `active_places` with `places`, `categories`, and `region` to include `category_name` and `region_code`.
2. ✅ Added critical index on `active_places.place_id` for fast JOINs (reduces query time from 1m23s to <1s for COUNT(*)).
3. ✅ Created `PlacesLayer.svelte` component using `VectorTileSource` and `CircleLayer` from `svelte-maplibre-gl`.
4. ✅ Configured Martin with explicit table configuration including `minzoom: 8` so places only show at zoom 8+ (regions show at zoom 7 and below).
5. ✅ Set circle radius to 3px (small, no clustering).
6. ✅ Added `placeFilter` store import (structure for Step 5 filtering implementation).
7. ✅ Increased PostgreSQL shared memory from 64MB to 512MB to prevent "No space left on device" errors during MVT tile generation.

**Implementation Details:**
- ✅ View created: `enhanced_active_places_with_geom` with columns: `place_id`, `category_name`, `region_code`, `created_at`, `geom`
- ✅ Index added: `active_places_place_id_idx` on `active_places(place_id)` — critical for JOIN performance with 340k+ rows
- ✅ Martin config: Explicit table configuration with `id_column: place_id`, `minzoom: 8`, `maxzoom: 22`, and properties mapping
- ✅ Zoom restrictions: Places show at zoom 8+ (Martin won't serve tiles below zoom 8), regions show at zoom 7 and below
- ✅ Performance: Tile requests are fast (~10ms), COUNT(*) queries are <1s after index and ANALYZE
- ✅ Shared memory fix: Increased PostgreSQL `shm_size` to 512MB to handle MVT tile generation for large datasets

**Acceptance:** ✅ POIs are loaded via Martin vector tiles from `enhanced_active_places_with_geom` view; they appear as small circles (3px radius, no clustering); places only show at zoom 8+; regions show at zoom 7 and below; performance is optimized with proper indexes and shared memory configuration.

---

### Step 5: POI click → Svelte popup (supply/demand, good type, amount) ✅ COMPLETE

**Goal:** Clicking a POI opens a popup (Svelte component, no generated HTML) showing place info: supply or demand, good type, amount (and later "Accept job" when a second POI is selected).

**Where:**
- New Svelte component e.g. `routing-app/src/lib/components/map/maplibre/PlacePopup.svelte` — receives `place`, `placeGoodsConfig`, selected goods, supply amount, etc., and displays them (reuse data logic from `createPlacePopupHTML` / PlacesRenderer).
- MapLibre: use map `click` (or `mouseup`) on the places layer; query features under cursor (`map.queryRenderedFeatures`), get place id, then look up full place + goods from stores/API and show the popup.

**Tasks:**
1. ✅ On MapLibre `click`, if the click is on the places layer, get feature's place id (and any other props). Resolve full place (from places cache or by tile) and compute `selectPlaceGoods`, supply amount, etc. (same as Leaflet PlacesRenderer).
2. ✅ Add a **single** popup UI: a Svelte component rendered in the DOM (e.g. absolute div next to the map), positioned at clicked point (or above it). Pass in `place`, goods info, amounts. No `innerHTML`; all content is Svelte.
3. ✅ Popup shows: region, type (Supply/Demand), good name, amount (for supply). For demand, show travel time to the POI (computed from route data even though routes are not yet displayed on the map). Optionally show job value/duration/XP when we have a selected supply (next step).
4. ✅ Added zoom-based scaling: popup scales from 66% at zoom 12 to 100% at zoom 16+.
5. ✅ Updated POI circle size: circles scale from 3px at zoom ≤12 to 8px at zoom 16+ (linear interpolation).

**Implementation Details:**
- ✅ Created `PlacePopup.svelte` component using Tailwind/DaisyUI (no `<style>` tags)
- ✅ Added click handler in `RouteMapMaplibre.svelte` using `map.queryRenderedFeatures()` on `'active-places-circles'` layer
- ✅ Extracts place data from vector tile feature properties (`place_id`, `category_name`, `region_code`) and geometry coordinates
- ✅ Computes `selectedGoods` using `selectPlaceGoods()`, `supplyAmount` using `generateSupplyAmount()`
- ✅ For demand nodes: computes travel time from selected employee to demand place via `/api/travel/route` API
- ✅ Computes job value and XP for demand nodes when employee and route data are available
- ✅ Popup positioned using `map.project()` to convert lng/lat to pixel coordinates
- ✅ Popup position updates on map move/zoom events to stay aligned with POI
- ✅ Popup scales with zoom: 66% at zoom 12, linear interpolation to 100% at zoom 16+
- ✅ POI circle radius uses MapLibre zoom interpolation: 3px at zoom 8-12, linear increase to 8px at zoom 16
- ✅ Close button and click-outside-to-close functionality

**Acceptance:** ✅ Click POI → Svelte popup with correct supply/demand, good type, and amount; no raw HTML strings. Popup scales smoothly with zoom level. POI circles scale appropriately at higher zoom levels.

---

### Step 5.5: Color-code POIs by supply/demand type and add icons for good categories

**Goal:** Visually distinguish POIs using:
1. **Colors** for supply vs demand: Supply POIs in one color (e.g., green), demand POIs in another color (e.g., orange/red).
2. **Icons** for good type categories: Each good type (e.g., "electronics", "food", "clothing") should have a distinct icon overlay on the POI circle.

This requires computing supply/demand type and good type on the frontend for each POI.

**Where:**
- `routing-app/src/lib/components/map/maplibre/PlacesLayer.svelte` — Update `CircleLayer` for color-coding and add `SymbolLayer` for icons.
- Since supply/demand and good type are deterministic based on `gameState.seed` and `place.id`, we can compute them client-side using `selectPlaceGoods()` from `placeGoodsSelection.ts`.
- Icon mapping: Define a mapping from good type strings to icon names/URLs (e.g., emoji, SVG icons, or icon font glyphs).

**Tasks:**
1. Compute supply/demand type and good type for each POI feature using `selectPlaceGoods(gameState.seed, placeId, categoryGoods)`.
2. Use MapLibre data-driven styling (`circle-color` with expressions) to color-code circles:
   - Supply POIs: green (e.g., `#10b981` or `#22c55e`)
   - Demand POIs: orange/red (e.g., `#f97316` or `#ef4444`)
3. Add a `SymbolLayer` on top of the `CircleLayer` to display icons:
   - Use `icon-image` property with data-driven expressions based on good type
   - Icons should be small (e.g., 12-16px) and centered on the circle
   - Define icon mapping: `{ goodType: iconName }` (e.g., `{ "electronics": "⚡", "food": "🍔", "clothing": "👕" }`)
   - Consider using emoji, icon fonts (e.g., Font Awesome), or custom SVG sprites
4. Handle edge cases: when `gameState` or `placeGoodsConfig` is not yet loaded, use default color (current blue) and no icon.
5. Ensure computation is efficient — consider caching computed types per place ID if needed for performance.

**Implementation Notes:**
- MapLibre expressions can use `['get', 'property_name']` to access feature properties, but we need to compute supply/demand and good type dynamically.
- For icons, MapLibre supports:
  - **Emoji**: Can be used directly in `text-field` with `SymbolLayer` (but requires text layer, not icon-image)
  - **Icon fonts**: Load icon font, use `text-field` with icon font glyph codes
  - **SVG sprites**: Add icons to map style's sprite sheet, reference via `icon-image`
  - **Image URLs**: Load images and add to map style, reference via `icon-image`
- Recommended approach: Use `SymbolLayer` with `text-field` and emoji or icon font glyphs for simplicity, or add icons to map style sprite sheet for better control.
- Options for supply/demand computation:
  - **Option A**: Add `supply_demand_type` and `good_type` as properties in the Martin view (requires backend change, but most efficient).
  - **Option C**: Use separate layers for supply and demand POIs, filtered by computed type (requires client-side filtering of features).
  - **Option D**: Use a GeoJSON source instead of vector tiles, compute supply/demand and good type when building the GeoJSON, then use data-driven styling (more flexible but loses vector tile performance benefits).
- Recommended: **Option A** (backend enhancement) for best performance, or **Option C** (separate filtered layers) for frontend-only solution.

**Acceptance:** 
- Supply POIs appear in green, demand POIs appear in orange/red.
- Each POI displays an icon representing its good type category.
- Colors and icons update correctly when game state or place goods config changes.

---

### Step 6: Second POI selection and "Start job"

**Goal:** Allow selecting a second POI after the first: first click = supply (or demand), second = the other; then show "Start job" and call accept-from-places API.

**Important:** Travel time computation must be correct for this step, even though routes are not yet displayed on the map (route display is implemented in Step 7). The travel time should be computed from route data and shown in the popup/UI when selecting POIs. Note that proper testing of the "Start job" logic will require route display to be implemented (Step 7).

**Where:**
- Reuse `placeFilter` store concept: first selection sets "supply" or "demand" and the selected place; second selection sets the other. Alternatively introduce a small "job draft" store: `{ supplyPlaceId, demandPlaceId } | null`.
- `POST /api/jobs/accept-from-places` — body `{ employeeId, gameStateId, supplyPlaceId, demandPlaceId }`. Need `selectedEmployee` and `currentGameState`.

**Tasks:**
1. Define flow: e.g. first POI click → if supply, store as "supply place"; if demand, store as "demand place". Second POI click → set the other leg. If both set, show "Start job" in popup or in a small floating panel.
2. In the Svelte popup (or a small "Job draft" panel): when one place is selected, show "Select a [demand/supply] place to create a job". When both selected, show both names and a "Start job" button.
3. On "Start job": call `POST /api/jobs/accept-from-places` with `selectedEmployee`, `currentGameState.id`, `supplyPlaceId`, `demandPlaceId`. On success, refresh game data (e.g. `gameDataAPI.loadAllEmployeeData()`), clear the two-place selection, close popup. On error, show message.
4. Visually distinguish the two selected POIs on the map (e.g. different color or ring).

**Acceptance:** User can select supply then demand (or vice versa); "Start job" creates the job and updates the game; selection state is clear on the map. Travel time computation is correct even though routes are not yet displayed.

---

### Step 7: Active and previewed routes

**Goal:** Draw the active route and the currently previewed job route (when a job is selected in the list) as lines on the map.

**Where:**
- `mapDisplay.ts` — same `displayedRoutes` and `DisplayableRoute` structure. Route path: array of points with `coordinates.lat`, `coordinates.lon` (or parse from `routeData`).
- New component or layer in RouteMapMaplibre: one GeoJSON source for "routes" (MultiLineString or multiple LineString features), with a property for route id and type (active/preview/available). One line layer (or more for different styles).

**Tasks:**
1. Subscribe to `displayedRoutes` and optionally `selectedRoute`. Build a GeoJSON FeatureCollection of LineString features from `route.path` (or parsed route data). Properties: routeId, isActive, isPreview, isSelected.
2. Add a MapLibre source (e.g. `routes`) and a line layer. Use data-driven paint (e.g. `line-color`, `line-width`) from feature properties so active/preview/selected have different colors/weights (reuse colors from `mapDisplay.ts` ROUTE_STYLES).
3. Ensure routes update when `fullEmployeeData`, `selectedActiveJobData`, or `selectedRoute` change (same reactive deps as Leaflet's `updateDisplayedRoutes`).

**Acceptance:** Active job and travel routes and the preview route (when a job is selected) appear as lines with correct styles; selection state is visible.

---

### Step 8: Travel destination and travel mode on MapLibre

**Goal:** Show travel destination marker when in travel mode; allow starting travel from the map (same behavior as Leaflet's TravelDestinationMarker).

**Where:**
- `TravelDestinationMarker.svelte` (Leaflet) — shows a marker at travel destination; popup with "Start travel". Use `travelModeState`, `travelModeActions.startTravel(travelJobId)`.
- MapLibre: add a point (or symbol) for the travel destination when `travelModeState.employeeId` and destination exist; add a Svelte popup/panel with "Start travel" button that calls `travelModeActions.startTravel`.

**Tasks:**
1. From `fullEmployeeData` and `travelModeState`, get the travel job and its destination (route end). Add one feature to a "travel-destination" source or a separate layer.
2. On click on that destination, open a small Svelte panel with "Start travel" and optional employee name. Button calls `travelModeActions.startTravel(travelJobId)`.
3. Style so it's visually distinct from job POIs and employee markers.

**Acceptance:** Travel destination is visible; clicking it and "Start travel" starts the travel job as in Leaflet.

---

### Step 9 (New): Clickable regions — region experience and points

**Goal:** Make NUTS regions clickable; on click show a panel with "region experience" and "points" for that region.

**Where:**
- Backend: today there is no "region XP" or "region points" in schema. Options: (1) Add `region_experience` (or similar) table/keyed by region_id and game_state (e.g. sum of XP from jobs that started/ended in that region), and an API to return it. (2) Or compute on the fly from active_jobs / history. (3) Or show placeholder "Region: name, code" and "XP / Points: coming soon" until backend exists. Plan for (3) in UI, with a clear extension point for (1).
- MapLibre: use `queryRenderedFeatures` on the regions layer on click; get region id or code from feature properties. Ensure the GeoJSON source for regions includes `id` and name/code in properties.

**Tasks:**
1. Ensure region features in the GeoJSON (or vector source) have properties: at least region id/code and name. Add a click handler on the regions layer.
2. Add a Svelte component e.g. `RegionPanel.svelte` that shows region name, code, and "Experience: …", "Points: …". For now these can be placeholders or "—"; later an API can feed real values.
3. Optional: backend — add endpoint e.g. `GET /api/game-states/[id]/region-stats` returning per-region XP/points; then wire RegionPanel to it.

**Acceptance:** Clicking a region opens a Svelte panel with region info and placeholders for experience/points; no generated HTML.

---

### Step 10 (New): POI filter UI — by supply type and amount

**Goal:** UI to filter POIs by supply type (good) and optionally by "amount offered" (e.g. min amount), so the map only shows matching POIs.

**Where:**
- `placeFilter` store and `createPlaceFilterPredicate` already support "show places that supply/demand good X". Extend to "min amount" or "amount range" for supply.
- New component: e.g. `POIFilterPanel.svelte` — dropdown or list for good type (from placeGoods config), toggle supply/demand, optional number input for "min amount" (supply). Apply filter to the POI layer source (or to the list that feeds the GeoJSON source).

**Tasks:**
1. Extend `PlaceFilter` (or a separate "POI filter" store) with e.g. `minSupplyAmount: number | null` and ensure the predicate used for the MapLibre POI source filters by it (compare with `generateSupplyAmount` / stored amount).
2. Add `POIFilterPanel.svelte`: good type selector, supply/demand, min amount. Use Tailwind + DaisyUI; place it as a floating panel on the map (same as Leaflet's place filter indicator).
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
  - **PlacePopup.svelte** — Svelte popup content (supply/demand, amount, "Start job" when two selected).
  - **RegionPanel.svelte** — Region name, XP/points (placeholder or API).
  - **POIFilterPanel.svelte** — Filter by good type and amount.
  - **TravelDestinationMarker.svelte** (MapLibre version) — or inline into orchestrator.

Keep popups/panels as Svelte components in the DOM (absolute/fixed), not inside the map canvas; use a single "selected feature" state (place or region) to show one popup/panel at a time.

---

## 5. Libraries and references

- **svelte-maplibre-gl:** Check repo/docs for how to get the underlying `Map` instance (e.g. slot or callback).
- **maplibre-gl:** `map.flyTo()`, `map.fitBounds()`, `map.queryRenderedFeatures()`, `map.getBounds()`, `map.getZoom()`. Use GeoJSON sources and `setData()` for dynamic data (employees, routes, places).
- **GeoJSON:** Use WGS84 [lng, lat] for MapLibre GeoJSON sources.
- **Stores:** Reuse `selectedEmployee`, `displayedRoutes`, `placeFilter`, `fullEmployeeData`, `selectedActiveJobData`, `regionOverlayEnabled`, `travelModeState`, `currentGameState`, `placeGoods` — no duplication of state.

---

## 6. Testing and "To map" default

- After Step 1, verify "To map" from EmployeeCard: either switch to MapLibre tab and pan/zoom, or switch to Leaflet and in a follow-up change the default tab to MapLibre.
- After each step, manually test the new behavior on the MapLibre tab; keep Leaflet tab working.
- Optional: add a query param or setting "preferred map = maplibre" so "To map" opens MapLibre by default once parity is done.

This completes the plan. Implement steps 1–10 in order; each step can be one agent task.
