BUGS:
- [ ] the house number never seems to be set. Need to investigate if the `routing_server` correctly returns it, or whether the `routing-app` is not correctly parsing the response, or whether the information disappears at some other point. 
- [ ] The interpolated position lags behind. When the route is finished, the current location is displayed behind the destination. My guess is that the begin and end nodes are not taken into account when computing the cumulative time, since the they are not included when finding the shortest path, but rather pre/appended to the path. This is thus most likely a bug in the `routing_server` code, and not the `routing-app` code. We should start with writing an integration test that the cumulative time encoded in the path corresponds to the total time of the entire route. Probably we have to adjust the total time of the route to add the time of the begin and end nodes.

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