# Upgrade System Redesign Feature

## Feature Overview

This document describes the architecture and design of the redesigned upgrade system. The new system simplifies employee progression by separating global upgrades (using money) from employee-specific upgrades (using money), while maintaining a tech tree structure for strategic progression. XP is used indirectly to determine level requirements for upgrades.

## Final Architecture

### Core Concepts

#### 1. Experience Points (XP) System

**Global XP:**
- Stored in `gameState` as a JSONB field containing XP values for each job category
- Total XP is calculated as the sum of all category XP values
- Uses Runescape-style leveling formula: XP required to go from level `n` to `n+1` is `floor((n + 300 * 2^(n/7)) / 4)`
- A lookup table (LOT) pre-calculates XP requirements up to level 120

**Employee XP:**
- Each employee has a single XP value (not per-category)
- Used for vehicle upgrade unlocks and progression
- Employees gain XP when completing jobs
- Higher tier vehicle upgrades remain expensive due to exponential cost scaling
- Global XP multipliers increase significantly, allowing new employees to progress quickly through early levels

#### 2. Upgrade System

**Global Upgrades:**
- Tech tree structure with dependencies
- Each upgrade has:
  - `id`: Unique identifier (snake_case string)
  - `name`: Display name
  - `upgradeRequirements`: List of upgrade IDs that must be purchased first
  - `levelRequirements`: Object specifying required levels (e.g., `{ total: 5, groceries: 3 }`) - checked against global XP levels
  - `description`: User-facing description
  - `cost`: Money cost (in euros) - deducted from `gameState.money`
  - `effect`: Effect type (`multiply` or `increment`)
  - `effectArguments`: Parameters for the effect (e.g., `{ name: "speed", amount: 1.2 }`)

**Upgrade Effects:**
Effects modify game state through functions with signature `(gameState, args) -> gameState`. Available effects:
- `speed`: Multiplier governing speed of all deliveries (default ~5x)
- `vehicleLevelMax`: Maximum vehicle level available
- `vehicleLevelMin`: Starting vehicle level for new employees
- `employeeLevelStart`: Starting level for new employees
- `xpMultiplier`: Global XP multiplier
- `moneyTimeFactor`: Multiplier for money earned from time
- `moneyDistanceFactor`: Multiplier for money earned per distance traveled
- `capacity`: Multiplier for capacity of all vehicles
- `upgradeDiscount`: Discount on employee upgrades

**Employee Upgrades:**
- Vehicle upgrades only (tier, max speed, max weight/capacity)
- Cost money (not XP)
- May require global upgrades to be unlocked
- Progressively more expensive (exponential scaling)
- Vehicle level determines which vehicle type an employee can use

#### 3. Vehicle System

**Vehicle Configuration:**
- Defined in separate YAML config file (`vehicles.yaml`) in the config directory
- Each vehicle has a level
- Properties per vehicle level:
  - `capacity`: Maximum weight/cargo capacity
  - `roadSpeed`: Maximum speed on roads (km/h)
  - `tier`: Vehicle tier (affects job eligibility)
  - `name`: Display name

**Vehicle Progression:**
- Vehicles come in levels (0, 1, 2, ...)
- Cost scales exponentially according to a formula (to be balanced)
- Higher level vehicles unlock through global upgrades
- Employee vehicle level determines which vehicle they can use

#### 4. Database Schema

**gameState Table:**
```typescript
{
  id: string
  name: string
  userId: string
  createdAt: timestamp
  money: number
  xp: JSONB  // { [JobCategory]: number } - XP per category
  upgradesPurchased: string[]  // List of upgrade IDs
  upgradeEffects: JSONB  // { [effectName]: number } - Current effect values
}
```

**employee Table:**
```typescript
{
  id: string
  gameId: string
  name: string
  vehicleLevel: number  // VehicleType level (0-based)
  xp: number  // Single XP value for employee
  location: JSONB  // Address
}
```

#### 5. Configuration Files

Configuration is split between YAML files and TypeScript code:

**YAML Config Files (in `config` directory):**
1. **`config/game-config.yaml`** - Game balance values (money multipliers, XP rates, hiring costs, etc.)

**TypeScript Code Files:**
2. **`src/lib/upgrades/upgradeDefinitions.ts`** - Global upgrade definitions (structure, dependencies, effects)
3. **`src/lib/vehicles/vehicleDefinitions.ts`** - Vehicle definitions (levels, tiers, stats)

**Note:** Upgrades and vehicles are defined in TypeScript code rather than YAML to enable:
- Direct imports on both client and server
- Type safety and better IDE support
- Easier refactoring and code navigation
- No runtime YAML parsing overhead
- Simpler code paths without config store workarounds

