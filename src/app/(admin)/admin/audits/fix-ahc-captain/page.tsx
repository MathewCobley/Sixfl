// ========================================
// File: src/app/(admin)/admin/audits/fix-ahc-captain/page.tsx
// ========================================

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONFIRM_TEXT = "REMOVE ANDREW FROM AHC";
const TARGET_USER_EMAIL = "lifeisprecious1966@gmail.com";
const TARGET_TEAM_NAME = "AHC AFC";
const TARGET_TEAM_CONTACT_EMAIL = "C.tasker@whptelecoms.com";

type TargetRow = {
  teamId: string;
  teamName: string;
  contactName: string | null;
  contactEmail: string | null;
  captainUserId: string | null;
  captainLinkedAt: Date | null;
  captainClaimedAt: Date | null;
  memberId: string | null;
  memberRole: string | null;
  memberCreatedAt: Date | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  availabilityCount: number;
  selectionCount: number;
  playerMatchFeeCount: number;
};

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

async function getTargetRows() {
  return prisma.$queryRaw<TargetRow[]>(Prisma.sql`
    SELECT
      t."id" AS "teamId",
      t."name" AS "teamName",
      t."contactName",
      t."contactEmail",
      t."captainUserId",
      t."captainLinkedAt",
      t."captainClaimedAt",
      tm."id" AS "memberId",
      tm."role"::text AS "memberRole",
      tm."createdAt" AS "memberCreatedAt",
      u."id" AS "userId",
      u."name" AS "userName",
      u."email" AS "userEmail",
      COALESCE((SELECT COUNT(*)::int FROM "FixtureAvailability" fa WHERE fa."teamMemberId" = tm."id"), 0) AS "availabilityCount",
      COALESCE((SELECT COUNT(*)::int FROM "FixtureSelection" fs WHERE fs."teamMemberId" = tm."id"), 0) AS "selectionCount",
      COALESCE((SELECT COUNT(*)::int FROM "PlayerMatchFee" pmf WHERE pmf."teamMemberId" = tm."id"), 0) AS "playerMatchFeeCount"
    FROM "Team" t
    LEFT JOIN "TeamMember" tm ON tm."teamId" = t."id"
    LEFT JOIN "User" u ON u."id" = tm."userId"
    WHERE lower(trim(t."name")) = lower(trim(${TARGET_TEAM_NAME}))
      AND lower(trim(t."contactEmail")) = lower(trim(${TARGET_TEAM_CONTACT_EMAIL}))
      AND (
        lower(trim(u."email")) = lower(trim(${TARGET_USER_EMAIL}))
        OR t."captainUserId" IN (
          SELECT "id" FROM "User" WHERE lower(trim("email")) = lower(trim(${TARGET_USER_EMAIL}))
        )
      )
    ORDER BY tm."createdAt" ASC NULLS LAST
  `);
}

