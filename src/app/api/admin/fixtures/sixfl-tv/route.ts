import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";
import { normaliseExistingSixflTvVideoValue } from "@/lib/sixfl-tv/videos";
import { VeoBookingError } from "@/lib/veo/fixture-bookings";
import { confirmNightBoardVeoFixture } from "@/lib/veo/night-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FlagRow = {
  id: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
  veoBookingConfirmed: boolean;
};

export async function GET() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<FlagRow[]>(Prisma.sql`
    SELECT
      f."id",
      f."sixflTvRecorded",
      f."sixflTvUrl",
      EXISTS (
        SELECT 1 FROM "VeoMatchBooking" b
        WHERE b."fixtureId" = f.id AND b.state IN ('PLANNED', 'READY')
      ) AS "veoBookingConfirmed"
    FROM "Fixture" f
    WHERE f."sixflTvRecorded" = true
       OR f."sixflTvUrl" IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM "VeoMatchBooking" b
         WHERE b."fixtureId" = f.id AND b.state IN ('PLANNED', 'READY')
       )
  `);

  return NextResponse.json({
    fixtureIds: rows.filter((row) => row.sixflTvRecorded).map((row) => row.id),
    fixtures: rows,
  });
}

export async function POST(request: Request) {
  const { user } = await requireAdmin();

  const body = (await request.json().catch(() => null)) as {
    fixtureId?: string;
    sixflTvRecorded?: boolean;
    sixflTvUrl?: string | null;
  } | null;

  const fixtureId = body?.fixtureId?.trim() ?? "";
  if (!fixtureId) {
    return NextResponse.json({ error: "Fixture ID is required." }, { status: 400 });
  }

  const suppliedUrl = typeof body?.sixflTvUrl === "string" ? body.sixflTvUrl : undefined;
  const parsedLinks =
    suppliedUrl === undefined ? undefined : normaliseExistingSixflTvVideoValue(suppliedUrl);

  if (parsedLinks && !parsedLinks.ok) {
    return NextResponse.json(
      { error: "Enter valid http or https video links." },
      { status: 400 },
    );
  }

  const storedLinks = parsedLinks?.value;
  const sixflTvRecorded = body?.sixflTvRecorded ?? Boolean(storedLinks);
  let veoBookingConfirmed = false;
  let acceptedVeoRequests = 0;

  if (sixflTvRecorded && suppliedUrl === undefined && user?.id) {
    try {
      const result = await confirmNightBoardVeoFixture({ fixtureId, actorId: user.id });
      veoBookingConfirmed = result.bookingConfirmed;
      acceptedVeoRequests = result.acceptedRequests;
    } catch (error) {
      if (error instanceof VeoBookingError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("Night Board Veo confirmation failed", error);
      return NextResponse.json(
        { error: "Could not confirm this Veo booking. Refresh the Night Board and try again." },
        { status: 500 },
      );
    }
  }

  if (!sixflTvRecorded && suppliedUrl === undefined) {
    const activeBooking = await prisma.$queryRaw<Array<{ state: string }>>(Prisma.sql`
      SELECT state FROM "VeoMatchBooking"
      WHERE "fixtureId" = ${fixtureId} AND state IN ('PLANNED', 'READY')
      LIMIT 1
    `);
    if (activeBooking[0]) {
      return NextResponse.json(
        {
          error:
            "This match is a confirmed Veo booking. Cancel it from the league Veo Priority page rather than unticking it on the Night Board.",
        },
        { status: 409 },
      );
    }
  }

  const urlSql =
    parsedLinks === undefined
      ? Prisma.empty
      : Prisma.sql`, "sixflTvUrl" = ${storedLinks}`;

  const rows = await prisma.$queryRaw<Array<Omit<FlagRow, "veoBookingConfirmed">>>(Prisma.sql`
    UPDATE "Fixture"
    SET
      "sixflTvRecorded" = ${sixflTvRecorded},
      "updatedAt" = NOW()
      ${urlSql}
    WHERE "id" = ${fixtureId}
    RETURNING "id", "sixflTvRecorded", "sixflTvUrl"
  `);

  if (!rows[0]) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  if (parsedLinks?.count && parsedLinks.count > 0) {
    try {
      await queueSixflTvFixtureUploadedEmailsOnce(fixtureId);
    } catch (error) {
      console.error("Failed to queue SIXFL TV fixture emails", error);
    }
  }

  return NextResponse.json({
    ...rows[0],
    veoBookingConfirmed,
    acceptedVeoRequests,
  });
}
