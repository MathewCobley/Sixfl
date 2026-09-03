import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";
import { normaliseExistingSixflTvVideoValue } from "@/lib/sixfl-tv/videos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FlagRow = {
  id: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
};

export async function GET() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<FlagRow[]>(Prisma.sql`
    SELECT
      "id",
      "sixflTvRecorded",
      "sixflTvUrl"
    FROM "Fixture"
    WHERE "sixflTvRecorded" = true
       OR "sixflTvUrl" IS NOT NULL
  `);

  return NextResponse.json({
    fixtureIds: rows.filter((row) => row.sixflTvRecorded).map((row) => row.id),
    fixtures: rows,
  });
}

export async function POST(request: Request) {
  await requireAdmin();

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
  const urlSql =
    parsedLinks === undefined
      ? Prisma.empty
      : Prisma.sql`, "sixflTvUrl" = ${storedLinks}`;

  const rows = await prisma.$queryRaw<FlagRow[]>(Prisma.sql`
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

  return NextResponse.json(rows[0]);
}
