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
- Implement a 'cancel' and a 'move' functionality
- Change it so that you click an employee, then you 'search' for jobs which takes time (can be reduced with upgrades!), and then you select a job.
- Change job selection UI
- Change job generation script to increase search space up and down twice when needed.
- Remove the approximate time and value fields and simplify the table and genreation
- Simplify job value calculation to only use distance
- Implement and balance the 'weight' game mechanic, or remove it completely
- Implement a batch endpoint for routing server to process multiple routing requests in one call (performance optimization)
- Add script to assign address to region
- Migrate DB to add regions table and region field
- Display regions on map
- Add XP tracker for regions


The regions will be added in a different feature.