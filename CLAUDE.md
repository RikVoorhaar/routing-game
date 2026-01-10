# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A routing-based game where players manage employees with different vehicles and licenses to complete delivery jobs across Europe using real OpenStreetMap data.

## Tech Stack

- **Frontend**: SvelteKit 5 with TypeScript, Tailwind CSS, DaisyUI
- **Backend**: SvelteKit server routes with Auth.js authentication
- **Database**: PostgreSQL with PostGIS extension, Drizzle ORM
- **Routing Server**: C++ server using RoutingKit for contraction hierarchy-based routing (Dockerized)
- **Caching**: Redis for route caching
- **Python Utils**: UV package manager, SQLAlchemy ORM

## Critical Rules

**NEVER run the job generator** (`npm run job-generator`) without explicit user permission - it takes a long time and clears the jobs table. This has been a repeated issue.

**NEVER run docker commands** for the routing server without checking docker-compose.yml first. When modifying the routing server: (1) run `docker compose build`, (2) check build logs, (3) fix if unsuccessful, (4) restart with `docker compose down; docker compose up -d`, (5) wait 30s and tail logs.

**ALWAYS run the autoformatter** after making code changes. From the `routing-app/` directory, use this command to format only modified files (both staged and unstaged):
```bash
git diff --name-only HEAD -- . | xargs -r prettier --write
```
Alternatively, use `npm run format:staged` if you've already staged your changes. This is much faster than formatting the entire codebase with `npm run format`.

**Use Tailwind/DaisyUI classes only** - never use `<style>` tags in Svelte components.

**Use ORMs** - Drizzle for TypeScript/Svelte, SQLAlchemy for Python. Avoid raw SQL.

**Use UV for Python** - the environment is pre-installed in `osm_utils/`. Run `uv sync` when needed.

## Common Development Commands

### Routing App (in `routing-app/`)

```bash
# Development
npm run dev                    # Start dev server (http://localhost:5173)
npm run build                  # Production build
npm run preview                # Preview production build

# Code Quality
npm run format                 # Format all files with Prettier
npm run format:staged          # Format staged files only
npm run lint                   # Check formatting and run ESLint
npm run check                  # Run svelte-check for type errors
npm run test                   # Run unit tests (vitest)
npm run test:unit              # Run tests in watch mode
npm run knip                   # Find unused code/dependencies
npm run knip:production        # Check production dependencies only

# Database
npm run init-db                # Initialize database schema
npm run init-db:force          # Force recreate database (drops tables)
npm run db:push                # Push schema changes (Drizzle)
npm run db:studio              # Open Drizzle Studio

# Scripts (CAUTION: job-generator is destructive)
npm run job-generator          # Generate jobs (ask first!)
npm run analyze-addresses      # Analyze address distribution
```

### Routing Server (in `routing_server/`)

```bash
docker compose up -d           # Start routing server + PostgreSQL + Redis
docker compose ps              # Check container status
docker compose logs -f         # Follow logs
docker compose down            # Stop all services
docker compose build           # Rebuild routing server image
```

### Python Utils (in `osm_utils/`)

```bash
uv sync                        # Sync dependencies
uv run scripts/seed_regions_from_geojson.py <geojson_path>
uv run scripts/extract_addresses_from_csv.py <csv_path> --region-counts-file <counts_csv>
uv run scripts/combine_nuts_with_uk.py --resolution 01M
```

### C++ Utils (in `osm_utils_cpp/`)

```bash
cmake -B build                 # Configure build
cmake --build build            # Build trimming tool
cd build && ./trim_and_extract <osm.pbf> --output <output.pbf> --output-dir <dir>
```

## Architecture

### Database Schema (routing-app/src/lib/server/db/schema.ts)

