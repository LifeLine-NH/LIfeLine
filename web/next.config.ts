import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // B's agent runner reads its prompts, scenarios and recordings relative to its own files,
  // so it runs unbundled from agents/dist (built by `pnpm build:agents`).
  serverExternalPackages: ["@lifeline/agents"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/swarm/run": ["../agents/dist/**", "../agents/scenarios/**", "../agents/recordings/**", "../agents/fixtures/**"],
    "/api/evidence/[hash]": ["storage/evidence/**"],
    "/cases/[id]": ["storage/evidence/**"],
    "/": ["storage/evidence/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
