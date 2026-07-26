import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  deleteRailwayObject,
  uploadRailwayObject,
} from "@/lib/storage/railway-s3";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

type LeagueVideoRow = {
  id: string;
  name: string;
  slug: string;
  advertVideoKey: string | null;
  advertVideoFilename: string | null;
  advertVideoContentType: string | null;
  advertVideoSizeBytes: number | null;
  advertVideoEnabled: boolean;
  advertVideoUploadedAt: Date | null;
};

function sanitiseFilename(filename: string) {
  const base = filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return base || "league-advert.mp4";
}

async function getLeagueVideoRow(id: string) {
  const rows = await prisma.$queryRaw<LeagueVideoRow[]>(Prisma.sql`
    SELECT
      "id",
      "name",
      "slug",
      "advertVideoKey",
      "advertVideoFilename",
      "advertVideoContentType",
      "advertVideoSizeBytes"::int AS "advertVideoSizeBytes",
      COALESCE("advertVideoEnabled", false) AS "advertVideoEnabled",
      "advertVideoUploadedAt"
    FROM "League"
    WHERE "id" = ${id}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

function serialiseLeagueVideo(row: LeagueVideoRow) {
  return {
    leagueId: row.id,
    leagueName: row.name,
    leagueSlug: row.slug,
    hasVideo: Boolean(row.advertVideoKey),
    filename: row.advertVideoFilename,
    contentType: row.advertVideoContentType,
    sizeBytes: row.advertVideoSizeBytes,
    enabled: row.advertVideoEnabled,
    uploadedAt: row.advertVideoUploadedAt?.toISOString() ?? null,
  };
}

function refreshLeaguePaths(row: Pick<LeagueVideoRow, "id" | "slug">) {
  revalidatePath(`/admin/leagues/${row.id}`);
  revalidatePath(`/admin/leagues/${row.id}/advert-video`);
  revalidatePath(`/leagues/${row.slug}`);
  revalidatePath("/leagues");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const league = await getLeagueVideoRow(id);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  return NextResponse.json(serialiseLeagueVideo(league));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const league = await getLeagueVideoRow(id);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const video = formData.get("video");

  if (!(video instanceof File)) {
    return NextResponse.json({ error: "Choose an MP4 video to upload." }, { status: 400 });
  }

  const filename = sanitiseFilename(video.name);
  const isMp4Name = filename.endsWith(".mp4");
  const isMp4Type = video.type === "video/mp4" || video.type === "application/octet-stream";

  if (!isMp4Name || !isMp4Type) {
    return NextResponse.json(
      { error: "League adverts must be supplied as an MP4 video." },
      { status: 400 },
    );
  }

  if (video.size <= 0) {
    return NextResponse.json({ error: "The selected video is empty." }, { status: 400 });
  }

  if (video.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: "The video is larger than 50 MB. Compress it before uploading." },
      { status: 413 },
    );
  }

  const key = `league-adverts/${league.id}/${Date.now()}-${randomUUID()}-${filename}`;
  const bytes = new Uint8Array(await video.arrayBuffer());

  try {
    await uploadRailwayObject({
      key,
      body: bytes,
      contentType: "video/mp4",
    });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "League"
      SET
        "advertVideoKey" = ${key},
        "advertVideoFilename" = ${video.name.slice(0, 255)},
        "advertVideoContentType" = 'video/mp4',
        "advertVideoSizeBytes" = ${video.size},
        "advertVideoEnabled" = true,
        "advertVideoUploadedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${league.id}
    `);

    if (league.advertVideoKey && league.advertVideoKey !== key) {
      try {
        await deleteRailwayObject(league.advertVideoKey);
      } catch (error) {
        console.error("Old league advert video could not be deleted", {
          leagueId: league.id,
          key: league.advertVideoKey,
          error,
        });
      }
    }

    const updated = await getLeagueVideoRow(league.id);
    refreshLeaguePaths(league);

    return NextResponse.json(
      updated ? serialiseLeagueVideo(updated) : { ok: true },
      { status: 201 },
    );
  } catch (error) {
    console.error("League advert upload failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The league advert could not be uploaded.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const league = await getLeagueVideoRow(id);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { enabled?: unknown }
    | null;

  if (typeof payload?.enabled !== "boolean") {
    return NextResponse.json({ error: "Choose whether the video is visible." }, { status: 400 });
  }

  if (payload.enabled && !league.advertVideoKey) {
    return NextResponse.json(
      { error: "Upload a video before making it visible." },
      { status: 400 },
    );
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "advertVideoEnabled" = ${payload.enabled},
      "updatedAt" = NOW()
    WHERE "id" = ${league.id}
  `);

  const updated = await getLeagueVideoRow(league.id);
  refreshLeaguePaths(league);

  return NextResponse.json(updated ? serialiseLeagueVideo(updated) : { ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const league = await getLeagueVideoRow(id);

  if (!league) {
    return NextResponse.json({ error: "League not found." }, { status: 404 });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "League"
    SET
      "advertVideoKey" = NULL,
      "advertVideoFilename" = NULL,
      "advertVideoContentType" = NULL,
      "advertVideoSizeBytes" = NULL,
      "advertVideoEnabled" = false,
      "advertVideoUploadedAt" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${league.id}
  `);

  if (league.advertVideoKey) {
    try {
      await deleteRailwayObject(league.advertVideoKey);
    } catch (error) {
      console.error("League advert video could not be deleted from storage", {
        leagueId: league.id,
        key: league.advertVideoKey,
        error,
      });
    }
  }

  refreshLeaguePaths(league);
  return NextResponse.json({ ok: true });
}
