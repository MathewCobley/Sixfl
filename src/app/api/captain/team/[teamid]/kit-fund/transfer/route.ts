import { NextResponse } from "next/server";

import { moveTeamCreditToKitFund } from "@/lib/kits/kit-fund";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const body = (await request.json().catch(() => null)) as
    | { amountPence?: unknown }
    | null;
  const amountPence = Number(body?.amountPence);

  if (!Number.isInteger(amountPence) || amountPence <= 0) {
    return NextResponse.json(
      { error: "Choose an amount greater than £0.00." },
      { status: 400 },
    );
  }

  try {
    const result = await moveTeamCreditToKitFund({
      teamId: teamid,
      amountPence,
      createdByUserId: access.user?.id ?? null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The credit could not be moved to the kit fund.",
      },
      { status: 400 },
    );
  }
}
