// ========================================
// File: src/app/(admin)/admin/player-prospects/page.tsx
// ========================================

import Link from "next/link";

import FormListboxField, { type FormListboxOption } from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { assignPlayerProspectToTeamAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Prospects | SIXFL Admin",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

type RawProspectRow = {
  id: string;
  teamId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  preferredPositions: string | null;
  availabilitySummary: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt: Date | null;
  teamName: string | null;
  teamMode: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  latestPlayerResponse: string | null;
  latestPlayerRespondedAt: Date | null;
  latestYesNoEmailStatus: string | null;
  latestYesNoEmailAt: Date | null;
  latestSigninEmailStatus: string | null;
  latestSigninEmailAt: Date | null;
};

type ProspectWithTeam = {
  id: string;
  teamId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  preferredPositions: string | null;
  availabilitySummary: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt: Date | null;
  latestPlayerResponse: string | null;
  latestPlayerRespondedAt: Date | null;
  latestYesNoEmailStatus: string | null;
  latestYesNoEmailAt: Date | null;
  latestSigninEmailStatus: string | null;
  latestSigninEmailAt: Date | null;
  team: {
    id: string;
    name: string;
    teamMode: string;
    league: { name: string; season: string | null } | null;
  } | null;
};

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProspectName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "Unnamed player";
}

