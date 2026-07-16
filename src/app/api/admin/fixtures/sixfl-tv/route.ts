import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FlagRow = {
  id: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
};

function normaliseVideoUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseVideoLinks(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true as const, value: null, count: 0 };

  const parts = raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const normalised: string[] = [];
  for (const part of parts) {
    const url = normaliseVideoUrl(part);
    if (!url) {
      return { ok: false as const, value: null, count: 0 };
    }
    if (!normalised.includes(url)) normalised.push(url);
  }

  return {
    ok: true as const,
    value: normalised.length ? normalised.join("\n") : null,
    count: normalised.length,
  };
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
  const parsedLinks = suppliedUrl === undefined ? undefined : parseVideoLinks(suppliedUrl);

  if (parsedLinks && !parsedLinks.ok) {
    return NextResponse.json({ error: "Enter valid http or https video links, one per line." }, { status: 400 });
  }

  const storedLinks = parsedLinks?.value;
  const sixflTvRecorded = body?.sixflTvRecorded ?? Boolean(storedLinks);
  const urlSql = parsedLinks === undefined
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
