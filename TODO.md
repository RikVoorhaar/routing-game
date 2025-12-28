BUGS:
- [ ] Only one marker is animated at the same time, the others are frozen.
- [ ] The notification bubbles appear behind the map.
- [ ] The route end icon should be consistent between the preview and the active route. (home icon vs. finish icon.)
- [ ] When accepting a job, it still displays the route in orange from another employee to the job's start location.
- [ ] When opening character selection screen it shows 'create your first character' when existing characters haven't been loaded yet. INstead there should be a loading screen of sorts. 
- [ ] When no upgrades are available, there is an undefined glyph.

ENHANCEMENTS:
- [ ] Make job-progress smooth (use css animations, not per second updates)
- [ ] Allow a 'cancel job' button that just stops the job, doesn't award money and leaves the employee wherever they happen to be. 
- [ ] When showing a preview of a route, the colors should be different for the route to the start, and the end marker. 
- [ ] The distance shown in the job detail card uses the wrong unit (km) instead of meters, and isn't properly formatted (big distances should switch to km). 
- [ ] Moving employee markers should be a simple pin, not teh whole box with eta and progress (that belongs in a different list). Perhaps just a simple circular progress bar, and inside there is an ETA number. 
- [ ] When receiving money, notification should appear in appropriate place (e.g. floating on top of the interface, animated and fading up)
- [ ] When clicking on an employee it is highlighted, and highlighted employees are stored in a store. 
- [ ] When an employee is selected, the route map should pan to the employee's location. If the employee is on a route, the zoom should be such that the entire route is visible. If no route is active, just pan and don't change the zoom. If there are available routes, then show the available routes on the map and zoom/pan to make sure all routes are visible.
- [ ] When selecting a route, pan and zoom on the route. When starting a route, the pan/zoom shouldn't change because it already shows the route.
- [ ] Starting location should be part of the config
- [ ] Copyright notice in footer should reference Rik Voorhaar. 
- [ ] job categories that are not unlocked should be shown as locked. 

BALANCING:
- [ ] Balancing: The upgrade costs are too high. They should be reduced. Alternatively, we can make the money earned be much higher. 
- [ ] Balancing: higher tiers should have much longer distances than they do now. 

LOGGING:
- [ ] Health checks shouldn't be logged  (server)
- [ ] The logs should mention a request ID in each logging line for traceability. (server)
- [ ] Improve logging framework (app)
- [ ] Mark debug logging as debug (app)


DEV / NEW FEATURES:
- [ ] Add batched API endpoint to routing server for processing multiple routing requests in one call (performance optimization)
- [ ] Many (1-2%) jobs fail to generate and are skipped. What are the causes of these skips, and are they necessary?
- [x] Purge dead code
- [ ] Job selection revamp: 
    - [ ] Only show 1-3 jobs per tier for currently selected employee. 
    - [ ] Upgrades increase number of jobs shown. (vehicle upgrades and global upgrades)
    - [ ] Instead of job selection pane, it should be a tooltip on top of the map when clicking on a job marker.
    - [ ] Allow option to move the employee to a different location. 
    - [ ] Job filtering is based purely on distance from employee, so that it's consistent. 
    - [ ] Value calculation should be happening when clicking on a job, not during job generation. approximateValue field needs to be dropped.
