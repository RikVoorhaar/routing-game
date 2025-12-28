# Knip Dead Code Analysis & Recommendations

This document contains all findings from knip and recommendations for each item.

## Unused Files (13)

### ✅ KEEP - SvelteKit Convention

- **`src/hooks.server.ts`** - KEEP
  - **Reason**: SvelteKit automatically loads `hooks.server.ts` files. This is a false positive.
  - **Action**: Add to knip ignore list

### ❌ REMOVE - Unused Scripts

- **`scripts/cleanup-routes.ts`** - REMOVE

  - **Reason**: One-off utility script, not imported anywhere
  - **Action**: Delete file

- **`scripts/test-complete-cheat.ts`** - REMOVE

  - **Reason**: Test script, not imported anywhere
  - **Action**: Delete file

- **`src/scripts/parallel-profile.ts`** - REMOVE

  - **Reason**: Profiling script, not imported anywhere
  - **Action**: Delete file

- **`src/scripts/profile-job-generation.ts`** - REMOVE

  - **Reason**: Profiling script, not imported anywhere
  - **Action**: Delete file

- **`src/scripts/simple-profile.ts`** - REMOVE
  - **Reason**: Profiling script, not imported anywhere
  - **Action**: Delete file

### ❌ REMOVE - Unused Components/Modules

- **`src/lib/components/UpgradesPanelPlaceholder.svelte`** - REMOVE

  - **Reason**: Placeholder component, not imported anywhere
  - **Action**: Delete file

