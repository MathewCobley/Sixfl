import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FixtureNoteRow = {
  id: string;
  nightBoardNote: string | null;
};

function cleanFixtureId(value: unknown) {
  const fixtureId = String(value ?? "").trim();
  return fixtureId.slice(0, 160);
}

function cleanNote(value: unknown) {
  const note = String(value ?? "").replace(/\s+/g, " ").trim();
  return note ? note.slice(0, 240) : null;
}

async function getFixtureNote(fixtureId: string) {
  const rows = await prisma.$queryRaw<FixtureNoteRow[]>(Prisma.sql`
    SELECT "id", "nightBoardNote"
    FROM "Fixture"
    WHERE "id" = ${fixtureId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const fixtureId = cleanFixtureId(url.searchParams.get("fixtureId"));
  if (!fixtureId) {
    return NextResponse.json({ error: "Fixture ID is required." }, { status: 400 });
  }

  const fixture = await getFixtureNote(fixtureId);
  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  return NextResponse.json(
    { fixtureId: fixture.id, note: fixture.nightBoardNote },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = (await request.json().catch(() => null)) as
    | { fixtureId?: unknown; note?: unknown }
    | null;
  const fixtureId = cleanFixtureId(body?.fixtureId);
  const note = cleanNote(body?.note);

  if (!fixtureId) {
    return NextResponse.json({ error: "Fixture ID is required." }, { status: 400 });
  }

  const existing = await getFixtureNote(fixtureId);
  if (!existing) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Fixture"
    SET "nightBoardNote" = ${note}, "updatedAt" = NOW()
    WHERE "id" = ${fixtureId}
  `);

  revalidatePath("/admin/night-board");
  revalidatePath("/admin/fixtures");

  return NextResponse.json({ ok: true, fixtureId, note });
}
