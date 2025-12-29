## Introduction

In this feature we are going to revamp the job system a bit. Proposed features:

**OSM data and processing**
- Alter `extract_addresses.py` to extract a fraction of addresses (using a seed) to a compressed csv file, which is subsequently loaded into the DB in a batch fashion. Use an OSM processing thread and a writing thread for faster processing if that makes sense (first establish bottlenecks)
- Update `trim_to_largest_component.py` to work in two steps: first extract all the nodes that are part of ways, save the trimmed to file, and then (perhaps) find connected components in the trimmed file. 
- Add region data geoJSON
- Try running the routing server with all of the Netherlands, and then with full Europe map to see what kind of resources we need for that.
- Add column with region name to addresses table.
- Update map display to show outlines

**Game mechanics**
- Only show 3 jobs per unlocked tier for currently selected employee. To do a job, you first select an employee and then select a job.
- Upgrades increase the number of jobs shown.
- XP system for each region. XP is earned in a region by completing a job that either starts or finishes in that region. Same amount of XP is earned as for employee or as for total XP.
- Regions have same level system as the rest of the game (runescape style, lvl 0-99 or up to 120).
- Adds a new currency needed for some upgrades: each region level earned is one point. This promotes exploring the map. 

**Job display**