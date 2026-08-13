"use server";

import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import { updateTeamDetailsAction } from "../actions";

export async function updateTeamDetailsWithPrimaryContactAction(formData: FormData) {
  const teamId = String(formData.get("id") ?? "").trim();
  const teamMemberId = String(formData.get("primaryContactMemberId") ?? "").trim();

  if (teamId && teamMemberId) {
    const member = await prisma.teamMember.findFirst({
      where: {
        id: teamMemberId,
        teamId,
      },
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (member) {
      const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
      const phone = getPhoneDisplayValue(profiles.get(member.id)?.phone) ?? "";

      formData.set("contactName", member.user.name?.trim() ?? "");
      formData.set("contactEmail", member.user.email?.trim() ?? "");
      formData.set("contactPhone", phone);
    }
  }

  return updateTeamDetailsAction(formData);
}
