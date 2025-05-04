#pragma once

#include <iostream>
#include <sstream>
#include <iomanip>
#include <ctime>

namespace RoutingServer {

// Get current time as string for logging
inline std::string current_time_string() {
    auto t = std::time(nullptr);
    auto tm = *std::localtime(&t);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%H:%M:%S");
    return oss.str();
}

// Stream-style logging macro
#define LOG(msg) std::cout << "[" << RoutingServer::current_time_string() << "] " << msg << std::endl

} // namespace RoutingServer 