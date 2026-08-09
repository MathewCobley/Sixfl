import { prisma } from "@/lib/prisma";

export type TeamAutoPaySnapshot = {
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  autoPayEnabled: boolean;
  autoPayMandateAcceptedAt: Date | null;
  autoPayLastAttemptAt: Date | null;
  autoPayLastFailureAt: Date | null;
  autoPayLastFailureReason: string | null;
};

export async function getTeamAutoPaySnapshot(teamId: string) {
  const rows = await prisma.$queryRaw<TeamAutoPaySnapshot[]>`
    SELECT
      "stripeCustomerId",
      "stripeDefaultPaymentMethodId",
      "autoPayEnabled",
      "autoPayMandateAcceptedAt",
      "autoPayLastAttemptAt",
      "autoPayLastFailureAt",
      "autoPayLastFailureReason"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}
