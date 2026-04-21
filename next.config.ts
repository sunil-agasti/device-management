import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['child_process'],
  devIndicators: false,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, x-csrf-token' },
          { key: 'Access-Control-Max-Age', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;
