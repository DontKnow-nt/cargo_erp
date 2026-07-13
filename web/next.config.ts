import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    // CSP: allow same-origin scripts/styles, blob: for CSV/PDF exports,
    // data: for images, and unsafe-inline for Tailwind/inline styles.
    // Tighten unsafe-inline once a nonce-based approach is adopted.
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for Next.js dev; remove in prod
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',       // produce a minimal self-contained build for Docker
  outputFileTracingRoot: path.join(__dirname, '../'),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Reduce dev server memory: disable source maps in dev, limit bundle analysis
  webpack(config, { dev }) {
    if (dev) {
      config.devtool = false; // no source maps in dev = less RAM
    }
    // Tell webpack these heavy packages are server-only (don't bundle for client)
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      'better-sqlite3',
      'bcryptjs',
    ];
    return config;
  },
};

export default nextConfig;