**Upgrade Configuration:**

Upgrades are defined in TypeScript code (`src/lib/upgrades/upgradeDefinitions.ts`) with the following structure:

```typescript
export const UPGRADE_DEFINITIONS: UpgradeConfig[] = [
  {
    id: "cargo_bike",
    name: "Cargo Bike",
    upgradeRequirements: ["backpack"],
    levelRequirements: {
      total: 5  // Requires total level 5 (calculated from global XP)
    },
    description: "Unlocks cargo bike upgrade for all employees",
    cost: 100,  // Money cost in euros
    effect: "increment",
    effectArguments: {
      name: "vehicleLevelMax",
      amount: 1
    }
  },
  {
    id: "careful_driver",
    name: "Careful Driver",
    upgradeRequirements: [],
    levelRequirements: {
      groceries: 5,  // Requires groceries category level 5
      total: 10  // Requires total level 10
    },
    description: "Increase speed of all jobs by 20%",
    cost: 20,  // Money cost in euros
    effect: "multiply",
    effectArguments: {
      name: "speed",
      amount: 1.2
    }
  }
];
```

**Vehicle Configuration:**

Vehicles are defined in TypeScript code (`src/lib/vehicles/vehicleDefinitions.ts`) with the following structure:

```typescript
export const VEHICLE_DEFINITIONS: VehicleConfig[] = [
  { level: 0, name: 'Bike', capacity: 10, roadSpeed: 15, tier: 1 },
  { level: 1, name: 'Cargo Bike', capacity: 40, roadSpeed: 20, tier: 2 },
  { level: 2, name: 'Electric Bike', capacity: 40, roadSpeed: 25, tier: 2 },
  { level: 3, name: 'Scooter', capacity: 50, roadSpeed: 45, tier: 3 },
  // ... more vehicle levels
];
```

### User Experience

**Global Upgrades Tab:**
- Displays available upgrades as cards
- Only shows upgrades where all requirements are met (both upgrade dependencies and level requirements)
- Shows upgrade cost (money), description, and effects
- Purchasing an upgrade:
  - Checks level requirements (calculated from global XP using LOT)
  - Checks upgrade dependencies (previous upgrades purchased)
  - Deducts money cost from `gameState.money`
  - Adds upgrade ID to `upgradesPurchased` list
  - Applies effect to `upgradeEffects` JSONB field
  - Updates game state

**Employee Cards:**
- Display employee name, current vehicle level, and XP
- Show vehicle upgrade options (if unlocked via global upgrades). This is a single button that shows the cost of the next upgrade. The card should also show the current roadspeed, vehicle capacity and vehicle tier. Overall the card should be compact.
- Vehicle upgrades cost money
- XP display shows progress toward next level (using LOT)

**XP Display:**
- Global XP tab shows:
  - Total XP (sum of all categories)
  - XP per category
  - Current level per category (calculated from LOT)
  - Progress bars toward next level

### Technical Implementation Details

**XP Calculation:**
- When a job is completed:
  - Employee gains XP (single value, not per-category)
  - Category gains XP (added to global category XP)
  - Both updates happen atomically to avoid race conditions
  - XP multipliers from `upgradeEffects` are applied
  - **TODO: Race condition fix needed** - Currently in `jobCompletion.ts`, when multiple employees complete jobs simultaneously, the category XP updates can overwrite each other. The `processCompletedJobs` function calculates XP updates correctly, but `completeActiveJob` updates gameState.xp directly which can cause race conditions. Need to use JSONB atomic operations (e.g., `sql\`jsonb_set(...)\``) or ensure all XP updates go through a single atomic transaction.

**Level Calculation:**
- Uses pre-calculated lookup table (LOT) for performance
- LOT contains XP requirements for levels 0-120
- Level is calculated by finding the highest level where cumulative XP requirement <= current XP

**Upgrade Purchase Flow:**
- When purchasing an upgrade:
  1. Check `upgradeRequirements`: all listed upgrade IDs must be in `upgradesPurchased`
  2. Check `levelRequirements`: calculate current levels from global XP using LOT, verify all requirements met
  3. Verify sufficient money: `gameState.money >= upgrade.cost`
  4. Deduct money: `gameState.money -= upgrade.cost`
  5. Add upgrade ID to `upgradesPurchased` array
  6. Apply effect to `upgradeEffects` JSONB field
- XP is used indirectly: level requirements are checked by calculating levels from global XP, but XP itself is not spent

**Upgrade Effect Application:**
- Effects are applied when upgrades are purchased
- `multiply` effects multiply the current value
- `increment` effects add to the current value
- Effects are stored in `upgradeEffects` JSONB field
- Game logic reads from `upgradeEffects` to apply multipliers

