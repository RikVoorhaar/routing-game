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