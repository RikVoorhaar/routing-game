BUGS:
- [ ] In the character select, we need to refresh to see a newly created character.
- [ ] The create new character modal has a transpaent background.
- [ ] The nav bar is copied in multiple places and contains bogus links
- [ ] Deleteing a character is stuck on a loop, refresh to fix. This is a UI bug.

ENHANCEMENTS:
- [ ] the default employee location should be queried from the routing server

LOGGING:
- [ ] Health checks shouldn't be logged 
- [ ] The logs should mention a request ID in each logging line for traceability.


DEV:
- [ ] The UI is pretty bad for the employee card
- [x] Once a route is finished, it doesn't mark as completed
- [ ] The rewards are way too low
- [ ] Currency should be a float
- [ ] end address is formatted as coords, but start is a string