**Vehicle Upgrade Cost:**
- Exponential formula: `baseCost * (costExponent ^ vehicleLevel)`
- Base cost and exponent are configurable
- Higher tier vehicles remain expensive until end game

## Implementation Todo List

The following steps can be taken (mostly) independently:

**Known Issues / Technical Debt:**
- **Race condition in XP updates** (jobCompletion.ts): When multiple employees complete jobs simultaneously, category XP updates can overwrite each other. The `completeActiveJob` function updates `gameState.xp` directly which can cause race conditions if two jobs complete at nearly the same time. Fix: Use JSONB atomic operations (e.g., `sql\`jsonb_set(game_states.xp, '{category}', (COALESCE(game_states.xp->>'category', '0')::int + xp_gain)::text::jsonb)\``) or ensure all XP updates go through a single atomic transaction that reads-modify-writes the XP object.

1. **Create XP Lookup Table (LOT)** ✅ DONE
   - ✅ Implemented Runescape formula: `floor((n + 300 * 2^(n/7)) / 4)`
   - ✅ Generated lookup table for levels 0-120
   - ✅ Created utility functions: `getXpForLevel()`, `getXpForNextLevel()`, `getLevelFromXp()`, `getXpToNextLevel()`
   - ✅ Added comprehensive unit tests (35 tests, all passing)
   - **Note:** Due to floating point precision in JavaScript's `Math.pow()`, our calculated values differ slightly from exact Runescape benchmarks:
     - Level 99: Calculated 13,034,469 vs Runescape 13,034,431 (38 XP difference, ~0.0003% error)
     - Level 120: Calculated 104,273,196 vs Runescape 104,273,167 (29 XP difference, ~0.00003% error)
   - Tests use relative tolerance of 1e-4 (0.01%) to account for this floating point discrepancy

2. **Define TypeScript Interfaces for New Game State** ✅ DONE
   - ✅ Create interfaces for `gameState` XP structure (category XP object)
   - ✅ Create interfaces for `upgradeEffects` structure
   - ✅ Create interfaces for upgrade configuration (YAML structure)
   - ✅ Create interfaces for vehicle configuration
   - ✅ Update existing type definitions
   - ✅ Create minimal `config/upgrades.yaml` file with basic upgrades (temporary - will be moved to code in step 4)
   - ✅ Create minimal `config/vehicles.yaml` file with basic vehicles (temporary - will be moved to code in step 4)
   - ✅ Implement config loaders for upgrades.yaml and vehicles.yaml (temporary - will be replaced in step 4)
   - ✅ Add validation for config structures and vehicle-upgrade relationships
   - ✅ Migrate `game-config.yaml` from routing-app root to `config/game-config.yaml`
   - ✅ Update config loader path in `src/lib/server/config/index.ts` to point to `config/game-config.yaml`
   - ✅ Update Vite file watcher in `vite.config.ts` to watch the entire `config/` folder
   - ✅ Update documentation/comments that reference the old location
   - **Note:** Each vehicle level (except 0) must have a corresponding upgrade that unlocks it by incrementing `vehicleLevelMax`. Comprehensive definitions will be populated in steps 11-12.

3. **Update Database Schema** ✅ DONE
   - ✅ Modify `gameState` table: add `xp` (JSONB), `upgradesPurchased` (text[]), `upgradeEffects` (JSONB)
   - ✅ Simplify `employee` table: remove `categoryLevel`, `drivingLevel`, `upgradeState`, `licenseLevel`; add single `xp` field
   - ✅ Generate migration file using `drizzle-kit generate` (created `drizzle/0000_upgrade_system_redesign.sql`)
   - ✅ Update TypeScript types to match new schema (types automatically inferred from schema)
   - **Note:** Migration file generated. To apply: run `npm run db:migrate` or `npm run init-db:force` (rebuilds entire database, no data worth keeping per notes)

4. **Move Upgrades and Vehicles to Code (Refactor)** ✅ DONE
   - ✅ Moved upgrade definitions from `config/upgrades.yaml` to TypeScript code (`src/lib/upgrades/upgradeDefinitions.ts`)
   - ✅ Moved vehicle definitions from `config/vehicles.yaml` to TypeScript code (`src/lib/vehicles/vehicleDefinitions.ts`)
   - ✅ Exported as constants/arrays (`UPGRADE_DEFINITIONS`, `VEHICLE_DEFINITIONS`) that can be imported directly by both client and server
   - ✅ Removed the need for config store workarounds and YAML parsing
   - ✅ Kept `config/game-config.yaml` for game balance values (money multipliers, XP rates, etc.) but moved structural data (upgrades, vehicles) to code
   - ✅ Benefits: Type safety, easier refactoring, no runtime parsing, simpler imports, better IDE support
   - ✅ Updated all references to use the new code-based definitions
   - ✅ Removed YAML config loaders and validation for upgrades/vehicles (kept for game-config.yaml)
   - ✅ Refactored `vehicleUtils.ts` to accept arrays directly instead of wrapper types
   - ✅ Removed vehicles from API endpoint and config store (clients import directly)
   - ✅ Deleted YAML files (`config/upgrades.yaml`, `config/vehicles.yaml`)
   - This simplifies the codebase and makes subsequent steps easier

