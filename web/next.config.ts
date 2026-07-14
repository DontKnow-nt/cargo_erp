import type { NextConfig } from "next";

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
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
  webpack(config, { dev, isServer, webpack }) {
    if (dev) {
      config.devtool = false; // no source maps in dev = less RAM
    }

    // Exclude packages that are never available in any runtime
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      'better-sqlite3',
    ];

    // Client-side builds need browser polyfills for Node.js built-ins
    // (used by dependencies like crypto-browserify, stream-browserify etc.)
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

    const polyfills: Record<string, string | false> = {
      crypto: require.resolve('crypto-browserify'),
      url: require.resolve('url/'),
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      querystring: require.resolve('querystring-es3'),
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
    };

    for (const [name, resolvedPath] of Object.entries(polyfills)) {
      if (resolvedPath) {
        config.plugins.push(
          new webpack.NormalModuleReplacementPlugin(
            new RegExp(`^(node:)?${name}$`),
            resolvedPath as string
          )
        );
      }
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
