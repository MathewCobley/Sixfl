import { prisma } from "@/lib/prisma";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";
import PrimaryContactFieldsClient from "@/components/admin/teams/PrimaryContactFieldsClient";

function getRoleLabel(role: string) {
  if (role === "CAPTAIN") return "Captain";
  if (role === "MANAGER") return "Manager";
  if (role === "COACH") return "Coach";
  return "Player";
}

export default async function PrimaryContactMemberSelector({
  teamId,
  defaultName,
  defaultEmail,
  defaultPhone,
}: {
  teamId: string;
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
}) {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  const profiles = await getTeamMemberProfilesByTeamMemberIds(
    members.map((member) => member.id),
  );

  const options = members.map((member) => {
    const name = member.user.name?.trim() ?? "";
    const email = member.user.email?.trim() ?? "";
    const phone = profiles.get(member.id)?.phone?.trim() ?? "";
    const displayName = name || email || "Unnamed user";

    return {
      value: member.id,
      label: `${displayName}${email && email !== displayName ? ` · ${email}` : ""} · ${getRoleLabel(member.role)}`,
      name,
      email,
      phone,
    };
  });

  return (
    <PrimaryContactFieldsClient
      options={options}
      defaultName={defaultName}
      defaultEmail={defaultEmail}
      defaultPhone={defaultPhone}
    />
  );
}
