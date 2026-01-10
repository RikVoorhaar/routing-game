FROM debian:bookworm-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    zlib1g-dev \
    libosmium-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Download nlohmann/json (header-only library)
RUN mkdir -p /usr/include/nlohmann && \
    wget -q https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp -O /usr/include/nlohmann/json.hpp

# Set working directory
WORKDIR /app

# Copy osm_utils_cpp directory
COPY . /app/osm_utils_cpp

# Build trim_and_extract
WORKDIR /app/osm_utils_cpp
RUN rm -rf build && \
    mkdir -p build && \
    cd build && \
    cmake .. && \
    make -j$(nproc) trim_and_extract

# Set working directory to build directory for easy execution
WORKDIR /app/osm_utils_cpp/build

# Default command
CMD ["./trim_and_extract"]
