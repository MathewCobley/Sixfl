// ========================================
// File: src/app/(admin)/admin/polls/actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

function parseOptions(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, arr) => arr.findIndex((other) => other.toLowerCase() === line.toLowerCase()) === index);
}

function parsePollStatus(value: FormDataEntryValue | null) {
  const status = clean(value).toUpperCase();
  return ["DRAFT", "ACTIVE", "CLOSED"].includes(status) ? status : "ACTIVE";
}

function buildPollRedirect(pollId: string, params?: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return `/admin/polls/${pollId}${query ? `?${query}` : ""}`;
}

async function makeUniqueSlug(title: string) {
  const base = slugify(title) || `poll-${Date.now()}`;
  let slug = base;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "SIXFLPoll"
      WHERE "slug" = ${slug}
      LIMIT 1
    `);

    if (!existing[0]) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function createPollAction(formData: FormData) {
  await requireAdmin();

  const title = clean(formData.get("title"));
  const question = clean(formData.get("question"));
  const options = parseOptions(clean(formData.get("options")));

  if (!title || !question || options.length < 2) {
    redirect("/admin/polls?error=invalid_poll");
  }

  const pollId = randomUUID();
  const slug = await makeUniqueSlug(title);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "SIXFLPoll" ("id", "title", "question", "slug", "status", "createdAt", "updatedAt")
      VALUES (${pollId}, ${title}, ${question}, ${slug}, 'ACTIVE', ${now}, ${now})
    `);

    for (const [index, label] of options.entries()) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SIXFLPollOption" ("id", "pollId", "label", "sortOrder", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${pollId}, ${label}, ${index + 1}, ${now}, ${now})
      `);
    }
  });

  revalidatePath("/admin/polls");
  redirect(buildPollRedirect(pollId, { created: 1 }));
}

export async function updatePollAction(formData: FormData) {
  await requireAdmin();

  const pollId = clean(formData.get("pollId"));
  const title = clean(formData.get("title"));
  const question = clean(formData.get("question"));
  const status = parsePollStatus(formData.get("status"));
  const optionIds = formData.getAll("optionId").map((value) => clean(value)).filter(Boolean);
  const optionLabels = formData.getAll("optionLabel").map((value) => clean(value));
  const newOptions = parseOptions(clean(formData.get("newOptions")));

  if (!pollId || !title || !question) {
    redirect(pollId ? `/admin/polls/${pollId}/edit?error=invalid_poll` : "/admin/polls?error=invalid_poll");
  }

  const pollRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "SIXFLPoll"
    WHERE "id" = ${pollId}
    LIMIT 1
  `);

  if (!pollRows[0]) redirect("/admin/polls?error=poll_not_found");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "SIXFLPoll"
      SET "title" = ${title},
          "question" = ${question},
          "status" = ${status},
          "updatedAt" = ${now}
      WHERE "id" = ${pollId}
    `);

    for (const [index, optionId] of optionIds.entries()) {
      const label = optionLabels[index]?.trim();
      if (!label) continue;

      await tx.$executeRaw(Prisma.sql`
        UPDATE "SIXFLPollOption"
        SET "label" = ${label},
            "sortOrder" = ${index + 1},
            "updatedAt" = ${now}
        WHERE "id" = ${optionId}
          AND "pollId" = ${pollId}
      `);
    }

    const [maxSortRow] = await tx.$queryRaw<Array<{ maxSortOrder: number | null }>>(Prisma.sql`
      SELECT MAX("sortOrder")::int AS "maxSortOrder"
      FROM "SIXFLPollOption"
      WHERE "pollId" = ${pollId}
    `);
    const startSort = Number(maxSortRow?.maxSortOrder ?? optionIds.length);

    for (const [index, label] of newOptions.entries()) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SIXFLPollOption" ("id", "pollId", "label", "sortOrder", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${pollId}, ${label}, ${startSort + index + 1}, ${now}, ${now})
      `);
    }
  });

  revalidatePath("/admin/polls");
  revalidatePath(`/admin/polls/${pollId}`);
  revalidatePath(`/admin/polls/${pollId}/edit`);
  redirect(buildPollRedirect(pollId, { updated: 1 }));
}

export async function addPollRecipientAction(formData: FormData) {
  await requireAdmin();

  const pollId = clean(formData.get("pollId"));
  const teamName = clean(formData.get("teamName"));
  const contactName = clean(formData.get("contactName")) || null;
  const contactEmail = clean(formData.get("contactEmail")) || null;
  const contactPhone = clean(formData.get("contactPhone")) || null;

  if (!pollId || !teamName) {
    redirect("/admin/polls?error=invalid_recipient");
  }

  const poll = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "SIXFLPoll"
    WHERE "id" = ${pollId}
    LIMIT 1
  `);

  if (!poll[0]) redirect("/admin/polls?error=poll_not_found");

  const now = new Date();

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SIXFLPollRecipient" (
      "id",
      "pollId",
      "teamName",
      "contactName",
      "contactEmail",
      "contactPhone",
      "token",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${pollId},
      ${teamName},
      ${contactName},
      ${contactEmail},
      ${contactPhone},
      ${randomUUID().replaceAll("-", "")},
      ${now},
      ${now}
    )
  `);

  revalidatePath("/admin/polls");
  revalidatePath(`/admin/polls/${pollId}`);
  redirect(buildPollRedirect(pollId, { recipient: "added" }));
}

export async function updatePollStatusAction(formData: FormData) {
  await requireAdmin();

  const pollId = clean(formData.get("pollId"));
  const status = clean(formData.get("status")).toUpperCase();

  if (!pollId || !["DRAFT", "ACTIVE", "CLOSED"].includes(status)) {
    redirect("/admin/polls?error=invalid_status");
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "SIXFLPoll"
    SET "status" = ${status}, "updatedAt" = ${new Date()}
    WHERE "id" = ${pollId}
  `);

  revalidatePath("/admin/polls");
  revalidatePath(`/admin/polls/${pollId}`);
  redirect(buildPollRedirect(pollId, { status: status.toLowerCase() }));
}

export async function deletePollRecipientAction(formData: FormData) {
  await requireAdmin();

  const pollId = clean(formData.get("pollId"));
  const recipientId = clean(formData.get("recipientId"));

  if (!pollId || !recipientId) redirect("/admin/polls?error=invalid_recipient");

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "SIXFLPollRecipient"
    WHERE "id" = ${recipientId}
      AND "pollId" = ${pollId}
  `);

  revalidatePath(`/admin/polls/${pollId}`);
  redirect(buildPollRedirect(pollId, { recipient: "removed" }));
}
