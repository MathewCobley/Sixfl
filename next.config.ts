// ========================================
// File: next.config.ts
// ========================================

import type { NextConfig } from "next";

const rawDeploymentId =
  process.env.NEXT_DEPLOYMENT_ID ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "";

const deploymentId = rawDeploymentId
  .replace(/[^a-zA-Z0-9_-]/g, "")
  .slice(0, 128);

const nextConfig: NextConfig = {
  ...(deploymentId ? { deploymentId } : {}),
  outputFileTracingExcludes: {
    // Version-control history is never a runtime dependency.
    "/*": ["./.git/**/*"],
    // These routes list database metadata or fetch original artwork via
    // bounded HTTPS / the badge store; public files remain static assets.
    "/api/admin/teams/logo-export": ["./public/**/*"],
    "/admin/teams/logos": ["./public/**/*"],
    "/api/admin/night-board/night-fixtures": ["./public/Kits/**/*"],
    "/api/social/image/**": ["./public/Kits/**/*"],
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "apextrailers.co.uk",
          },
        ],
        destination: "/coming-soon",
        permanent: false,
      },
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "www.apextrailers.co.uk",
          },
        ],
        destination: "/coming-soon",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
