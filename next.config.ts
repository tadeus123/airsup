import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/plugin/openapi.yaml", destination: "/api/plugin/openapi" },
      { source: "/plugin/openapi.yml", destination: "/api/plugin/openapi" },
      { source: "/mcp", destination: "/api/mcp" },
      { source: "/mcp/:path*", destination: "/api/mcp" },
      { source: "/agent/watch", destination: "/api/watch" },
      { source: "/agent/watch/push", destination: "/api/watch/push" },
    ];
  },
};

export default nextConfig;
