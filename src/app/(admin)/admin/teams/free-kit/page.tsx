import Link from "next/link";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type FreeKitTeamRow = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: Date;
  leadId: string | null;
  leadContactName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  leadTeamName: string | null;
  leadCreatedAt: Date | null;
};

function formatUkDate(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(value);
}

export default async function FreeKitTeamsPage() {
  await requireAdmin();

  const teams = await prisma.$queryRaw<FreeKitTeamRow[]>(Prisma.sql`
    SELECT
      team."id",
      team."name",
      team."contactName",
      team."contactEmail",
      team."contactPhone",
      team."createdAt",
      lead."id" AS "leadId",
      lead."contactName" AS "leadContactName",
      lead."email" AS "leadEmail",
      lead."phone" AS "leadPhone",
      lead."teamName" AS "leadTeamName",
      lead."createdAt" AS "leadCreatedAt"
    FROM "Team" AS team
    LEFT JOIN "InterestLead" AS lead
      ON lead."convertedTeamId" = team."id"
    WHERE team."wantsFreeKit" = true
    ORDER BY team."name" ASC
  `);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-amber-300">
            Kit offer
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Free-kit teams</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Teams whose original registration included the free-kit offer. Converted leads are
            linked using their exact team id rather than a name or email match.
          </p>
        </div>

        <Link
          href="/admin/teams"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Back to teams
        </Link>
      </div>

      <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">
          Opted in
        </div>
        <div className="mt-2 text-4xl font-semibold text-amber-100">{teams.length}</div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        {teams.length === 0 ? (
          <div className="p-8 text-sm text-white/55">No converted teams have opted in.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-white/10 bg-black/25 text-xs uppercase tracking-[0.14em] text-white/40">
                <tr>
                  <th className="px-5 py-4 font-semibold">Team</th>
                  <th className="px-5 py-4 font-semibold">Contact</th>
                  <th className="px-5 py-4 font-semibold">Original lead</th>
                  <th className="px-5 py-4 font-semibold">Registered</th>
                  <th className="px-5 py-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {teams.map((team) => {
                  const contactName = team.contactName || team.leadContactName || "—";
                  const contactEmail = team.contactEmail || team.leadEmail || "—";
                  const contactPhone = team.contactPhone || team.leadPhone || "—";

                  return (
                    <tr key={team.id} className="align-top hover:bg-white/[0.03]">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-white">{team.name}</div>
                        <span className="mt-2 inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200">
                          Free kit requested
                        </span>
                      </td>
                      <td className="px-5 py-4 text-white/70">
                        <div>{contactName}</div>
                        <div className="mt-1 break-all text-white/55">{contactEmail}</div>
                        <div className="mt-1 text-white/55">{contactPhone}</div>
                      </td>
                      <td className="px-5 py-4 text-white/65">
                        <div>{team.leadTeamName || "—"}</div>
                        {team.leadId ? (
                          <Link
                            href={`/admin/leads/${team.leadId}`}
                            className="mt-2 inline-flex text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                          >
                            Open original lead
                          </Link>
                        ) : (
                          <div className="mt-2 text-xs text-white/35">No linked lead</div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-white/60">
                        {formatUkDate(team.leadCreatedAt || team.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/teams/${team.id}`}
                          className="inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                        >
                          Open team
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
