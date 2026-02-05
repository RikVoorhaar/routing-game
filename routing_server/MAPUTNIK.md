# Using Maputnik for Map Style Editing

Maputnik is an interactive visual editor for MapLibre/Mapbox GL styles.

## Starting Maputnik

```bash
cd routing_server
docker compose --profile maputnik up -d maputnik
```

Then open http://localhost:8888

## Loading the Current Style

1. In Maputnik, click **Open** → **Upload**
2. Select `routing_server/map-style.json`
3. The style will load with the `europe` vector tile source pointing to Martin at `http://localhost:3000/europe`

## Editing the Style

- Click on layers in the left panel to edit their properties
- Use the visual editors for colors, widths, filters, etc.
- Changes are previewed in real-time
- The map will fetch tiles from your local Martin server

## Exporting Your Changes

1. Click **Export** in the top menu
2. Choose **Download** to save the updated style JSON
3. Copy the relevant parts back to `routing-app/src/lib/components/RouteMapMaplibre.svelte`

### Important Notes

- The exported style will have the full JSON structure
- You only need to copy the `layers` array and update the `baseStyle` object in the Svelte component
- The `active_places_with_geom` overlay is added separately in the Svelte component and won't appear in Maputnik
- Keep the `getTileServerUrl()` logic for the source URL (don't hardcode `localhost:3000`)

## Stopping Maputnik

```bash
docker compose --profile maputnik down maputnik
```

Or to stop all services including Maputnik:

```bash
docker compose --profile maputnik down
```

## Current Style Location

- **Standalone JSON**: `routing_server/map-style.json` (for Maputnik)
- **Svelte Component**: `routing-app/src/lib/components/RouteMapMaplibre.svelte` (production style)
