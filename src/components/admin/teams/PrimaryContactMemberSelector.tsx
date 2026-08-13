import { prisma } from "@/lib/prisma";

function getRoleLabel(role: string) {
  if (role === "CAPTAIN") return "Captain";
  if (role === "MANAGER") return "Manager";
  if (role === "COACH") return "Coach";
  return "Player";
}

export default async function PrimaryContactMemberSelector({
  teamId,
}: {
  teamId: string;
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

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
      <label
        htmlFor="primaryContactMemberId"
        className="text-sm font-semibold text-emerald-100"
      >
        Change primary contact
      </label>
      <p className="mt-1 text-xs leading-5 text-white/50">
        Choose an existing user from this team, then save the team details. SIXFL
        will use that user&apos;s saved name, email and squad mobile where available.
        Leave this blank to keep using the manual contact fields below.
      </p>
      <select
        id="primaryContactMemberId"
        name="primaryContactMemberId"
        defaultValue=""
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
      >
        <option value="">Keep current / enter manually</option>
        {members.map((member) => {
          const name = member.user.name?.trim();
          const email = member.user.email?.trim();
          const label = name || email || "Unnamed user";

          return (
            <option key={member.id} value={member.id}>
              {label}
              {email && email !== label ? ` · ${email}` : ""} · {getRoleLabel(member.role)}
            </option>
          );
        })}
      </select>
    </div>
  );
}