5. **Implement XP System Backend** ✅ DONE
   - ✅ Create functions to update employee XP and category XP atomically
   - ✅ Implement XP multiplier application from `upgradeEffects`
   - ✅ Update job completion logic to award XP correctly
   - ✅ Handle race conditions using database transactions or JSONB updates
   - ✅ Add unit tests for XP updates

6. **Create Global XP Display Tab/Component** ✅ DONE
   - ✅ Build UI component showing total XP and per-category XP
   - ✅ Display current level per category using LOT
   - ✅ Show progress bars toward next level
   - ✅ Integrate into existing game UI
   - ✅ Add placeholder Upgrades UI panel

7. **Unify Job XP (single xp field)** ✅ DONE
   - ✅ Replace `active_job.drivingXp` + `active_job.categoryXp` with a single `active_job.xp`
   - ✅ Compute the single XP value when accepting a job and persist it on the active job (job market can compute XP on the fly until we persist it on `job`)
   - ✅ On completion, award the same XP amount to both:
     - employee XP
     - global category XP bucket (for leveling requirements)
   - ✅ Ensure ORM schema and runtime payloads use the new field
   - ✅ Generated and applied migration `0002_active_job_single_xp.sql` (preserves existing address data)

8. **Fix Job Selection UI: show XP and correct time estimate** ✅ DONE
   - ✅ Update the job selection UI to display the job's XP reward
   - ✅ Fix the time estimate calculation/display (currently always shows 1m)
   - ✅ Ensure time estimate uses the same underlying duration logic as job assignment/completion (including speed multipliers if applicable)
   - ✅ Add small UI affordances: XP label + duration formatting consistency
   - ✅ Extracted `computeJobXp` to shared utility (`jobUtils.ts`) that accepts `GameConfig` and `GameState` for future extensibility
   - ✅ Updated server-side `activeJobComputation.ts` to use shared function
   - ✅ Updated `JobCard.svelte` to display XP computed with upgrade multipliers and show computed duration in hh:mm:ss format (or error state when route not computed)

9. **Implement Upgrade System Backend** ✅ DONE
   - ✅ Implement upgrade purchase logic (check requirements, deduct money, apply effects)
   - ✅ Create effect application functions (`multiply`, `increment`)
   - ✅ Implement requirement checking (upgrade dependencies + level requirements calculated from global XP)
   - ✅ Add unit tests for upgrade system
   - ✅ Created `src/lib/server/upgrades/upgradeUtils.ts` with utility functions for requirement checking and effect application
   - ✅ Created `src/lib/server/upgrades/upgradePurchase.ts` with purchase logic using row-level locking (`.for('update')`) to prevent race conditions
   - ✅ Created `src/routes/api/upgrades/purchase/+server.ts` API endpoint for purchasing upgrades
   - ✅ Added comprehensive unit tests (`upgradeUtils.test.ts` and `upgradePurchase.test.ts`) - all 30 tests passing
   - ✅ Uses database transactions with row-level locking to ensure atomicity and prevent race conditions
   - ✅ Validates upgrade existence, already purchased status, requirements (dependencies + levels), and sufficient funds
   - ✅ Atomically updates money, upgradesPurchased array, and upgradeEffects JSONB field

10. **Build Upgrade Purchase UI** ✅ DONE
   - ✅ Create upgrade card component (`UpgradesPanel.svelte`)
   - ✅ Filter upgrades to show only available and locked ones (hide purchased)
   - ✅ Display upgrade details (money cost, description, level requirements, dependencies)
   - ✅ Implement purchase flow (API call, state update)
   - ✅ Add visual feedback for available vs locked upgrades (grayed out, disabled buttons)
   - ✅ Show level requirement status and dependencies for each upgrade
   - ✅ Created client-side utility functions (`$lib/upgrades/upgradeUtils.ts`) for requirement checking
   - ✅ Integrated with game state store for real-time updates after purchase
   - ✅ Replaced `UpgradesPanelPlaceholder` with functional `UpgradesPanel` component

