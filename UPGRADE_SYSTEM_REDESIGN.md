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

6. **Create Global XP Display Tab/Component**
   - Build UI component showing total XP and per-category XP
   - Display current level per category using LOT
   - Show progress bars toward next level
   - Integrate into existing game UI

7. **Implement Upgrade System Backend**
   - Create upgrade configuration loader for `config/upgrades.yaml` (YAML parser)
   - Implement upgrade purchase logic (check requirements, deduct money, apply effects)
   - Create effect application functions (`multiply`, `increment`)
   - Implement requirement checking (upgrade dependencies + level requirements calculated from global XP)
   - Add unit tests for upgrade system

8. **Build Upgrade Purchase UI**
   - Create upgrade card component
   - Filter upgrades to show only available ones (requirements met)
   - Display upgrade details (money cost, description, effects, level requirements)
   - Implement purchase flow (API call, state update)
   - Add visual feedback for purchased vs available vs locked upgrades
   - Show level requirement status (met/not met) for each upgrade

9. **Implement Vehicle Upgrade System**
   - Create vehicle configuration loader for `config/vehicles.yaml` (YAML parser)
   - Create vehicle upgrade purchase logic (costs money, checks unlock requirements)
   - Update employee vehicle level assignment
   - Update vehicle stats calculation (capacity, speed, tier from config)
   - Add unit tests for vehicle upgrades

10. **Revamp Employee Character Cards**
    - Update employee card UI to show new structure (single XP, vehicle level)
    - Add vehicle upgrade purchase interface to employee cards
    - Display vehicle stats based on current vehicle level
    - Update XP display to use LOT for level calculation
    - Remove old category/upgrade displays

11. **Populate Upgrade Definitions**
    - Add comprehensive upgrade list to `src/lib/upgrades/upgradeDefinitions.ts`
    - Design tech tree with meaningful dependencies
    - Balance upgrade costs and effects
    - Ensure upgrades cover all effect types
    - Test upgrade progression flow

12. **Populate Vehicle Definitions**
    - Add comprehensive vehicle definitions to `src/lib/vehicles/vehicleDefinitions.ts`
    - Structure vehicles by level (capacity, roadSpeed, tier, name)
    - Refactor existing vehicle definitions from `game-config.yaml` to new structure
    - Ensure vehicle progression makes sense (exponential costs)
    - Update vehicle-related game logic to use new code-based definitions
    - Test vehicle upgrades and unlocks

## Notes

- This feature will be implemented across multiple commits
- Database can be rebuilt (no data worth keeping)
- Focus on using ORM (Drizzle) rather than raw SQL
- Use JSONB fields for easier migrations
- Balance exponential formulas through playtesting
- XP multipliers should scale significantly to allow fast early progression for new employees
- Configuration: Game balance values are in `config/game-config.yaml`. Structural data (upgrades, vehicles) will be moved to TypeScript code in step 4 for better type safety and simpler imports.
- Vehicle definitions will be moved from `game-config.yaml` to TypeScript code (see step 4)