Core tables:
- **users**: User accounts with username/email, cheats flag
- **regions**: NUTS region metadata (code, country_code, name_latn)
- **addresses**: Delivery locations with lat/lon and region FK
- **employees**: Player's employees with current location (lat/lon), not fixed addresses
- **jobs**: Delivery jobs with pickup/delivery addresses, category, tier, distance, value
- **routes**: Completed routes with path geometry, XP/money earned
- **gameState**: Per-user game state with XP per category (CategoryXp JSONB) and upgrade effects (UpgradeEffects JSONB)

The schema defines:
- **CategoryXp**: Maps each JobCategory to XP value
- **UpgradeEffects**: Speed, capacity, XP multiplier, money factors, vehicle levels, etc.

Note: Some legacy fields (CategoryLevels, UpgradeState) are deprecated in favor of the new upgrade system.

### Frontend Structure (routing-app/src/)

- **routes/**: SvelteKit routes
  - `api/`: API endpoints (employee, job, route, map operations)
  - `game/`: Main game UI
  - `login/`, `register/`, `signout/`: Auth flows
- **lib/**: Shared code
  - `lib/server/`: Server-only code (db, auth, logging, redis, routes, vehicles, xp, upgrades, config)
  - `lib/jobs/`: Job categories and logic
  - `lib/components/`: Svelte components
- **auth.ts**: Auth.js configuration
- **hooks.server.ts**: SvelteKit hooks (auth, logging)

### Routing Server (routing_server/)

C++ HTTP server (port 8050) using RoutingKit and crow HTTP library:
- Endpoints: `/api/v1/shortest_path`, `/api/v1/complete_job_route`, `/api/v1/closest_address`, `/health`
- Loads trimmed OSM PBF file and builds/caches contraction hierarchy for fast routing
- Loads address CSV (gzipped) for closest address queries
- See `routing_server/API_DOCUMENTATION.md` for endpoint details

Route caching: Routes are cached in Redis with keys like `route:{fromLat},{fromLon}:{toLat},{toLon}:{maxSpeed}:{speedMultiplier}`. The frontend checks Redis before calling the routing server.

### Data Processing Pipeline

1. Download OSM PBF from Geofabrik
2. Download NUTS GeoJSON boundaries (2024 + 2021 for UK)
3. Combine NUTS datasets: `uv run scripts/combine_nuts_with_uk.py`
4. Trim OSM and extract addresses: `osm_utils_cpp/build/trim_and_extract`
5. Start Docker services: `cd routing_server && docker compose up -d`
6. Initialize DB: `cd routing-app && npm run init-db:force`
7. Seed regions: `uv run scripts/seed_regions_from_geojson.py`
8. Populate addresses: `uv run scripts/extract_addresses_from_csv.py` (samples ~1000 per region)
9. Generate jobs: `npm run job-generator` (ASK FIRST - destructive!)

### Memory Requirements

First-time routing server startup (building CH for Europe map): ~62GB RAM peak
Running routing server after CH is cached: ~32GB RAM

### Job System

Jobs are generated with tiers (1-4+) based on distance. Higher tiers have larger distances and are more common. The job selection system uses Redis caching to avoid repeated route calculations.

Employees have a current location (lat/lon) and search for nearby jobs. When clicking a job, the route is computed and cached.

### Upgrade System

The new upgrade system (see UPGRADE_SYSTEM_REDESIGN.md) uses:
- **gameState.xp**: CategoryXp JSONB mapping JobCategory → XP
- **gameState.upgradeEffects**: UpgradeEffects JSONB with various effect values

Effects include: speed, capacity, vehicle/employee levels, XP multiplier, money factors, job search improvements, etc.

## Login Credentials

Test account:
- Username: `testuser`
- Password: `password123`

## Environment Variables

Database connection (default):
```
DATABASE_URL=postgresql://routing_user:routing_password@localhost:5432/routing_game
```

Routing server environment (in docker-compose.yml):
```
OSM_FILE=/data/osm/europe-latest.ways.osm.pbf
ADDRESS_FILE=/data/osm/europe-latest.addresses.csv
ROUTING_TIMING=1
```
