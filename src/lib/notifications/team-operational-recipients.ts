import {
  NotificationAudience,
  NotificationRecipientSourceType,
  TeamRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";

export async function upsertAdditionalCaptainOperationalRecipients(input: {
  teamId: string;
  excludeEmail?: string | null;
  excludePhone?: string | null;
}) {
  const captains = await prisma.teamMember.findMany({
    where: { teamId: input.teamId, role: TeamRole.CAPTAIN },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
  });

  const profiles = await getTeamMemberProfilesByTeamMemberIds(
    captains.map((captain) => captain.id),
  );
  const excludedEmail = input.excludeEmail?.trim().toLowerCase() || null;
  const excludedPhone = input.excludePhone?.replace(/\D/g, "") || null;
  const recipients = [];
  const seen = new Set<string>();

  for (const captain of captains) {
    const email = captain.user.email?.trim().toLowerCase() || null;
    const phone = profiles.get(captain.id)?.phone?.trim() || null;
    const phoneKey = phone?.replace(/\D/g, "") || null;

    if ((!email || email === excludedEmail) && (!phoneKey || phoneKey === excludedPhone)) {
      continue;
    }

    const key = `${email ?? ""}|${phoneKey ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    recipients.push(
      await upsertNotificationRecipient({
        sourceType: NotificationRecipientSourceType.USER,
        sourceId: captain.userId,
        audience: NotificationAudience.TEAM,
        displayName: captain.user.name || email || "Team captain",
        email,
        phone,
        transactionalEmailOptIn: true,
        transactionalSmsOptIn: true,
        metadata: {
          teamId: input.teamId,
          teamMemberId: captain.id,
          role: "CAPTAIN",
          operationalTeamCopy: true,
        },
      }),
    );
  }

  return recipients;
}
