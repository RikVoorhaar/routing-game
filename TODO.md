BUGS:
- [ ] Only one marker is animated at the same time, the others are frozen.
- [ ] The notification bubbles appear behind the map.
- [ ] The route end icon should be consistent between the preview and the active route. (home icon vs. finish icon.)
- [ ] When accepting a job, it still displays the route in orange from another employee to the job's start location.
- [ ] When opening character selection screen it shows 'create your first character' when existing characters haven't been loaded yet. INstead there should be a loading screen of sorts. 
- [x] Food category glyph is undefined
- [ ] When no upgrades are available, there is an undefined glyph.
- [x] SSR error: `require is not defined` in `config.ts` - using CommonJS `require()` in ES module context during server-side rendering

ENHANCEMENTS:
- [ ] Make job-progress smooth (use css animations, not per second updates)
- [ ] Allow a 'cancel job' button that just stops the job, doesn't award money and leaves the employee wherever they happen to be. 
- [ ] When showing a preview of a route, the colors should be different for the route to the start, and the end marker. 
- [ ] The distance shown in the job detail card uses the wrong unit (km) instead of meters, and isn't properly formatted (big distances should switch to km). 
- [x] Add a cheat to increase speedup by an arbitrary factor
- [ ] Moving employee markers should be a simple pin, not teh whole box with eta and progress (that belongs in a different list). Perhaps just a simple circular progress bar, and inside there is an ETA number. 
- [ ] When receiving money, notification should appear in appropriate place (e.g. floating on top of the interface, animated and fading up)
- [ ] When clicking on an employee it is highlighted, and highlighted employees are stored in a store. 
- [ ] When an employee is selected, the route map should pan to the employee's location. If the employee is on a route, the zoom should be such that the entire route is visible. If no route is active, just pan and don't change the zoom. If there are available routes, then show the available routes on the map and zoom/pan to make sure all routes are visible.
- [ ] When selecting a route, pan and zoom on the route. When starting a route, the pan/zoom shouldn't change because it already shows the route.
- [ ] Starting location should be part of the config
- [ ] Copyright notice in footer should reference Rik Voorhaar. 
- [ ] job categories that are not unlocked should be shown as locked. 
- [x] Upgrades should show upgrades with all requirements met first. It should not show upgrades for which a dependency is missing (it should only be shown if level requirements are not met, or if funds are insufficient).

BALANCING:
- [ ] Balancing: The upgrade costs are too high. They should be reduced. Alternatively, we can make the money earned be much higher. 
- [ ] Balancing: higher tiers should have much longer distances than they do now. 

LOGGING:
- [ ] Health checks shouldn't be logged  (server)
- [ ] The logs should mention a request ID in each logging line for traceability. (server)
- [ ] Improve logging framework (app)
- [ ] Mark debug logging as debug (app)


DEV / NEW FEATURES:
- [x] The UI is pretty bad for the employee card
- [x] Once a route is finished, it doesn't mark as completed
- [x] Rebalancing of all rewards and costs
- [x] Currency should be a float
- [x] end address is formatted as coords, but start is a string
- [ ] Add batched API endpoint to routing server for processing multiple routing requests in one call (performance optimization)
- [ ] Add unit tests to github actions
- [ ] Many (1-2%) jobs fail to generate and are skipped. What are the causes of these skips, and are they necessary?
- [ ] Reform the job generation system. Probably jobs should be generated per employee, and not on the whole map. Then the DB should not ingest _all_ the addresses, but rather a fraction of addresses. 
- [x] ALl the jobs show up as not costing anything
- [x] There are issue with the routes schema that I have notes on
- [X] Implement licenses, levels, xp, etc. 
- [x] IN generateJobs.ts, use the job categories defined in jobCategories.ts
- [x] In generateJobs.ts, remove all profiling code.
- [x] Implement XP gain from jobs
- [x] Implement upgrade system
- [x] Implement a way to buy upgrades
- [ ] The init db script hangs on `creating schema using drizzle kit push`.  (is this still true?)
- [x] When the user clicks on a job, do stuff 
- [x] The routing server is constantly using 100% CPU
- [x] Make a config system for the game: upgrades, scaling for costs, distances, number of jobs per tile, etc.
- [ ] Remove the employee details pane
- [ ] Job selection revamp: 
    - [ ] Only show 1-3 jobs per tier for currently selected employee. 
    - [ ] Upgrades increase number of jobs shown. (vehicle upgrades and global upgrades)
    - [ ] Instead of job selection pane, it should be a tooltip on top of the map when clicking on a job marker.
    - [ ] Allow option to move the employee to a different location. 
    - [ ] Job filtering is based purely on distance from employee, so that it's consistent. 
    - [ ] Value calculation should be happening when clicking on a job, not during job generation. approximateValue field needs to be dropped.