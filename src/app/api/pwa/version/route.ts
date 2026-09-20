import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getDeploymentVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    null
  );
}

export async function GET() {
  return NextResponse.json(
    {
      version: getDeploymentVersion(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Surrogate-Control": "no-store",
      },
    },
  );
}