export async function fixAhcCaptainAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const confirmation = getString(formData.get("confirmation"));
  if (confirmation !== CONFIRM_TEXT) {
    redirect("/admin/audits/fix-ahc-captain?error=confirm");
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { email: { equals: TARGET_USER_EMAIL, mode: "insensitive" } },
      select: { id: true, email: true },
    });

    if (!user) throw new Error("Target user not found.");

    const team = await tx.team.findFirst({
      where: {
        name: { equals: TARGET_TEAM_NAME, mode: "insensitive" },
        contactEmail: { equals: TARGET_TEAM_CONTACT_EMAIL, mode: "insensitive" },
      },
      select: { id: true, name: true, captainUserId: true },
    });

    if (!team) throw new Error("Target AHC team not found.");

    const memberships = await tx.teamMember.findMany({
      where: { teamId: team.id, userId: user.id },
      select: { id: true },
    });

    for (const membership of memberships) {
      const childCounts = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT (
          (SELECT COUNT(*) FROM "FixtureAvailability" WHERE "teamMemberId" = ${membership.id}) +
          (SELECT COUNT(*) FROM "FixtureSelection" WHERE "teamMemberId" = ${membership.id}) +
          (SELECT COUNT(*) FROM "PlayerMatchFee" WHERE "teamMemberId" = ${membership.id})
        )::int AS count
      `);

      const childCount = Number(childCounts[0]?.count ?? 0);
      if (childCount > 0) {
        throw new Error(`Refusing to remove TeamMember ${membership.id}; it has ${childCount} child row(s).`);
      }

      await tx.teamMember.delete({ where: { id: membership.id } });
    }

    if (team.captainUserId === user.id) {
      await tx.team.update({
        where: { id: team.id },
        data: {
          captainUserId: null,
          captainLinkedAt: null,
          captainLinkedSource: null,
          captainClaimedAt: null,
          captainClaimSource: null,
          managerNotes: `AHC captain link corrected. Removed ${user.email} from captain/member link on ${new Date().toISOString()}.`,
        },
      });
    }
  });

  revalidatePath("/admin/audits/team-memberships");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/captains");
  revalidatePath("/admin/fixtures");

  redirect("/admin/audits/fix-ahc-captain?fixed=1");
}

export default async function FixAhcCaptainPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();

  const params = searchParams ? await searchParams : {};
  const fixed = params.fixed === "1";
  const confirmError = params.error === "confirm";
  const rows = await getTargetRows();
  const hasChildRows = rows.some((row) => row.availabilityCount + row.selectionCount + row.playerMatchFeeCount > 0);

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.04] p-6 md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">Guarded data fix</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Fix incorrect AHC captain link</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          This only targets {TARGET_USER_EMAIL} on {TARGET_TEAM_NAME} where the team contact is {TARGET_TEAM_CONTACT_EMAIL}. It does not touch Crescent United or Wetherby Wanderers.
        </p>
        {fixed ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">AHC captain/member link corrected.</div> : null}
        {confirmError ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">Typed confirmation did not match.</div> : null}
      </AdminCard>

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0">
        <div className="border-b border-white/10 px-6 py-5 md:px-8">
          <h2 className="text-xl font-semibold text-white">Target rows</h2>
          <p className="mt-1 text-sm text-white/50">{rows.length} row{rows.length === 1 ? "" : "s"} found.</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-white/55">No target rows found. It may already be fixed.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.16em] text-white/40">
                <tr>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Captain user</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Child rows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <tr key={`${row.teamId}-${row.memberId ?? "captain"}`}>
                    <td className="px-4 py-4 align-top"><div className="font-semibold text-white">{row.teamName}</div><div className="font-mono text-[11px] text-white/40">{row.teamId}</div></td>
                    <td className="px-4 py-4 align-top text-white/65"><div>{row.contactName ?? "—"}</div><div>{row.contactEmail ?? "—"}</div></td>
                    <td className="px-4 py-4 align-top text-white/65"><div className="font-mono text-[11px]">{row.captainUserId ?? "—"}</div><div>Linked {formatDate(row.captainLinkedAt)}</div><div>Claimed {formatDate(row.captainClaimedAt)}</div></td>
                    <td className="px-4 py-4 align-top text-white/65"><div>{row.userName ?? "—"}</div><div>{row.userEmail ?? "—"}</div><div>{row.memberRole ?? "No member row"}</div><div className="font-mono text-[11px] text-white/40">{row.memberId ?? "—"}</div></td>
                    <td className="px-4 py-4 align-top text-white/65"><div>Availability: {row.availabilityCount}</div><div>Selections: {row.selectionCount}</div><div>Player fees: {row.playerMatchFeeCount}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {!fixed && rows.length > 0 ? (
        <AdminCard className="rounded-3xl border border-red-500/25 bg-black/30 p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Confirm fix</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Type <span className="font-mono text-red-100">REMOVE ANDREW FROM AHC</span> exactly to remove only this incorrect AHC link.
          </p>
          {hasChildRows ? (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">This target membership has child rows. The action will refuse to run until those are handled separately.</div>
          ) : null}
          <form action={fixAhcCaptainAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input name="confirmation" className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-red-400/40 focus:ring-2 focus:ring-red-400/20" placeholder="REMOVE ANDREW FROM AHC" />
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-400 px-6 text-sm font-semibold text-black transition hover:bg-red-300">Apply fix</button>
          </form>
        </AdminCard>
      ) : null}
    </div>
  );
}
