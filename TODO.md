BUGS:
- [ ] the house number never seems to be set. Need to investigate if the `routing_server` correctly returns it, or whether the `routing-app` is not correctly parsing the response, or whether the information disappears at some other point. 

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