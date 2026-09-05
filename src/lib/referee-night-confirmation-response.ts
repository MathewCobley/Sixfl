// ========================================
// File: src/lib/referee-night-confirmation-response.ts
// ========================================

import { Prisma } from "@prisma/client";

import {
  ensureRefereeNightConfirmationColumns,
  getRefereeNightConfirmationTokenHash,
  type RefereeNightConfirmationStatus,
} from "@/lib/referee-night-confirmations";
import { prisma } from "@/lib/prisma";
import { recordEveningAnswerForNight } from "@/lib/referees/evening-notifications";

export async function recordRefereeNightConfirmationResponse(input: {
  token: string;
  answer: "yes" | "no";
}) {
  await ensureRefereeNightConfirmationColumns();

  const tokenHash = getRefereeNightConfirmationTokenHash(input.token);
  const status: RefereeNightConfirmationStatus = input.answer === "yes" ? "CONFIRMED" : "DECLINED";
  const now = new Date();

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      refereeId: string;
      nightDate: Date | string;
      leagueName: string;
      refereeName: string | null;
      refereeEmail: string | null;
    }>
  >(Prisma.sql`
    UPDATE "RefereeNight" rn
    SET
      "confirmationStatus" = ${status},
      "confirmationConfirmedAt" = CASE WHEN ${status} = 'CONFIRMED' THEN ${now} ELSE rn."confirmationConfirmedAt" END,
      "confirmationDeclinedAt" = CASE WHEN ${status} = 'DECLINED' THEN ${now} ELSE rn."confirmationDeclinedAt" END,
      "confirmationResponseNote" = ${status === "CONFIRMED" ? "Referee confirmed they can attend." : "Referee said they cannot attend."},
      "confirmationTokenHash" = NULL,
      "updatedAt" = NOW()
    FROM "League" l, "User" u
    WHERE rn."confirmationTokenHash" = ${tokenHash}
      AND l.id = rn."leagueId"
      AND u.id = rn."refereeId"
    RETURNING
      rn.id,
      rn."refereeId",
      rn."nightDate",
      l.name AS "leagueName",
      u.name AS "refereeName",
      u.email AS "refereeEmail"
  `);

  if (rows[0]) await recordEveningAnswerForNight(rows[0].id, input.answer);
  return rows[0] ?? null;
}