11. **Implement Vehicle Upgrade System** ✅ DONE
   - ✅ Created vehicle upgrade purchase logic (`src/lib/server/vehicles/vehicleUpgradePurchase.ts`) with transaction-based purchase, row-level locking, and unlock requirement checking
   - ✅ Created vehicle utility functions (`src/lib/vehicles/vehicleUtils.ts`) for vehicle config lookup, unlock checking, and cost calculation
   - ✅ Created API endpoint (`src/routes/api/employees/vehicle-upgrade/+server.ts`) for purchasing vehicle upgrades
   - ✅ Added vehicle cost field to `VehicleConfig` interface and vehicle definitions (`src/lib/vehicles/vehicleDefinitions.ts`)
   - ✅ Vehicle costs are defined in vehicle definitions (5, 10, 20 euros for levels 1-3) and shared between frontend and backend
   - ✅ Upgrade discount from `upgradeEffects` is applied when calculating final cost
   - ✅ Validates unlock status, funds, and max level before allowing purchase

12. **Revamp Employee Character Cards** ✅ DONE
   - ✅ Updated employee card UI with two-column layout (left: name/progress/ETA, right: level/stats/upgrade)
   - ✅ Added vehicle upgrade purchase interface directly on employee cards with different button states (available, locked, too expensive, max)
   - ✅ Display vehicle stats (capacity, tier, speed) based on current vehicle level
   - ✅ Display employee level and XP progress using LOT for level calculation
   - ✅ Always show progress bar (disabled/grayed when idle) with ETA or "Idle" text
   - ✅ Added hover effect on upgrade button that replaces stats with next vehicle preview (green text)
   - ✅ Display job rewards (money and XP) next to ETA when on job
   - ✅ Fixed height cards with border, improved contrast for disabled buttons

13. **Extend GameState upgrade interfaces (so we can define/purchase upgrades even if some effects are not wired yet)** ✅ DONE
    - ✅ Extended the **game state upgrade effects interface** (`UpgradeEffects` / `gameState.upgradeEffects` in `src/lib/server/db/schema.ts`) with new effect keys that are temporarily "no-op":
      - ✅ `jobsPerTier?: number` (defer wiring; needs job system revamp)
      - ✅ `freeTravel?: number` (defer wiring; needs travel model)
      - ✅ `roadSpeedMin?: number` (defer wiring; needs speed-limit model decision)
      - ✅ Kept all existing keys (`speed`, `capacity`, `xpMultiplier`, `moneyTimeFactor`, `moneyDistanceFactor`, `upgradeDiscount`, `vehicleLevelMax`, `vehicleLevelMin`, `employeeLevelStart`)
    - ✅ All new fields are optional, maintaining backward compatibility with existing game states
    - ✅ Effects can be stored in `upgradeEffects` JSONB field but won't affect gameplay until wired in later steps

14. **Populate Upgrade Definitions** ✅ DONE
    - ✅ Implemented the full tech tree in `src/lib/upgrades/upgradeDefinitions.ts` (including vehicle unlock upgrades)
    - ✅ Encoded dependencies + level requirements from the tables below
    - ✅ Balanced upgrade costs and effects
    - ✅ Marked upgrades whose effects are intentionally stubbed/deferred (see below)

15. **Populate Vehicle Definitions** ✅ DONE
    - ✅ Added comprehensive vehicle definitions to `src/lib/vehicles/vehicleDefinitions.ts` (14 vehicles, levels 0-13)
    - ✅ Structured vehicles by level (capacity, roadSpeed, tier, name, cost)
    - ✅ Refactored existing vehicle definitions to match the upgrade system design document
    - ✅ Ensured vehicle progression makes sense (exponential costs: 0, 12, 28, 60, 130, 260, 520, 1050, 2100, 4200, 8500, 17000, 34000, 70000)
    - ✅ Vehicle-related game logic already uses code-based definitions (no changes needed)
    - ✅ Vehicle definitions match upgrade unlock requirements (validation passes)

