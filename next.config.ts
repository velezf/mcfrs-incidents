import type { NextConfig } from "next";

/** The browser talks to /api/*; Next forwards it to the Python service (API_URL). No upstream secrets live here. */
const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
