// ========================================
// File: src/app/(admin)/admin/teams/[id]/captain-admin-view/route.ts
// ========================================

import { NextResponse } from "next/server";

import { CAPTAIN_ONLY_PREVIEW_COOKIE } from "@/lib/requireCaptain";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();

  const { id } = await params;
  const url = new URL(request.url);
  const target = new URL(`/captain/team/${id}`, url.origin);
  const response = NextResponse.redirect(target);

  response.cookies.delete(CAPTAIN_ONLY_PREVIEW_COOKIE);

  return response;
}