- **`src/lib/index.ts`** - ❌ REMOVE

  - **Reason**: SvelteKit's `$lib` alias points directly to `src/lib`, not to `src/lib/index.ts`. All imports use specific paths like `$lib/server/db` or `$lib/formatting`, not the barrel export.
  - **Action**: Delete file (barrel exports not needed with SvelteKit's $lib alias)

- **`src/lib/server/auth/index.ts`** - ❌ REMOVE

  - **Reason**: Not imported anywhere. The actual auth setup is in `src/auth.ts` which uses `./lib/server/auth/password` instead.
  - **Action**: Delete file (duplicate/unused auth implementation)

- **`src/lib/server/config/types.ts`** - ✅ KEEP

  - **Reason**: Re-exports `GameConfig` from `$lib/config/types` for backward compatibility. Types are used via the re-export pattern which knip may not detect.
  - **Action**: Keep file (false positive - re-exports are used)

- **`src/lib/server/db/spatial-indexes.ts`** - ❌ REMOVE

  - **Reason**: Functionality is duplicated in `schema.ts`. `init-db.ts` uses `schema.createSpatialIndexes(db)` from schema.ts, not this file.
  - **Action**: Delete file (duplicate functionality)

- **`src/lib/server/vehicleUtils.ts`** - REMOVE

  - **Reason**: Not imported anywhere
  - **Action**: Delete file

- **`src/lib/stores/activeJobs.ts`** - ✅ KEEP

  - **Reason**: IS USED! Exports `ActiveJob` type, `cachedActiveJobs`, `selectedActiveJob`, and utility functions that are imported in `JobCard.svelte`, `RouteMap.svelte`, `MarkerRenderer.svelte`, and other components.
  - **Action**: Keep file (false positive - knip missed Svelte component imports)

---

## Unused Dependencies (4)

### ❌ REMOVE

- **`@oslojs/crypto`** - REMOVE

  - **Reason**: Code uses native `crypto.randomUUID()`, not @oslojs/crypto
  - **Action**: Remove from package.json

- **`@oslojs/encoding`** - REMOVE

  - **Reason**: Not imported anywhere
  - **Action**: Remove from package.json

- **`@tailwindcss/typography`** - REMOVE

  - **Reason**: Not included in tailwind.config.js plugins
  - **Action**: Remove from package.json

- **`svelte-leafletjs`** - REMOVE
  - **Reason**: Code uses `leaflet` directly via dynamic imports, not svelte-leafletjs wrapper
  - **Action**: Remove from package.json

---

## Unused DevDependencies (3)

### ❌ REMOVE

- **`0x`** - REMOVE

  - **Reason**: Profiling tool, not used in scripts
  - **Action**: Remove from package.json

- **`clinic`** - REMOVE

  - **Reason**: Profiling tool, not used in scripts
  - **Action**: Remove from package.json

- **`ts-node`** - ❌ REMOVE
  - **Reason**: Not used in any scripts. All scripts use `tsx` instead (via NODE_OPTIONS='--import=tsx').
  - **Action**: Remove from package.json

---

## Unlisted Dependencies (3)

### ✅ ADD - Missing Dependency

- **`dotenv`** - ADD
  - **Reason**: Used in drizzle.config.ts, scripts/init-db.ts, scripts/setup-postgis.ts
  - **Current**: Only in root package.json
  - **Action**: Add to routing-app/package.json dependencies

---

## Unresolved Imports (5)

### 🔧 FIX - Broken Imports

These files import from a non-existent `types.ts` file. The `Coordinate` and `Address` types are actually in `src/lib/server/db/schema.ts`.

- **`./types` in `src/lib/coordinateGrid.ts:2`** - FIX

  - **Issue**: Importing `Coordinate` from `./types` but file doesn't exist
  - **Fix**: Change to `import type { Coordinate } from '$lib/server/db/schema'`

- **`./types` in `src/lib/geo.ts:2`** - FIX

  - **Issue**: Importing `Coordinate` from `./types` but file doesn't exist
  - **Fix**: Change to `import type { Coordinate } from '$lib/server/db/schema'`

- **`./types` in `src/lib/server.ts:3`** - FIX

  - **Issue**: Importing `Address, Coordinate` from `./types` but file doesn't exist
  - **Fix**: Change to `import type { Address, Coordinate } from '$lib/server/db/schema'`

- **`$env/dynamic/private` in `src/lib/server/db/index.ts:4`** - ⚠️ REVIEW

  - **Issue**: SvelteKit environment variable import
  - **Action**: Verify this is correct SvelteKit syntax. This is likely correct for SvelteKit v2.

- **`../lib/types` in `src/scripts/analyze-address-distribution.ts:5`** - FIX
  - **Issue**: Import path doesn't resolve (trying to import from non-existent types file)
  - **Fix**: Change to import from `$lib/server/db/schema` or correct path

---

## Unused Exports (50)

### Strategy

Most unused exports can be safely removed. However, some might be:

1. Used via `$lib` barrel exports
2. Used in Svelte components (knip might miss some)
3. Planned for future use

### Recommended Actions

#### High Confidence - REMOVE

These are clearly unused utility functions:

**From `src/lib/employeeUtils.ts`:**

- `getEmployeeVehicleConfig` - REMOVE
- `canEmployeeDoJobCategory` - REMOVE
- `getEmployeeCapacity` - REMOVE
- `getDistanceEarningsMultiplier` - REMOVE
- `getTimeEarningsMultiplier` - REMOVE
- `getXPGainMultiplier` - REMOVE
- `getRouteTimeMultiplier` - REMOVE
- `getNodeToAddressTimeMultiplier` - REMOVE
- `getUpgradeCostMultiplier` - REMOVE
- `getMaxJobCapacityMultiplier` - REMOVE
- `getAvailableJobCategories` - REMOVE
- `formatEmployeeSummary` - REMOVE

**From `src/lib/formatting.ts`:**

- `formatTime` - REMOVE
- `formatRouteDuration` - REMOVE
- `formatWeight` - REMOVE
- `formatJobCurrency` - REMOVE

**From `src/lib/jobs/generateJobs.ts`:**

- `ROUTE_DISTANCES_KM` - REMOVE
- `MAX_TIER` - REMOVE
- `getAvailableCategories` - REMOVE
- `generateJobTier` - REMOVE
- `computeApproximateJobValue` - REMOVE

**From `src/lib/jobs/jobAssignment.ts`:**

- `calculateDistance` - REMOVE
- `getEmployeePosition` - REMOVE

**From `src/lib/jobs/jobCategories.ts`:**

- `TIER_COLORS` - REMOVE (duplicate exists in mapDisplay.ts)

**From `src/lib/jobs/jobUtils.ts`:**

- `getJobProgress` - REMOVE

**From `src/lib/jobs/queryJobs.ts`:**

- `client` - REMOVE

**From `src/lib/logger.ts`:**

- `default` export - REMOVE (if not used)

**From `src/lib/stores/errors.ts`:**

- `clearAllErrors` - REMOVE

**From `src/lib/stores/gameData.ts`:**

- `allActiveJobs` - REMOVE
- `currentMapJobs` - REMOVE
- `getEmployeeActiveJob` - REMOVE
- `getFullEmployeeData` - REMOVE
- `getEmployeeActiveRoute` - REMOVE

**From `src/lib/stores/mapDisplay.ts`:**

- `TIER_COLORS` - REMOVE (if duplicate)
- `ROUTE_STYLES` - REMOVE
- `selectedRouteDisplay` - REMOVE

**From `src/lib/stores/selectedEmployee.ts`:**

- `selectedFullEmployeeData` - REMOVE
- `clearEmployeeSelection` - REMOVE

**From `src/lib/upgrades/vehicles.ts`:**

- `VEHICLE_CONFIGS` - REMOVE
- `getNextVehicle` - REMOVE
- `getNextLicense` - REMOVE
- `LICENSE_CONFIGS` - REMOVE
- `getLicenseConfig` - REMOVE
- `getAvailableVehicles` - REMOVE
- `isVehicleAvailable` - REMOVE

**From `src/lib/vehicles/vehicleUtils.ts`:**

- `getMaxVehicleLevel` - REMOVE

**From `src/lib/vehicleUtils.ts`:**

- `getVehicleNameByLevel` - REMOVE

#### ⚠️ REVIEW - May Be Used via $lib

**From `src/lib/server/config/index.ts`:**

- `UPGRADE_DEFINITIONS` - REVIEW (might be used via $lib)
- `VEHICLE_DEFINITIONS` - REVIEW (might be used via $lib)

**From `src/auth.ts`:**

- `handle` export - REVIEW (might be used by hooks.server.ts, but knip shows it's imported)

---

## Unused Exported Types (4)

### ⚠️ REVIEW

- **`UpgradesConfig`** from `src/lib/config/types.ts` - REVIEW

  - **Action**: Check if used in config loading. If not, remove.

- **`VehiclesConfig`** from `src/lib/config/types.ts` - REVIEW

  - **Action**: Check if used in config loading. If not, remove.

- **`GameConfig`** from `src/lib/server/config/index.ts` - REVIEW

  - **Action**: Check if used in config loading. If not, remove.

- **`CheatSettings`** from `src/lib/stores/cheats.ts` - REVIEW
  - **Action**: Check if used in Cheats component. If not, remove.

---

## Configuration Hints (5)

### ✅ FIX - Redundant Entry Patterns

Knip suggests these are redundant in knip.json since they're auto-detected:

- `vite.config.ts` - Remove from entry
- `tailwind.config.js` - Remove from entry
- `postcss.config.js` - Remove from entry
- `drizzle.config.ts` - Remove from entry
- `eslint.config.js` - Remove from entry

**Action**: Update knip.json to remove redundant entries.

---

## Summary

### ✅ Completed

1. **Fixed unresolved imports** - All 5 broken imports fixed:
   - `src/lib/coordinateGrid.ts` - Fixed
   - `src/lib/geo.ts` - Fixed
   - `src/lib/server.ts` - Fixed
   - `src/scripts/analyze-address-distribution.ts` - Fixed
   - Test files (`geo.test.ts`, `integration/addresses.test.ts`, `integration/routing.test.ts`) - Fixed

2. **Removed unused files** (10 files):
   - 5 profiling scripts (cleanup-routes.ts, test-complete-cheat.ts, parallel-profile.ts, profile-job-generation.ts, simple-profile.ts)
   - 1 placeholder component (UpgradesPanelPlaceholder.svelte)
   - 1 unused barrel export (index.ts)
   - 1 duplicate auth file (server/auth/index.ts)
   - 1 duplicate spatial indexes file (server/db/spatial-indexes.ts)
   - 1 unused server utility (server/vehicleUtils.ts)

3. **Removed unused dependencies** (7 packages):
   - @oslojs/crypto
   - @oslojs/encoding
   - @tailwindcss/typography
   - svelte-leafletjs
   - 0x (dev)
   - clinic (dev)
   - ts-node (dev)

4. **Added missing dependency**:
   - dotenv (was only in root package.json)

5. **Updated knip.json**:
   - Removed redundant entry patterns
   - Added hooks.server.ts to ignore list

### ⏳ Remaining Work

- **~50 unused exports** - These can be removed systematically. Most are utility functions that are clearly unused. This is a larger task that can be done incrementally.

### Notes

- `src/lib/stores/activeJobs.ts` - KEPT (false positive, actually used)
- `src/lib/server/config/types.ts` - KEPT (re-export pattern, false positive)
- `src/hooks.server.ts` - KEPT (SvelteKit convention, added to knip ignore)
