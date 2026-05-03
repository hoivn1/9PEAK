import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve project root cross-platform (Windows + Linux + Mac)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // [9peak-fork] v0.5.1 — playwright-core removed (decouple GPT Checker into
  // standalone tools/collector tool). Only keep better-sqlite3 external.
  serverExternalPackages: ["better-sqlite3"],
  // [9peak-fork] Force-include MITM module siblings in standalone output.
  // server.js spawns dynamically and does require('./logger') etc. — Next's
  // automatic file tracing only catches server.js itself. Without this,
  // MITM throws "Cannot find module './logger'" on production install.
  outputFileTracingIncludes: {
    "*": [
      "./src/mitm/**/*",
    ],
  },
  images: {
    unoptimized: true
  },
  env: {},
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Explicit path aliases — bulletproof against jsconfig.json quirks
    // (works identically on Windows/Linux/Mac, any Node version).
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
      "open-sse": path.resolve(__dirname, "open-sse"),
    };
    // Stop watching logs directory to prevent HMR during streaming
    config.watchOptions = { ...config.watchOptions, ignored: /[\\/](logs|\.next)[\\/]/ };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
