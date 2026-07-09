// ========================================
// File: src/app/polls/[token]/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function submitPollVoteAction(formData: FormData) {
  const token = clean(formData.get("token"));
  const optionId = clean(formData.get("optionId"));
  const note = clean(formData.get("note")) || null;

  if (!token || !optionId) {
    redirect("/");
  }

  const rows = await prisma.$queryRaw<Array<{ pollId: string; status: string }>>(Prisma.sql`
    SELECT poll."id" AS "pollId", poll."status"
    FROM "SIXFLPollRecipient" recipient
    INNER JOIN "SIXFLPoll" poll ON poll."id" = recipient."pollId"
    INNER JOIN "SIXFLPollOption" option ON option."id" = ${optionId} AND option."pollId" = poll."id"
    WHERE recipient."token" = ${token}
    LIMIT 1
  `);

  const poll = rows[0] ?? null;

  if (!poll || poll.status !== "ACTIVE") {
    redirect(`/polls/${encodeURIComponent(token)}?error=closed`);
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "SIXFLPollRecipient"
    SET
      "selectedOptionId" = ${optionId},
      "note" = ${note},
      "votedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "token" = ${token}
  `);

  revalidatePath(`/polls/${token}`);
  revalidatePath(`/admin/polls/${poll.pollId}`);

  redirect(`/polls/${encodeURIComponent(token)}?saved=1`);
}