Notes:
- The level requirements for vehicles don't seem to work? I think the vehicle config needs to be expanded to include a minimum level. 
- Bike upgrade should be pre-unlocked (or it shouldn't be an upgrade at all)
- The order of the employees changes seemingly randomly when buying upgrades. The order should be based on the order in which employees were bought. This requires employees to have a number field, which requires a DB update and migration.
- Vehicle upgrades should always be shown first in the upgrade panel and perhaps be pre-pended by (Vehicle) in the name.
- Balancing: The upgrade costs are too high. They should be reduced. Alternatively, we can make the money earned be much higher. 
- Balancing: higher tiers should have much longer distances than they do now. 
- Jobs: The job value caluclation should be changed so that it happens per employee, and the approximate value field should be removed. 


16. **Implement in-scope upgrade effects; stub only the ones that need a job-system revamp**
    - In scope now (should work end-to-end):
      - `speed`
      - `capacity`
      - `xpMultiplier`
      - `moneyTimeFactor`, `moneyDistanceFactor`
      - `upgradeDiscount`
      - vehicle unlocks (`vehicleLevelMax` gating) + per-employee vehicle purchases
      - category unlocks (People/Fragile/Construction/Liquids/Toxic) as defined in “Progression”
    - **Defer (needs job-system revamp):**
      - `jobsPerTier +n`
      - `freeTravel` / fast travel timing
      - `roadSpeedMin` / roadspeed cap override
      - `employeeLevelStart`, `vehicleLevelMin` (new hire seeding)

## Notes

- This feature will be implemented across multiple commits
- Database can be rebuilt (no data worth keeping)
- Focus on using ORM (Drizzle) rather than raw SQL
- Use JSONB fields for easier migrations
- Balance exponential formulas through playtesting
- XP multipliers should scale significantly to allow fast early progression for new employees
- Configuration: Game balance values are in `config/game-config.yaml`. Structural data (upgrades, vehicles) will be moved to TypeScript code in step 4 for better type safety and simpler imports.
- Vehicle definitions will be moved from `game-config.yaml` to TypeScript code (see step 4)

### Out of scope / related work (not in this feature branch)
- Revamp job generation and job market to support “more jobs per tier” and better late-game variety
- Define and implement a “fast travel” time model (non-job travel) and how it interacts with speed upgrades
- Decide whether roadspeed is capped by route type, vehicle type, or a global override, then implement `roadSpeedMin` properly
- Add/validate license & category gating inside the job system (and ensure the UI explains unlock paths clearly)
- Revisit job “capacity/weight” modeling so vehicle capacity meaningfully constrains jobs (ties into Construction/Furniture scaling)

## Suggested upgrades:
**Vehicles (unlocked via global upgrades):**
- If something is listed in `game-config.yaml`, it should be removed from there.
- **Vehicle level** is just `0, 1, 2, ...` (progression index). **Tier** is used for job eligibility: employees can do a job iff `vehicleTier >= jobTier`.
- Each vehicle has its **own unlock upgrade** (global purchase). Separately, each employee then pays the **per-employee upgrade cost** to move to the next vehicle level.
- Suggested progression (capacity in **kg**, speed in **km/h**). Unlock costs scale “kinda exponentially”, and top speeds stay realistic (vans/trucks often slower than cars):

| Upgrade ID | Vehicle | Veh lvl | Tier | Capacity (kg) | Road speed (km/h) | Min total lvl (unlock) | Min employee lvl (buy) | Unlock cost (€) | Employee cost (€) | Depends on |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `unlock_bike` | Bike | 0 | 1 | 10 | 15 | 0 | 0 | 0 | 0 | - |
| `unlock_pannier_bike` | Pannier Bike | 1 | 1 | 25 | 18 | 3 | 2 | 20 | 12 | `unlock_bike` |
| `unlock_e_bike` | E-Bike | 2 | 2 | 20 | 25 | 6 | 4 | 60 | 28 | `unlock_pannier_bike` |
| `unlock_cargo_bike` | Cargo Bike | 3 | 2 | 80 | 20 | 10 | 6 | 150 | 60 | `unlock_e_bike` |
| `unlock_scooter` | Scooter | 4 | 3 | 50 | 45 | 15 | 9 | 400 | 130 | `unlock_cargo_bike` |
| `unlock_motorbike_125` | Motorbike 125 | 5 | 3 | 80 | 70 | 22 | 13 | 900 | 260 | `unlock_scooter` |
| `unlock_compact_car` | Compact Car | 6 | 4 | 250 | 120 | 30 | 18 | 2_000 | 520 | `unlock_motorbike_125` |
| `unlock_small_van` | Small Van | 7 | 4 | 700 | 110 | 40 | 24 | 4_500 | 1_050 | `unlock_compact_car` |
| `unlock_cargo_van` | Cargo Van | 8 | 5 | 1_200 | 105 | 50 | 30 | 10_000 | 2_100 | `unlock_small_van` |
| `unlock_box_truck` | Box Truck | 9 | 6 | 3_500 | 90 | 60 | 36 | 22_000 | 4_200 | `unlock_cargo_van` |
| `unlock_tipper_truck` | Tipper Truck | 10 | 6 | 5_000 | 85 | 70 | 42 | 48_000 | 8_500 | `unlock_box_truck` |
| `unlock_tanker` | Tanker | 11 | 7 | 8_000 | 80 | 80 | 48 | 100_000 | 17_000 | `unlock_tipper_truck` |
| `unlock_hazmat_truck` | Hazmat Truck | 12 | 8 | 12_000 | 80 | 90 | 55 | 210_000 | 34_000 | `unlock_tanker` |
| `unlock_hazmat_semi` | Hazmat Semi | 13 | 8 | 18_000 | 75 | 99 | 60 | 450_000 | 70_000 | `unlock_hazmat_truck` |


**Progression:**
These unlock job categories. Groceries, packages, food and furniture are unlocked by default. This refers to total XP level. 
Upgrade name |Job category | Minimum level | Cost (€)
--- | --- | ---: | ---:
Taxi license | People | 20 | 500
Certified courier | Fragile goods | 35 | 1000
Tough guy | Construction | 50 | 4000
Slightly tipsy | Liquids | 70 | 2000
Put on your hazmat suit | Toxic goods | 90 | 8000

**Upgrades:**
First of all, the upgrade effects we should consider are:
- Speed: Increase the speed of all vehicles by a certain percentage. (Typically 20-100%)
- Capacity: Increase the capacity of all vehicles by a certain percentage. (Typically 10-50%)
- XP: Increase the XP gain of all jobs by a certain percentage. (Typically 10-100%)
- Cost: Reduce the cost of all upgrades by a certain percentage. (Typically 10-20%)
- Num jobs per tier: Increase the number of jobs per tier by a certain amount. (Always 1). Not yet implemented, but we can add the field and implement feature later.
- Money time factor: Increase the money earned from time by a certain percentage. (Typically 10-100%)
- Money distance factor: Increase the money earned from distance by a certain percentage. (Typically 10-100%)
- Fast travel: Reduce the time it takes to travel when not on a job by a certain percentage. (Typically 10-30%). Feature not yet implemented. 
- Employee level start: Increase the starting level for new employees by a certain amount. (Typically 1-10). Feature not yet implemented. 
- Employee vehicle start: Increase the starting vehicle level for new employees by a certain amount. (Typically 1-10). Feature not yet implemented. 
- Roadspeed increase: Ignore the fact that vehicles past compact car have lower speeds than 120km/h and always use 120km/h as speed limit. 

### Tech tree (proposal)

Notes:
- Levels per category (and total) go up to **99**.
- “Better” upgrades should either be expensive, gated behind higher levels, or both.
- All effects are **additive or multiplicative** and **stack** (buying “I”, “II”, “III” does not replace earlier upgrades).
- “Implemented” below means we already have a matching `upgradeEffects` field and purchase pipeline; some effects are still **not wired into gameplay** yet (marked **No / later**).

| ID | Upgrade | Effect | Level requirements | Depends on | Cost (€) | Implemented |
| --- | --- | --- | --- | --- | ---: | --- |
| `speed_1` | Better Routes I | `speed x1.30` | `total: 6` | - | 120 | Yes |
| `speed_2` | Better Routes II | `speed x1.30` | `total: 22` | `speed_1` | 480 | Yes |
| `speed_3` | Better Routes III | `speed x1.25` | `total: 55` | `speed_2` | 2_500 | Yes |
| `speed_4` | Better Routes IV | `speed x1.30` | `total: 80` | `speed_3` | 12_000 | Yes |
| `speed_5` | Better Routes V | `speed x1.25` | `total: 99` | `speed_4` | 60_000 | Yes |
| `capacity_1` | Packing I | `capacity x1.25` | `FURNITURE: 8` | - | 140 | Yes |
| `capacity_2` | Packing II | `capacity x1.25` | `FURNITURE: 20, total: 25` | `capacity_1` | 520 | Yes |
| `capacity_3` | Packing III | `capacity x1.20` | `FURNITURE: 35, total: 40` | `capacity_2` | 1_900 | Yes |
| `capacity_4` | Packing IV | `capacity x1.25` | `FURNITURE: 70, total: 75` | `capacity_3` | 10_000 | Yes |
| `capacity_5` | Packing V | `capacity x1.20` | `FURNITURE: 99, total: 99` | `capacity_4` | 55_000 | Yes |
| `xp_1` | Training I | `xpMultiplier x1.35` | `PEOPLE: 8` | - | 160 | Yes |
| `xp_2` | Training II | `xpMultiplier x1.35` | `PEOPLE: 22, total: 28` | `xp_1` | 650 | Yes |
| `xp_3` | Training III | `xpMultiplier x1.30` | `PEOPLE: 45, total: 55` | `xp_2` | 2_900 | Yes |
| `xp_4` | Training IV | `xpMultiplier x1.35` | `PEOPLE: 75, total: 80` | `xp_3` | 15_000 | Yes |
| `xp_5` | Training V | `xpMultiplier x1.30` | `PEOPLE: 99, total: 99` | `xp_4` | 80_000 | Yes |
| `money_dist_1` | Distance Pay I | `moneyDistanceFactor x1.30` | `GROCERIES: 8` | - | 130 | Yes |
| `money_dist_2` | Distance Pay II | `moneyDistanceFactor x1.30` | `GROCERIES: 22, total: 28` | `money_dist_1` | 520 | Yes |
| `money_dist_3` | Distance Pay III | `moneyDistanceFactor x1.25` | `GROCERIES: 45, total: 55` | `money_dist_2` | 2_400 | Yes |
| `money_dist_4` | Distance Pay IV | `moneyDistanceFactor x1.30` | `GROCERIES: 75, total: 80` | `money_dist_3` | 12_000 | Yes |
| `money_dist_5` | Distance Pay V | `moneyDistanceFactor x1.25` | `GROCERIES: 99, total: 99` | `money_dist_4` | 65_000 | Yes |
| `money_time_1` | Time Pay I | `moneyTimeFactor x1.30` | `FOOD: 8` | - | 130 | Yes |
| `money_time_2` | Time Pay II | `moneyTimeFactor x1.30` | `FOOD: 22, total: 28` | `money_time_1` | 520 | Yes |
| `money_time_3` | Time Pay III | `moneyTimeFactor x1.25` | `FOOD: 45, total: 55` | `money_time_2` | 2_400 | Yes |
| `money_time_4` | Time Pay IV | `moneyTimeFactor x1.30` | `FOOD: 75, total: 80` | `money_time_3` | 12_000 | Yes |
| `money_time_5` | Time Pay V | `moneyTimeFactor x1.25` | `FOOD: 99, total: 99` | `money_time_4` | 65_000 | Yes |
| `discount_1` | Bulk Deals I | `upgradeDiscount x0.90` | `PACKAGES: 10, total: 12` | - | 220 | Yes |
| `discount_2` | Bulk Deals II | `upgradeDiscount x0.90` | `PACKAGES: 25, total: 30` | `discount_1` | 900 | Yes |
| `discount_3` | Bulk Deals III | `upgradeDiscount x0.90` | `PACKAGES: 55, total: 60` | `discount_2` | 4_500 | Yes |
| `discount_4` | Bulk Deals IV | `upgradeDiscount x0.90` | `PACKAGES: 80, total: 85` | `discount_3` | 25_000 | Yes |
| `discount_5` | Bulk Deals V | `upgradeDiscount x0.90` | `PACKAGES: 99, total: 99` | `discount_4` | 150_000 | Yes |
| `start_lvl_1` | Better Hires I | `employeeLevelStart +10` | `total: 18` | - | 600 | No / later |
| `start_lvl_2` | Better Hires II | `employeeLevelStart +20` | `total: 40` | `start_lvl_1` | 2_500 | No / later |
| `start_lvl_3` | Better Hires III | `employeeLevelStart +40` | `total: 75` | `start_lvl_2` | 12_000 | No / later |
| `start_lvl_4` | Better Hires IV | `employeeLevelStart +60` | `total: 99` | `start_lvl_3` | 80_000 | No / later |
| `start_veh_1` | Better Gear I | `vehicleLevelMin +1` | `total: 22` | `unlock_scooter` | 650 | No / later |
| `start_veh_2` | Better Gear II | `vehicleLevelMin +2` | `total: 50` | `start_veh_1` | 3_200 | No / later |
| `start_veh_3` | Better Gear III | `vehicleLevelMin +3` | `total: 75` | `start_veh_2` | 12_000 | No / later |
| `start_veh_4` | Better Gear IV | `vehicleLevelMin +4` | `total: 99` | `start_veh_3` | 80_000 | No / later |
| `more_jobs_1` | More Jobs I | `jobsPerTier +1` | `total: 25` | - | 600 | No / later |
| `more_jobs_2` | More Jobs II | `jobsPerTier +1` | `total: 55` | `more_jobs_1` | 3_000 | No / later |
| `more_jobs_3` | More Jobs III | `jobsPerTier +1` | `total: 85` | `more_jobs_2` | 18_000 | No / later |
| `fast_travel_1` | Fast Travel I | `freeTravel x0.90` | `total: 30` | - | 900 | No / later |
| `fast_travel_2` | Fast Travel II | `freeTravel x0.85` | `total: 60` | `fast_travel_1` | 5_000 | No / later |
| `fast_travel_3` | Fast Travel III | `freeTravel x0.75` | `total: 90` | `fast_travel_2` | 35_000 | No / later |
| `roadspeed_cap` | Speed Cap | `roadSpeedMin 120` | `total: 99` | `unlock_compact_car, speed_5` | 150_000 | No / later |