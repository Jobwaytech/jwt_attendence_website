import type { NextConfig } from "next";

const apiBaseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:5001").replace(/\/$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.12", "192.168.1.10"],
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
