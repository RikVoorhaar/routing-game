BUGS:
- [x] In the character select, we need to refresh to see a newly created character.
- [x] The nav bar is copied in multiple places and contains bogus links
- [x] Deleteing a character is stuck on a loop, refresh to fix. This is a UI bug.
- [x] When a route is active on another employee, selecting a route on a different employee makes the route deselected very quickly. It is still possible to start the route if you click on it quickly enough.
- [ ] The duration of a route is not formatted correctly, we should make a time fromatting function and use it for the route time in the routing card
- [ ] Old routes aren't purged. When a route is generated , the other routes associated to the employee should be deleted. There also should on game load be a check to delete routes that have expired. 

ENHANCEMENTS:
- [ ] the default employee location should be queried from the routing server

LOGGING:
- [ ] Health checks shouldn't be logged 
- [ ] The logs should mention a request ID in each logging line for traceability.


DEV:
- [x] The UI is pretty bad for the employee card
- [x] Once a route is finished, it doesn't mark as completed
- [ ] The rewards are way too low
- [x] Currency should be a float
- [x] end address is formatted as coords, but start is a string