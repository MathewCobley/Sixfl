// ========================================
// File: src/app/polls/[token]/actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseQuantity(value: FormDataEntryValue | null) {
  const parsed = Number(clean(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(999, Math.floor(parsed)));
}

export async function submitPollVoteAction(formData: FormData) {
  const token = clean(formData.get("token"));
  const note = clean(formData.get("note")) || null;
  const requestedOptionIds = Array.from(
    new Set(formData.getAll("optionId").map((value) => clean(value)).filter(Boolean)),
  );

  if (!token || requestedOptionIds.length === 0) {
    redirect(token ? `/polls/${encodeURIComponent(token)}?error=invalid` : "/");
  }

  const rows = await prisma.$queryRaw<
    Array<{ recipientId: string; pollId: string; status: string; choiceMode: string; allowQuantity: boolean }>
  >(Prisma.sql`
    SELECT
      recipient."id" AS "recipientId",
      poll."id" AS "pollId",
      poll."status",
      COALESCE(poll."choiceMode", 'SINGLE') AS "choiceMode",
      COALESCE(poll."allowQuantity", false) AS "allowQuantity"
    FROM "SIXFLPollRecipient" recipient
    INNER JOIN "SIXFLPoll" poll ON poll."id" = recipient."pollId"
    WHERE recipient."token" = ${token}
    LIMIT 1
  `);

  const poll = rows[0] ?? null;

  if (!poll || poll.status !== "ACTIVE") {
    redirect(`/polls/${encodeURIComponent(token)}?error=closed`);
  }

  const validOptions = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "SIXFLPollOption"
    WHERE "pollId" = ${poll.pollId}
      AND "id" IN (${Prisma.join(requestedOptionIds)})
  `);

  const validOptionIds = validOptions.map((option) => option.id);
  const selectedOptionIds = poll.choiceMode === "MULTIPLE"
    ? validOptionIds
    : validOptionIds.slice(0, 1);

  if (selectedOptionIds.length === 0) {
    redirect(`/polls/${encodeURIComponent(token)}?error=invalid`);
  }

  const now = new Date();
  const primaryOptionId = selectedOptionIds[0] ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "SIXFLPollRecipientOption"
      WHERE "recipientId" = ${poll.recipientId}
    `);

    for (const optionId of selectedOptionIds) {
      const quantity = poll.allowQuantity ? parseQuantity(formData.get(`quantity_${optionId}`)) : 1;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SIXFLPollRecipientOption" (
          "id",
          "recipientId",
          "pollId",
          "optionId",
          "quantity",
          "createdAt",
          "updatedAt"
        )
        VALUES (${randomUUID()}, ${poll.recipientId}, ${poll.pollId}, ${optionId}, ${quantity}, ${now}, ${now})
        ON CONFLICT ("recipientId", "optionId") DO UPDATE SET
          "quantity" = EXCLUDED."quantity",
          "updatedAt" = EXCLUDED."updatedAt"
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "SIXFLPollRecipient"
      SET
        "selectedOptionId" = ${primaryOptionId},
        "note" = ${note},
        "votedAt" = ${now},
        "updatedAt" = ${now}
      WHERE "token" = ${token}
    `);
  });

  revalidatePath(`/polls/${token}`);
  revalidatePath(`/admin/polls/${poll.pollId}`);

  redirect(`/polls/${encodeURIComponent(token)}?saved=1`);
}
