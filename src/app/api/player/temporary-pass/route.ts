import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createTemporaryPlayerPass,
  getTemporaryPlayerPassChoices,
  listTemporaryPlayerPasses,
  revokeTemporaryPlayerPass,
  TemporaryPlayerPassError,
} from "@/lib/temporary-player-passes";

function previewMembershipIdFromRequest(
  request: Request,
  explicitValue?: unknown,
) {
  const explicit = String(explicitValue ?? "").trim();
  if (explicit) return explicit;

  try {
    const requestUrl = new URL(request.url);
    const queryValue = requestUrl.searchParams.get("previewMembershipId")?.trim();
    if (queryValue) return queryValue;

    const referer = request.headers.get("referer")?.trim();
    if (!referer) return null;

    const refererUrl = new URL(referer);
    if (refererUrl.origin !== requestUrl.origin) return null;
    return refererUrl.searchParams.get("previewMembershipId")?.trim() || null;
  } catch {
    return null;
  }
}

async function requirePlayerUser(
  request: Request,
  explicitPreviewMembershipId?: unknown,
) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const sessionUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!sessionUser) return null;

  const previewMembershipId = previewMembershipIdFromRequest(
    request,
    explicitPreviewMembershipId,
  );

  if (previewMembershipId && sessionUser.role === UserRole.ADMIN) {
    const previewMembership = await prisma.teamMember.findUnique({
      where: { id: previewMembershipId },
      select: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (previewMembership?.user) {
      return previewMembership.user;
    }
  }

  return {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
  };
}

function passErrorResponse(error: unknown) {
  if (error instanceof TemporaryPlayerPassError) {
    const status =
      error.code === "ALREADY_ADDED" || error.code === "ALREADY_IN_SQUAD"
        ? 409
        : error.code === "FIXTURE_NOT_FOUND"
          ? 404
          : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  console.error("Temporary-player pass request failed", error);
  return NextResponse.json(
    { error: "The temporary-player pass could not be updated. Please try again." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const user = await requirePlayerUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const [choices, passes] = await Promise.all([
      getTemporaryPlayerPassChoices(user.id),
      listTemporaryPlayerPasses(user.id),
    ]);

    return NextResponse.json(
      {
        player: {
          firstName: user.name?.trim().split(/\s+/)[0] || "Player",
        },
        choices,
        passes,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return passErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        fixtureId?: unknown;
        teamId?: unknown;
        previewMembershipId?: unknown;
      }
    | null;
  const user = await requirePlayerUser(request, body?.previewMembershipId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const fixtureId = String(body?.fixtureId ?? "").trim();
  const teamId = String(body?.teamId ?? "").trim();

  if (!fixtureId || !teamId) {
    return NextResponse.json(
      { error: "Choose the team and fixture you want to share with." },
      { status: 400 },
    );
  }

  try {
    const pass = await createTemporaryPlayerPass({
      userId: user.id,
      fixtureId,
      teamId,
    });
    return NextResponse.json({ ok: true, pass });
  } catch (error) {
    return passErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { passId?: unknown; previewMembershipId?: unknown }
    | null;
  const user = await requirePlayerUser(request, body?.previewMembershipId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const passId = String(body?.passId ?? "").trim();

  if (!passId) {
    return NextResponse.json(
      { error: "Temporary-player pass not found." },
      { status: 400 },
    );
  }

  try {
    const revoked = await revokeTemporaryPlayerPass({ userId: user.id, passId });
    if (!revoked) {
      return NextResponse.json(
        { error: "That pass has already been used, cancelled or expired." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return passErrorResponse(error);
  }
}
