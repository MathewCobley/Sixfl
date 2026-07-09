// ========================================
// File: src/app/polls/[token]/vote/[optionId]/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function redirectToPoll(token: string, state: "saved" | "closed" | "invalid") {
  const url = new URL(`/polls/${encodeURIComponent(token)}`, `${getPublicSiteUrl()}/`);

  if (state === "saved") url.searchParams.set("saved", "1");
  if (state === "closed") url.searchParams.set("error", "closed");
  if (state === "invalid") url.searchParams.set("error", "invalid");

  return NextResponse.redirect(url, 303);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; optionId: string }> },
) {
  const { token, optionId } = await context.params;

  const rows = await prisma.$queryRaw<Array<{ pollId: string; status: string }>>(Prisma.sql`
    SELECT poll."id" AS "pollId", poll."status"
    FROM "SIXFLPollRecipient" recipient
    INNER JOIN "SIXFLPoll" poll ON poll."id" = recipient."pollId"
    INNER JOIN "SIXFLPollOption" option ON option."id" = ${optionId} AND option."pollId" = poll."id"
    WHERE recipient."token" = ${token}
    LIMIT 1
  `);

  const poll = rows[0] ?? null;

  if (!poll) return redirectToPoll(token, "invalid");
  if (poll.status !== "ACTIVE") return redirectToPoll(token, "closed");

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "SIXFLPollRecipient"
    SET
      "selectedOptionId" = ${optionId},
      "votedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "token" = ${token}
  `);

  return redirectToPoll(token, "saved");
}
