// ========================================
// File: src/app/api/admin/polls/template-preview/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PollPreviewRow = {
  pollId: string;
  title: string;
  question: string;
  status: string;
  choiceMode: string;
  optionId: string;
  optionLabel: string;
  sortOrder: number;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<PollPreviewRow[]>(Prisma.sql`
    SELECT
      poll."id" AS "pollId",
      poll."title",
      poll."question",
      poll."status",
      COALESCE(poll."choiceMode", 'SINGLE') AS "choiceMode",
      option."id" AS "optionId",
      option."label" AS "optionLabel",
      option."sortOrder"
    FROM "SIXFLPoll" poll
    INNER JOIN "SIXFLPollOption" option ON option."pollId" = poll."id"
    WHERE poll."status" IN ('ACTIVE', 'DRAFT')
    ORDER BY poll."createdAt" DESC, option."sortOrder" ASC, option."label" ASC
    LIMIT 300
  `);

  const pollsById = new Map<
    string,
    {
      id: string;
      title: string;
      question: string;
      status: string;
      choiceMode: string;
      options: Array<{ id: string; label: string; sortOrder: number }>;
    }
  >();

  for (const row of rows) {
    const existing = pollsById.get(row.pollId) ?? {
      id: row.pollId,
      title: row.title,
      question: row.question,
      status: row.status,
      choiceMode: row.choiceMode,
      options: [],
    };

    existing.options.push({
      id: row.optionId,
      label: row.optionLabel,
      sortOrder: row.sortOrder,
    });

    pollsById.set(row.pollId, existing);
  }

  return NextResponse.json({ polls: Array.from(pollsById.values()) });
}
