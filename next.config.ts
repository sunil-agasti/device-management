import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  serverExternalPackages: ['child_process'],
  devIndicators: false,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async rewrites() {
    return [
      {
        source: '/device-management-portal',
        destination: '/',
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/device-management-portal',
        permanent: false,
        has: [{ type: 'header', key: 'accept', value: '(?!.*application/json).*text/html.*' }],
      },
    ];
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