function normaliseEmail(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function buildActiveSquadKey(input: { email: string | null; teamId: string | null }) {
  const email = normaliseEmail(input.email);
  return email && input.teamId ? `${email}::${input.teamId}` : null;
}

function getStatusClasses(status: string) {
  switch (status) {
    case "NEW":
      return "border-white/10 bg-white/5 text-white/75";
    case "CONTACTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "TRIAL":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "ACTIVE_SQUAD":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "BACKUP":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "DECLINED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "DUPLICATE":
      return "border-orange-400/25 bg-orange-500/10 text-orange-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function formatStatus(status: string) {
  if (status === "DECLINED") return "Not interested";
  if (status === "DUPLICATE") return "Duplicated";
  if (status === "BACKUP") return "Reusable prospect";
  if (status === "ACTIVE_SQUAD") return "Active squad";

  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function responseClasses(value: string | null) {
  if (value === "YES") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }

  if (value === "NO") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/55";
}

function responseLabel(value: string | null) {
  if (value === "YES") return "YES — still wants to play";
  if (value === "NO") return "NO — follow up";
  return "No YES/NO reply yet";
}

function dispatchClasses(status: string | null) {
  if (status === "SENT") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED" || status === "CANCELLED" || status === "SKIPPED") {
    return "border-red-400/20 bg-red-500/10 text-red-100";
  }

  if (status === "QUEUED" || status === "PROCESSING") {
    return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/55";
}

function dispatchLabel(input: {
  label: string;
  status: string | null;
  at: Date | null;
  empty: string;
}) {
  if (!input.status && !input.at) return input.empty;

  const when = input.at ? formatDateTime(input.at) : "date unknown";

  switch (input.status) {
    case "SENT":
      return `${input.label} sent ${when}`;
    case "QUEUED":
      return `${input.label} queued ${when}`;
    case "PROCESSING":
      return `${input.label} processing ${when}`;
    case "FAILED":
      return `${input.label} failed ${when}`;
    case "SKIPPED":
      return `${input.label} skipped ${when}`;
    case "CANCELLED":
      return `${input.label} cancelled ${when}`;
    default:
      return `${input.label} recorded ${when}`;
  }
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "assigned":
      return "Prospect assigned to team.";
    default:
      return saved ? "Saved." : null;
  }
}

function StatCard({
  label,
  value,
  helper,
  tone = "white",
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "white" | "emerald" | "amber" | "sky" | "red" | "orange";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-100/70"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100/70"
          : tone === "red"
            ? "border-red-400/20 bg-red-500/10 text-red-100/70"
            : tone === "orange"
              ? "border-orange-400/20 bg-orange-500/10 text-orange-100/70"
              : "border-white/10 bg-white/[0.04] text-white/45";

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/55">{helper}</p>
    </div>
  );
}

function mapProspectRow(row: RawProspectRow): ProspectWithTeam {
  return {
    id: row.id,
    teamId: row.teamId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    preferredPositions: row.preferredPositions,
    availabilitySummary: row.availabilitySummary,
    source: row.source,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastContactedAt: row.lastContactedAt,
    latestPlayerResponse: row.latestPlayerResponse,
    latestPlayerRespondedAt: row.latestPlayerRespondedAt,
    latestYesNoEmailStatus: row.latestYesNoEmailStatus,
    latestYesNoEmailAt: row.latestYesNoEmailAt,
    latestSigninEmailStatus: row.latestSigninEmailStatus,
    latestSigninEmailAt: row.latestSigninEmailAt,
    team: row.teamId && row.teamName
      ? {
          id: row.teamId,
          name: row.teamName,
          teamMode: row.teamMode ?? "STANDARD",
          league: row.leagueName
            ? { name: row.leagueName, season: row.leagueSeason }
            : null,
        }
      : null,
  };
}

function getActiveProspectReason(input: {
  prospect: ProspectWithTeam;
  activeSquadMembershipKeys: Set<string>;
}) {
  if (input.prospect.status === "DECLINED" || input.prospect.status === "DUPLICATE") {
    return null;
  }

  if (input.prospect.status === "ACTIVE_SQUAD") {
    return "Prospect has been promoted to an active squad or is pending activation.";
  }

  const activeSquadKey = buildActiveSquadKey({
    email: input.prospect.email,
    teamId: input.prospect.teamId,
  });

  if (activeSquadKey && input.activeSquadMembershipKeys.has(activeSquadKey)) {
    return "Email matches a player already attached to this team squad.";
  }

  return null;
}

function ProspectCard({
  prospect,
  teamOptions,
  activeReason = null,
  muted = false,
}: {
  prospect: ProspectWithTeam;
  teamOptions: FormListboxOption[];
  activeReason?: string | null;
  muted?: boolean;
}) {
  const name = getProspectName(prospect);
  const teamLeague = prospect.team?.league
    ? `${prospect.team.league.name}${prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""}`
    : "No team assigned";
  const isUnassigned = !prospect.team;
  const isActivePlayer = Boolean(activeReason);
  const isClosedProspect = prospect.status === "DECLINED" || prospect.status === "DUPLICATE";
  const poolLabel = prospect.status === "DUPLICATE"
    ? "Duplicate record"
    : prospect.status === "DECLINED"
      ? "Not interested"
      : "Unassigned prospect";
  const poolHelp = prospect.status === "DUPLICATE"
    ? "Marked as a duplicate and kept out of the open pipeline."
    : prospect.status === "DECLINED"
      ? "Kept for history but not part of the open pipeline."
      : "Not currently linked to any team.";

  return (
    <article
      className={`rounded-3xl border border-white/10 bg-black/20 p-5 transition ${
        muted ? "opacity-80 hover:opacity-100" : "hover:border-emerald-400/20 hover:bg-black/25"
      }`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(prospect.status)}`}>
              {formatStatus(prospect.status)}
            </span>
            {isActivePlayer ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                Active player
              </span>
            ) : null}
            {isUnassigned && !isClosedProspect ? (
              <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-100">
                Unassigned
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/45">
            {prospect.email ? <span>{prospect.email}</span> : null}
            {prospect.phone ? <span>{prospect.phone}</span> : null}
            {prospect.source ? <span>Source: {prospect.source}</span> : null}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${responseClasses(prospect.latestPlayerResponse)}`}>
              <div className="font-semibold">YES/NO reply</div>
              <div>{responseLabel(prospect.latestPlayerResponse)}</div>
              {prospect.latestPlayerRespondedAt ? (
                <div className="mt-1 opacity-80">{formatDateTime(prospect.latestPlayerRespondedAt)}</div>
              ) : null}
            </div>
            <div className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${dispatchClasses(prospect.latestYesNoEmailStatus)}`}>
              <div className="font-semibold">YES/NO email</div>
              <div>
                {dispatchLabel({
                  label: "YES/NO email",
                  status: prospect.latestYesNoEmailStatus,
                  at: prospect.latestYesNoEmailAt,
                  empty: "No YES/NO email sent yet",
                })}
              </div>
            </div>
            <div className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${dispatchClasses(prospect.latestSigninEmailStatus)}`}>
              <div className="font-semibold">Sign-in email</div>
              <div>
                {dispatchLabel({
                  label: "Sign-in email",
                  status: prospect.latestSigninEmailStatus,
                  at: prospect.latestSigninEmailAt,
                  empty: "No sign-in email sent yet",
                })}
              </div>
            </div>
          </div>

          {activeReason ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.08] px-3 py-2 text-xs leading-5 text-emerald-100/80">
              <span className="font-semibold text-emerald-100">Active player reason:</span> {activeReason}
            </div>
          ) : null}
          {prospect.preferredPositions || prospect.availabilitySummary ? (
            <p className="mt-3 text-sm leading-6 text-white/60">
              {[prospect.preferredPositions, prospect.availabilitySummary].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {prospect.notes ? (
            <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/50">
              {prospect.notes}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
            {isClosedProspect ? "Closed record" : isUnassigned ? "Prospect pool" : isActivePlayer ? "Active team" : "Currently held under"}
          </div>
          {prospect.team ? (
            <>
              <Link href={`/admin/teams/${prospect.team.id}/prospects`} className="mt-2 block font-semibold text-emerald-200 hover:text-emerald-100">
                {prospect.team.name}
              </Link>
              <div className="mt-1 text-sm text-white/45">{teamLeague}</div>
              <div className="mt-2 text-xs text-white/35">Mode: {String(prospect.team.teamMode)}</div>
            </>
          ) : isClosedProspect ? (
            <>
              <div className="mt-2 font-semibold text-orange-100">{poolLabel}</div>
              <div className="mt-1 text-sm text-white/45">{poolHelp}</div>
            </>
          ) : (
            <>
              <div className="mt-2 font-semibold text-sky-100">Unassigned prospect</div>
              <div className="mt-1 text-sm text-white/45">Not currently linked to any team.</div>
              <form action={assignPlayerProspectToTeamAction} className="mt-4 space-y-3">
                <input type="hidden" name="prospectId" value={prospect.id} />
                <FormListboxField
                  name="teamId"
                  options={teamOptions}
                  placeholder="Choose team"
                  disabled={teamOptions.length === 0}
                />
                <button
                  type="submit"
                  disabled={teamOptions.length === 0}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Assign to team
                </button>
              </form>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {prospect.team ? (
            <>
              <Link
                href={`/admin/teams/${prospect.team.id}/prospects`}
                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Manage
              </Link>
              <Link
                href={`/admin/teams/${prospect.team.id}/prospects/${prospect.id}/communications`}
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
              >
                Comms
              </Link>
            </>
          ) : isClosedProspect ? (
            <span className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/45">
              Closed record
            </span>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/45">
              Assign before team tools
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/35">
        <span>Added {formatDate(prospect.createdAt)}</span>
        <span>Updated {formatDate(prospect.updatedAt)}</span>
        {prospect.lastContactedAt ? <span>Last contacted {formatDate(prospect.lastContactedAt)}</span> : null}
      </div>
    </article>
  );
}

export default async function AdminPlayerProspectsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const filters = (await searchParams) ?? {};

  const [prospectRows, teams] = await Promise.all([
    prisma.$queryRaw<RawProspectRow[]>`
      SELECT
        p."id",
        p."teamId",
        p."firstName",
        p."lastName",
        p."email",
        p."phone",
        p."preferredPositions",
        p."availabilitySummary",
        p."source",
        p."status",
        p."notes",
        p."createdAt",
        p."updatedAt",
        p."lastContactedAt",
        t."name" AS "teamName",
        t."teamMode"::text AS "teamMode",
        l."name" AS "leagueName",
        l."season" AS "leagueSeason",
        latestResponse."response" AS "latestPlayerResponse",
        latestResponse."respondedAt" AS "latestPlayerRespondedAt",
        latestYesNoEmail."status" AS "latestYesNoEmailStatus",
        latestYesNoEmail."emailAt" AS "latestYesNoEmailAt",
        latestSigninEmail."status" AS "latestSigninEmailStatus",
        latestSigninEmail."emailAt" AS "latestSigninEmailAt"
      FROM "TeamPlayerProspect" p
      LEFT JOIN "Team" t ON t."id" = p."teamId"
      LEFT JOIN "League" l ON l."id" = t."leagueId"
      LEFT JOIN LATERAL (
        SELECT
          r."response",
          r."respondedAt"
        FROM "PlayerInterestResponse" r
        WHERE r."prospectId" = p."id"
        ORDER BY r."respondedAt" DESC
        LIMIT 1
      ) latestResponse ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          d."status"::text AS "status",
          COALESCE(d."sentAt", d."failedAt", d."processedAt", d."createdAt") AS "emailAt"
        FROM "NotificationDispatch" d
        WHERE d."sourceType" = 'TEAM_PLAYER_PROSPECT'
          AND d."sourceId" = p."id"
          AND d."channel" = 'EMAIL'
          AND (
            d."metadata"::text ILIKE '%yesResponseUrl%'
            OR d."metadata"::text ILIKE '%noResponseUrl%'
            OR d."bodyText" ILIKE '%player-response/yes%'
            OR d."bodyText" ILIKE '%player-response/no%'
          )
        ORDER BY COALESCE(d."sentAt", d."failedAt", d."processedAt", d."createdAt") DESC
        LIMIT 1
      ) latestYesNoEmail ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          d."status"::text AS "status",
          COALESCE(d."sentAt", d."failedAt", d."processedAt", d."createdAt") AS "emailAt"
        FROM "NotificationDispatch" d
        LEFT JOIN "NotificationTemplate" template ON template."id" = d."templateId"
        WHERE d."sourceType" = 'TEAM_PLAYER_PROSPECT'
          AND d."sourceId" = p."id"
          AND d."channel" = 'EMAIL'
          AND (
            template."key" = 'squad-activation-email'
            OR d."metadata"::text ILIKE '%squad-activation-email%'
            OR d."subject" ILIKE '%activation%'
            OR d."subject" ILIKE '%sign in%'
            OR d."subject" ILIKE '%signin%'
          )
        ORDER BY COALESCE(d."sentAt", d."failedAt", d."processedAt", d."createdAt") DESC
        LIMIT 1
      ) latestSigninEmail ON TRUE
      ORDER BY p."updatedAt" DESC, p."createdAt" DESC
    `,
    prisma.team.findMany({
      orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        teamMode: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
  ]);

  const prospects = prospectRows.map(mapProspectRow);
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: `${team.name}${team.league?.name ? ` · ${team.league.name}` : ""}${team.league?.season ? ` ${team.league.season}` : ""} · ${team.teamMode}`,
  }));

  const prospectEmails = Array.from(
    new Set(
      prospects
        .map((prospect) => normaliseEmail(prospect.email))
        .filter(Boolean),
    ),
  );

  const linkedSquadUsers = prospectEmails.length
    ? await prisma.user.findMany({
        where: {
          email: {
            in: prospectEmails,
          },
        },
        select: {
          email: true,
          teamMembers: {
            select: {
              teamId: true,
            },
          },
        },
      })
    : [];

  const activeSquadMembershipKeys = new Set<string>();

  for (const user of linkedSquadUsers) {
    const email = normaliseEmail(user.email);

    if (!email) {
      continue;
    }

    for (const membership of user.teamMembers) {
      activeSquadMembershipKeys.add(`${email}::${membership.teamId}`);
    }
  }

  const activeProspectReasonById = new Map<string, string>();

  for (const prospect of prospects) {
    const reason = getActiveProspectReason({ prospect, activeSquadMembershipKeys });

    if (reason) {
      activeProspectReasonById.set(prospect.id, reason);
    }
  }

  const isActivelyUsedProspect = (prospect: ProspectWithTeam) => activeProspectReasonById.has(prospect.id);

  const pipelineProspects = prospects.filter(
    (prospect) =>
      !isActivelyUsedProspect(prospect) &&
      prospect.status !== "DECLINED" &&
      prospect.status !== "DUPLICATE",
  );
  const unassignedProspects = pipelineProspects.filter((prospect) => !prospect.teamId);
  const trialProspects = pipelineProspects.filter((prospect) => prospect.status === "TRIAL");
  const activeSquadProspects = prospects.filter(isActivelyUsedProspect);
  const declinedProspects = prospects.filter(
    (prospect) => !isActivelyUsedProspect(prospect) && prospect.status === "DECLINED",
  );
  const duplicateProspects = prospects.filter(
    (prospect) => !isActivelyUsedProspect(prospect) && prospect.status === "DUPLICATE",
  );
  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              SIXFL pipeline
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Player prospects
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/70 sm:text-base">
              Admin-owned view of individual players who may join a team. Open prospects are shown first, active players are visible separately, and duplicate records are kept out of the working pipeline.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Open" value={pipelineProspects.length} helper="Still in the pipeline" tone="emerald" />
            <StatCard label="Unassigned" value={unassignedProspects.length} helper="Ready to assign" tone="sky" />
            <StatCard label="Active players" value={activeSquadProspects.length} helper="Already in use" tone="emerald" />
            <StatCard label="Duplicated" value={duplicateProspects.length} helper="Out of pipeline" tone="orange" />
          </div>
        </div>
      </section>

      {savedMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Open player prospects</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Pipeline list</h2>
          </div>
          <div className="text-sm text-white/50">
            {pipelineProspects.length} shown · {unassignedProspects.length} unassigned · {activeSquadProspects.length} active players below
            {declinedProspects.length ? ` · ${declinedProspects.length} not interested` : ""}
            {duplicateProspects.length ? ` · ${duplicateProspects.length} duplicated` : ""}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {pipelineProspects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No open player prospects yet.
            </div>
          ) : null}

          {pipelineProspects.map((prospect) => (
            <ProspectCard key={prospect.id} prospect={prospect} teamOptions={teamOptions} />
          ))}
        </div>
      </section>

      {activeSquadProspects.length > 0 ? (
        <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.06] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/60">Active players</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Already promoted or linked to squads</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/65">
                These players are not in the open prospect pipeline because they are already active, pending activation, or their email matches an existing squad member.
              </p>
            </div>
            <div className="text-sm text-emerald-100/65">{activeSquadProspects.length} active player{activeSquadProspects.length === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-5 space-y-3">
            {activeSquadProspects.map((prospect) => (
              <ProspectCard
                key={prospect.id}
                prospect={prospect}
                teamOptions={teamOptions}
                activeReason={activeProspectReasonById.get(prospect.id) ?? "Active player."}
                muted
              />
            ))}
          </div>
        </section>
      ) : null}

      {duplicateProspects.length > 0 ? (
        <section className="rounded-3xl border border-orange-400/15 bg-orange-500/[0.06] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100/60">Duplicated</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Duplicate records kept out of the pipeline</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-100/65">
                These records are preserved for traceability but should not be used for team assignment, messaging or squad activation.
              </p>
            </div>
            <div className="text-sm text-orange-100/65">{duplicateProspects.length} duplicate record{duplicateProspects.length === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-5 space-y-3">
            {duplicateProspects.map((prospect) => (
              <ProspectCard key={prospect.id} prospect={prospect} teamOptions={teamOptions} muted />
            ))}
          </div>
        </section>
      ) : null}

      {declinedProspects.length > 0 ? (
        <section className="rounded-3xl border border-red-400/15 bg-red-500/[0.06] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/60">Not interested</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Kept out of the active pipeline</h2>
            </div>
            <div className="text-sm text-red-100/65">{declinedProspects.length} hidden from open list</div>
          </div>
          <div className="mt-5 space-y-3">
            {declinedProspects.map((prospect) => (
              <ProspectCard key={prospect.id} prospect={prospect} teamOptions={teamOptions} muted />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
