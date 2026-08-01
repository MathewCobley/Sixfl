import { NextResponse } from "next/server";

import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  return NextResponse.json(
    {
      error:
        "Automatic zero-fee reconciliation is disabled. Viewing a payment page must not alter charges.",
    },
    { status: 410 },
  );
}
