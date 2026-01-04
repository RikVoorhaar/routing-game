## Introduction

In this feature we are going to revamp the job system a bit. Proposed features:

**OSM data and processing**
- Alter `extract_addresses.py` to extract a fraction of addresses (using a seed) to a compressed csv file, which is subsequently loaded into the DB in a batch fashion. Use an OSM processing thread and a writing thread for faster processing if that makes sense (first establish bottlenecks)
- Update `trim_to_largest_component.py` to work in two steps: first extract all the nodes that are part of ways, save the trimmed to file, and then (perhaps) find connected components in the trimmed file. 
- Add region data geoJSON
- Try running the routing server with all of the Netherlands, and then with full Europe map to see what kind of resources we need for that.
- Add column with region name to addresses tablej.
- Update map display to show outlines
- Note: the `trim_and_extract_addresses.py` script is slow, for the Nehterlands it takes 40m, for all of Europe had to abort, 4h in it took 17GB of memory. Thinking about multi-threaded Cpp implementation.


What's actually done:
- Make a C++ version of the trimming script that uses low memory, and can run on all Europe on my laptop.
- Added a simplify option, that we should probably not use
- made the routing server cache the contraction hierarchy. When loading all Europe map we run out of memory when computing it, we hope that we can compute the CH once on a big machine and then use it on more memory constrained machines.
- Only insert a fraction of the addresses into the DB, and generate a job for each
- The job generation uses different scaling, so that higher tiers have larger distances, but also are more common in generation. Using 0.1% of addresses for job generation gives nice density for the Netherlands.
- Update DB schema so that employees have a location and not an address


Left to do:
- [ ] Implement a 'cancel' and a 'move' functionality
- [ ] Change it so that you click an employee, then you 'search' for jobs which takes time (can be reduced with upgrades!), and then you select a job.
- [ ] Change job selection UI
- [x] Change job generation script to increase search space up and down twice when needed. (or just increase tier when needed)
- [x] Remove ES63: Ciudad de Ceuta — 102 addresses and ES64: Ciudad de Melilla — 58 addresses, since these regions are geographically isolated and very small. 
- [x] Remove the approximate time and value fields and simplify the table and genreation
- [x] Simplify job value calculation to only use distance
- [ ] Implement and balance the 'weight' game mechanic, or remove it completely
- [x] Add script to assign address to region
- [x] Migrate DB to add regions table and region field
- [x] Display regions on map
- [ ] Add XP tracker for regions
- [ ] Way to travel to islands, right now there is no way to get to e.g. Iceland or the UK or Sicily.


**regions plan** (done)
- Make a regions table
- Sample jobs such that each region has a roughly equal number of addresses, perhaps ~500?  (modify the extract addresses script to do this)

**job generation script**
- Remove the approximate time and value fields and simplify the table and genreation
- Change it so that it increases the tier up to 2 times when needed. 

**Job selection**
- New method is not cheap -- for 4 tiers  x2 jobs it takes around 600ms on my laptop, 300ms on the server (probably because the networking between routing server and postgres is quicker). 
- Instead, only do a search for the jobs, but only compute the route once you click on a job
- Also, only show jobs for currently selected employee. If no employee is selected then no jobs should be shown either.

- We will also need a new UI, and get rid of the two column system, and instead just use tabs to switch between the map and the employees and the upgrades section. 
- The employee markers are very big and ugly, and should just be a small pin icon with a progress bar and an ETA.

**DONE**
- add redis stuff
- When clicking on a job, it does load the route, but it doesn't update the duration
- Job search still takes very long, need to look at the outputs.


**Route computation optimization (TODO)**
- Currently, route modifications (concatenation of employee-to-pickup + pickup-to-delivery routes, and application of speed multipliers) happen on the app server after fetching routes from the routing server
- This should be moved to the routing server itself:
  - The routing server should accept a request to compute a complete route from employee start → job pickup → job delivery
  - The routing server should handle concatenation and speed multiplier application internally
  - This reduces computation load on the app server and reduces data transfer (only one route response instead of two)
  - The routing server already has all the necessary data and can do this more efficiently
  - Implementation: Add a new endpoint like `/api/v1/complete_job_route` that takes start location, pickup location, delivery location, maxSpeed, and speedMultiplier, and returns the final modified route

**Job search query optimization (TODO - Option 1: Euclidean distance)**
- Current performance: tier queries take ~156ms (4 parallel PostGIS queries using ST_DistanceSphere)
- Problem: PostGIS distance calculations are expensive, even with spatial indexes
- Proposed solution: Use Euclidean distance on lat/lon columns instead of PostGIS great circle distance
  - Filter and order using simple math: `(lat1-lat2)² + (lon1-lon2)²` 
  - Use B-tree indexes on `jobs.lat` and `jobs.lon` columns (already exist)
  - Much faster: simple arithmetic vs PostGIS function calls
  - Accuracy: Good enough for filtering/ordering nearby jobs (Euclidean is fine for small distances)
  - Expected improvement: tier queries from ~156ms → ~10-30ms (5-15x faster)
  - Note: On deployed version, DB operations take ~40ms due to network latency, so this optimization will be even more impactful
- Implementation approach:
  1. Add indexes on `jobs.lat` and `jobs.lon` if not already present (check schema)
  2. Replace `ST_DistanceSphere` query with Euclidean distance calculation
  3. Use bounding box filter first: `WHERE lat BETWEEN ... AND lon BETWEEN ...` (uses indexes)
  4. Order by Euclidean distance squared (avoid sqrt for performance): `ORDER BY (lat - empLat)² + (lon - empLon)²`
  5. Test and benchmark against current PostGIS approach
  6. Consider hybrid: Euclidean for filtering, PostGIS for final ordering (if accuracy needed)