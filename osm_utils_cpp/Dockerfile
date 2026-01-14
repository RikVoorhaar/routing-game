FROM debian:bookworm-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    zlib1g-dev \
    libosmium-dev \
    libgeos++-dev \
    libgeos-dev \
    libyaml-cpp-dev \
    wget \
    linux-perf \
    && rm -rf /var/lib/apt/lists/*

# Download nlohmann/json (header-only library)
RUN mkdir -p /usr/include/nlohmann && \
    wget -q https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp -O /usr/include/nlohmann/json.hpp

# Set working directory
WORKDIR /app

# Copy osm_utils_cpp directory
COPY . /app/osm_utils_cpp

# Build trim_and_extract and extract_categorized_places
# DEBUG build argument can be set to build with debug symbols for profiling
# Usage: docker build --build-arg DEBUG=1 -t osm_utils_cpp .
ARG DEBUG
ENV DEBUG=${DEBUG}
WORKDIR /app/osm_utils_cpp
RUN rm -rf build && \
    mkdir -p build && \
    cd build && \
    cmake .. && \
    make -j$(nproc) trim_and_extract extract_categorized_places

# Set working directory to build directory for easy execution
WORKDIR /app/osm_utils_cpp/build

# Default command
CMD ["./extract_categorized_places"]
