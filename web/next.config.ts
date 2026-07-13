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
  ...(process.env.CF_PAGES === '1' ? {} : {
    output: 'standalone',       // produce a minimal self-contained build for Docker
    outputFileTracingRoot: path.join(__dirname, '../'),
  }),
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
  webpack(config, { dev, isServer, webpack }) {
    if (dev) {
      config.devtool = false; // no source maps in dev = less RAM
    }
    // Tell webpack these heavy packages are server-only (don't bundle for client)
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      'better-sqlite3',
    ];
    config.resolve.alias = {
      ...config.resolve.alias,
      crypto: require.resolve('crypto-browserify'),
      'node:crypto': require.resolve('crypto-browserify'),
      url: require.resolve('url/'),
      'node:url': require.resolve('url/'),
      https: require.resolve('https-browserify'),
      'node:https': require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      'node:http': require.resolve('stream-http'),
      querystring: require.resolve('querystring-es3'),
      'node:querystring': require.resolve('querystring-es3'),
      buffer: require.resolve('buffer/'),
      'node:buffer': require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      'node:stream': require.resolve('stream-browserify'),
      util: require.resolve('util/'),
      'node:util': require.resolve('util/'),
      vm: false,
      'node:vm': false,
    };

    const polyfills = {
      crypto: require.resolve('crypto-browserify'),
      url: require.resolve('url/'),
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      querystring: require.resolve('querystring-es3'),
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
    };

    for (const [name, path] of Object.entries(polyfills)) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          new RegExp(`^(node:)?${name}$`),
          path
        )
      );
    }

    config.plugins.push(
      new webpack.DefinePlugin({
        'process.version': JSON.stringify('v18.0.0'),
      })
    );
    return config;
  },
};

export default nextConfig;
