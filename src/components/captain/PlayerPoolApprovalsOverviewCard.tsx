import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

type PendingApprovalRow = {
  requestId: string;
  profileId: string;
  publicCode: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  introducedAt: Date | null;
};

function formatDate(value: Date | null) {
  if (!value) return null;
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function playerName(player: PendingApprovalRow) {
  return (
    [player.firstName, player.lastName].filter(Boolean).join(" ").trim() ||
    player.email ||
    "PlayerPool player"
  );
}

export default async function PlayerPoolApprovalsOverviewCard({
  teamId,
}: {
  teamId: string;
}) {
  const approvals = await prisma.$queryRaw<PendingApprovalRow[]>`
    SELECT
      request."id" AS "requestId",
      profile."id" AS "profileId",
      profile."publicCode",
      prospect."firstName",
      prospect."lastName",
      prospect."email",
      prospect."phone",
      request."introducedAt"
    FROM "PlayerPoolIntroductionRequest" request
    JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
    JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
    WHERE request."teamId" = ${teamId}
      AND request."status" = 'INTRODUCED'
      AND NOT EXISTS (
        SELECT 1
        FROM "TeamMember" member
        JOIN "User" member_user ON member_user."id" = member."userId"
        WHERE member."teamId" = request."teamId"
          AND member_user."email" IS NOT NULL
          AND prospect."email" IS NOT NULL
          AND LOWER(TRIM(member_user."email")) = LOWER(TRIM(prospect."email"))
      )
    ORDER BY COALESCE(request."introducedAt", request."requestedAt") DESC
  `;

  if (approvals.length === 0) return null;

  return (
    <section className="rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 shadow-[0_20px_60px_rgba(14,116,144,0.12)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">
            PlayerPool · action needed
          </p>
          <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
            {approvals.length} approved player{approvals.length === 1 ? " is" : "s are"} waiting to join
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            SIXFL has approved these introductions. They are not active squad players yet. Review them in PlayerPool and add them to the squad once the player agrees to join.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/captain/team/${teamId}/player-pool`}
            className="inline-flex items-center justify-center rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-sky-200"
          >
            Open PlayerPool
          </Link>
          <Link
            href={`/captain/team/${teamId}/squad`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/5"
          >
            Open squad
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {approvals.map((player) => {
          const approvedAt = formatDate(player.introducedAt);
          return (
            <article
              key={player.requestId}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-sky-200">
                  {player.publicCode}
                </span>
                <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                  Approved · waiting to join
                </span>
              </div>
              <div className="mt-3 text-base font-semibold text-white">
                {playerName(player)}
              </div>
              <div className="mt-1 text-sm text-white/55">
                {player.email || "No email saved"}
                {player.phone ? ` · ${player.phone}` : ""}
              </div>
              {approvedAt ? (
                <div className="mt-2 text-xs text-white/40">Approved {approvedAt}</div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
