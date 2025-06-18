BUGS:

ENHANCEMENTS:
- [ ] When clicking on an employee it is highlighted, and highlighted employees are stored in a store. 
- [ ] When an employee is selected, the route map should pan to the employee's location. If the employee is on a route, the zoom should be such that the entire route is visible. If no route is active, just pan and don't change the zoom. If there are available routes, then show the available routes on the map and zoom/pan to make sure all routes are visible.
- [ ] When selecting a route, pan and zoom on the route. When starting a route, the pan/zoom shouldn't change because it already shows the route.

Contrary to what LLM claims, the routes aren't displayed, and clicking on an employee doesn't pan / zoom to the employee. 

- [ ] The map markers should also show the ETA, and not just a progress bar

LOGGING:
- [ ] Health checks shouldn't be logged  (server)
- [ ] The logs should mention a request ID in each logging line for traceability. (server)
- [ ] Improve logging framework (app)
- [ ] Mark debug logging as debug (app)


DEV:
- [x] The UI is pretty bad for the employee card
- [x] Once a route is finished, it doesn't mark as completed
- [ ] The rewards are way too low
- [x] Currency should be a float
- [x] end address is formatted as coords, but start is a string
- [ ] Add batched API endpoint to routing server for processing multiple routing requests in one call (performance optimization)
- [ ] Many (1-2%) jobs fail to generate and are skipped. What are the causes of these skips, and are they necessary?
- [ ] ALl the jobs show up as not costing anything
- [ ] There are issue with the routes schema that I have notes on
- [ ] Jobs shouldn't be allowed to be generated too close to each other. E.g. they need to be at least 20m apart.
- [ ] The current max of 100 jobs per tile is too large, reduce to like 25
- [ ] remove the restriction that jobs aren't shown at tile levels below 12
- [ ] Add filters to the map jobs, in particular checkboxes for each category, and a min/max slider for the tier. When you select an employee it should automatically adjust the _max_ tier, and the categories to those unlocked. 
- [ ] Implement licenses, levels, xp, etc. 
- [ ] IN generateJobs.ts, use the job categories defined in jobCategories.ts
- [ ] In generateJobs.ts, remove all profiling code.