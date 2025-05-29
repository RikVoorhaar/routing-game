FROM debian:bookworm-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libssl-dev \
    zlib1g-dev \
    curl \
    jq \
    wget \
    libboost-system-dev \
    libboost-date-time-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Crow
RUN wget https://github.com/CrowCpp/Crow/releases/download/v1.0%2B5/crow-v1.0+5.deb && \
    apt-get update && \
    apt-get install -y ./crow-v1.0+5.deb && \
    rm crow-v1.0+5.deb && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy only RoutingKit and routing_server directories
COPY RoutingKit /app/RoutingKit
COPY routing_server /app/routing_server

# Remove tests directory if it exists
RUN rm -rf /app/routing_server/tests

# Create data directory
RUN mkdir -p /data

# Environment variables
ENV OSM_FILE=""
ENV ADDRESS_FILE=""
ENV PORT=8080

# Build RoutingKit
RUN cd /app/RoutingKit && make -j$(nproc)

# Build the routing server (without tests)
WORKDIR /app/routing_server
RUN mkdir -p build && \
    cd build && \
    cmake -DBUILD_TESTING=OFF .. && \
    make -j$(nproc) routing_server

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose the port
EXPOSE ${PORT}

# Create entrypoint script
RUN echo '#!/bin/bash\n\
if [ -z "$OSM_FILE" ]; then\n\
  echo "ERROR: OSM_FILE environment variable must be set"\n\
  exit 1\n\
fi\n\
\n\
ARGS="$OSM_FILE"\n\
\n\
if [ -n "$ADDRESS_FILE" ]; then\n\
  ARGS="$ARGS $ADDRESS_FILE"\n\
fi\n\
\n\
exec /app/routing_server/build/routing_server $ARGS\n' > /app/routing_server/entrypoint.sh && \
    chmod +x /app/routing_server/entrypoint.sh

ENTRYPOINT ["/app/routing_server/entrypoint.sh"] 