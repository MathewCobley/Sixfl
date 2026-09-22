import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { getLoanAuthorityRequests, saveLoanAuthorityRequest } from "@/lib/fixtures/loan-authority";
import { LoanAuthorityError } from "@/lib/fixtures/loan-authority-policy";
import { assertGuestApprovalOrigin, GuestApprovalError } from "@/lib/fixtures/guest-approval-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();
  const fixtureId = new URL(request.url).searchParams.get("fixtureId");
  if (!fixtureId || !/^[a-zA-Z0-9_-]{1,150}$/.test(fixtureId)) {
    return NextResponse.json({ error: "Choose a valid fixture." }, { status: 400 });
  }
  return NextResponse.json({ requests: await getLoanAuthorityRequests([fixtureId]) },
    { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user } = await requireAdmin();
  if (!user?.id) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 403 });
  try {
    assertGuestApprovalOrigin(request);
    const body = await request.json().catch(() => null);
    const saved = await saveLoanAuthorityRequest(body, user.id);
    revalidatePath("/admin/night-board");
    return NextResponse.json({ request: saved });
  } catch (error) {
    if (error instanceof LoanAuthorityError || error instanceof GuestApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
