BUGS:
- [x] Routes are not displayed on the map after accepting a job
  - **Fixed**: Added reactive dependency for routes in RouteRenderer, added routeData parsing consistency, and added validation
- [X] Employee marker position doesn't update during active job (animation)
  - **Fixed**: Added proper reactivity, and fixed a bug in the cumulative time calulation for concatenating routes.
- [X] When hiring a new employee, they don't show up on the map until refershing page.
- [X] After reaching the destination, the marker doesn't update state and should show the 'idle' state.
- [X] In the employees list, the state doesn't update when a job is started.
- [x] When accepting a job we see a 'failed to load active job' error displayed in a notification.
- [ ] The ETA in the employee card doesn't update every second, only on page refresh or if the state of another employee changes and a refersh is triggered. The ETA should be animated.
- [ ] Unaivailable employees are still shown in the dropdown for selecting an employee in the job card
- [ ] The 'complete all active routes cheat' doesn't work, and throws an error:
  ```typescript
  Error completing routes via cheat: PostgresError: syntax error at or near "="
      at ErrorResponse (file:///home/rik/git/routing-game/routing-app/node_modules/postgres/src/connection.js:794:26)
      at handle (file:///home/rik/git/routing-game/routing-app/node_modules/postgres/src/connection.js:480:6)
      at Socket.data (file:///home/rik/git/routing-game/routing-app/node_modules/postgres/src/connection.js:315:9)
      at Socket.emit (node:events:508:28)
      at addChunk (node:internal/streams/readable:559:12)
      at readableAddChunkPushByteMode (node:internal/streams/readable:510:3)
      at Readable.push (node:internal/streams/readable:390:5)
      at TCP.onStreamRead (node:internal/stream_base_commons:189:23) {
    severity_local: 'ERROR',
    severity: 'ERROR',
    code: '42601',
    position: '1046',
    file: 'scan.l',
    line: '1244',
    routine: 'scanner_yyerror'
  }
  ```

ENHANCEMENTS:
- [ ] When showing a preview of a route, the colors should be different for the route to the start, and the end marker. 
- [ ] The distance shown in the job detail card uses the wrong unit (km) instead of meters, and isn't properly formatted (big distances should switch to km). 
- [ ] The notification bubbles appear behind the map.
- [ ] Add a cheat to increase speedup by an arbitrary factor
- [ ] Moving employee markers should be a simple pin, not teh whole box with eta and progress (that belongs in a different list)
- [ ] The route end icon should be consistent between the preview and the active route. (home icon vs. finish icon.)
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
- [X] Implement licenses, levels, xp, etc. 
- [x] IN generateJobs.ts, use the job categories defined in jobCategories.ts
- [x] In generateJobs.ts, remove all profiling code.
- [ ] Implement XP gain from jobs
- [ ] Implement upgrade system
- [ ] Implement a way to buy licenses
- [ ] Implement a way to buy upgrades
- [ ] The init db script hangs on `creating schema using drizzle kit push`. 
- [ ] When the user clicks on a job, do stuff 
- [ ] The routing server is constantly using 100% CPU