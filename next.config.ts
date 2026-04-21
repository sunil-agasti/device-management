import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['child_process'],
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
