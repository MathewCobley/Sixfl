import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FlagRow = {
  id: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
};

function normaliseVideoUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

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
  const normalisedUrl = suppliedUrl === undefined ? undefined : normaliseVideoUrl(suppliedUrl);

  if (suppliedUrl !== undefined && suppliedUrl.trim() && !normalisedUrl) {
    return NextResponse.json({ error: "Enter a valid video URL." }, { status: 400 });
  }

  const sixflTvRecorded = body?.sixflTvRecorded ?? Boolean(normalisedUrl);
  const urlSql = normalisedUrl === undefined
    ? Prisma.empty
    : Prisma.sql`, "sixflTvUrl" = ${normalisedUrl}`;

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

  return NextResponse.json(rows[0]);
}
