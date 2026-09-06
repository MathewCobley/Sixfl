// ========================================
// File: src/app/(admin)/admin/player-prospects/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import ProspectNativeActions, {
  type ProspectChaseStatus,
  type ProspectPlayerPoolProfile,
  type ProspectTeamOption,
} from "@/components/admin/player-prospects/ProspectNativeActions";
import FormListboxField, {
  type FormListboxOption,
} from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { createProspectSearchMatcher, normaliseProspectSearch } from "@/lib/players/prospect-search";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  assignPlayerProspectToTeamAction,
  sendPlayerProspectSquadInviteAction,
  sendPlayerProspectYesNoChaseAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Prospects | SIXFL Admin",
};

type ProspectView = "pipeline" | "active" | "duplicates" | "declined";

type SearchParams = {
  saved?: string;
  error?: string;
  leagueId?: string;
  view?: string;
  page?: string;
  q?: string | string[];
};

type LeagueFilterOption = {
  id: string;
  name: string;
  season: string | null;
  area: string | null;
  dayOfWeek: string | null;
};

type ProspectRecord = {
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
  team: {
    id: string;
    name: string;
    teamMode: string;
    league: LeagueFilterOption | null;
  } | null;
};

type ProspectDisplayRecord = ProspectRecord & {
  latestPlayerResponse: string | null;
  latestPlayerRespondedAt: Date | null;
  latestYesNoEmailStatus: string | null;
  latestYesNoEmailAt: Date | null;
  latestSigninEmailStatus: string | null;
  latestSigninEmailAt: Date | null;
  playerPoolProfile: ProspectPlayerPoolProfile | null;
  chaseStatus: ProspectChaseStatus | null;
};

type ActiveMembershipRow = {
  emailNormalized: string;
  teamId: string;
};

type PlayerResponseRow = {
  prospectId: string;
  response: string;
  respondedAt: Date;
};

type PlayerPoolProfileRow = {
  id: string;
  prospectId: string;
  emailNormalized: string | null;
  publicCode: string;
  status: string;
  invitedAt: Date | null;
  profileSubmittedAt: Date | null;
  updatedAt: Date;
};

const PROSPECTS_PER_PAGE = 12;

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

function getProspectName(input: {
  firstName: string;
  lastName: string | null;
}) {
  return (
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    "Unnamed player"
  );
}

function normaliseEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normaliseSearchText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getStatusClasses(status: string) {
  switch (status) {
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
  if (
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "SKIPPED"
  ) {
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
    case "yes-no-chase-queued":
      return "YES/NO chase email queued for the prospect.";
    case "squad-invite-queued":
      return "Squad invite email queued. The player will receive the activation link for their team.";
    case "squad-invite-already-sent":
      return "A squad invite email has already been queued or sent for this player.";
    case "squad-chase-queued":
      return "Squad invite chase email queued.";
    case "squad-final-chase-queued":
      return "Final squad invite chase email queued.";
    default:
      return saved ? "Saved." : null;
  }
}

function getLeagueLabel(league: LeagueFilterOption) {
  return [league.name, league.season, league.area, league.dayOfWeek]
    .filter(Boolean)
    .join(" · ");
}

function parseView(value?: string): ProspectView {
  if (
    value === "active" ||
    value === "duplicates" ||
    value === "declined"
  ) {
    return value;
  }
  return "pipeline";
}

function parsePage(value?: string) {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function buildProspectHref(input: {
  leagueId: string;
  view: ProspectView;
  page?: number;
  q?: string;
}) {
  const params = new URLSearchParams();
  if (input.leagueId) params.set("leagueId", input.leagueId);
  if (input.view !== "pipeline") params.set("view", input.view);
  if ((input.page ?? 1) > 1) params.set("page", String(input.page));
  if (input.q) params.set("q", input.q);
  const query = params.toString();
  return `/admin/player-prospects${query ? `?${query}` : ""}`;
}

function getProspectInterestText(prospect: ProspectRecord) {
  return [
    prospect.source,
    prospect.notes,
    prospect.availabilitySummary,
    prospect.preferredPositions,
  ]
    .map(normaliseSearchText)
    .filter(Boolean)
    .join(" ");
}

function prospectMatchesLeague(
  prospect: ProspectRecord,
  selectedLeague: LeagueFilterOption | null,
) {
  if (!selectedLeague) return true;

  const leagueName = normaliseSearchText(selectedLeague.name);
  const leagueArea = normaliseSearchText(selectedLeague.area);
  const interestText = getProspectInterestText(prospect);
  const hasExplicitInterestText =
    interestText.includes("area:") ||
    interestText.includes("league type:") ||
    interestText.includes("preferred nights:") ||
    interestText.includes("source lead id:") ||
    interestText.includes("lead message:");

  if (leagueArea && interestText.includes(leagueArea)) return true;
  if (leagueName && interestText.includes(leagueName)) return true;
  if (hasExplicitInterestText) return false;

  return prospect.team?.league?.id === selectedLeague.id;
}

function getActiveProspectReason(input: {
  prospect: ProspectRecord;
  activeSquadMembershipKeys: Set<string>;
}) {
  if (
    input.prospect.status === "DECLINED" ||
    input.prospect.status === "DUPLICATE"
  ) {
    return null;
  }
  if (input.prospect.status === "ACTIVE_SQUAD") {
    return "Prospect has been promoted to an active squad or is pending activation.";
  }

  const email = normaliseEmail(input.prospect.email);
  const activeSquadKey =
    email && input.prospect.teamId
      ? `${email}::${input.prospect.teamId}`
      : null;

  if (activeSquadKey && input.activeSquadMembershipKeys.has(activeSquadKey)) {
    return "Email matches a player already attached to this team squad.";
  }

  return null;
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
  tone?: "white" | "emerald" | "sky" | "orange";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
      : tone === "sky"
        ? "border-sky-400/20 bg-sky-500/10 text-sky-100/70"
        : tone === "orange"
          ? "border-orange-400/20 bg-orange-500/10 text-orange-100/70"
          : "border-white/10 bg-white/[0.04] text-white/45";

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/55">{helper}</p>
    </div>
  );
}

function notificationAt(input: {
  sentAt: Date | null;
  failedAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
}) {
  return input.sentAt ?? input.failedAt ?? input.processedAt ?? input.createdAt;
}

function metadataText(value: unknown) {
  try {
    return JSON.stringify(value ?? {}).toLowerCase();
  } catch {
    return "";
  }
}

function isYesNoDispatch(input: {
  sourceType: string | null;
  metadata: unknown;
  bodyText: string;
}) {
  if (input.sourceType !== "TEAM_PLAYER_PROSPECT") return false;
  const text = `${metadataText(input.metadata)} ${input.bodyText.toLowerCase()}`;
  return (
    text.includes("yesresponseurl") ||
    text.includes("noresponseurl") ||
    text.includes("player-response/yes") ||
    text.includes("player-response/no")
  );
}

function isSigninDispatch(input: {
  sourceType: string | null;
  metadata: unknown;
  subject: string | null;
  templateKey: string | null;
}) {
  const metadata = metadataText(input.metadata);
  const subject = input.subject?.toLowerCase() ?? "";
  return (
    input.sourceType === "MANAGED_SQUAD_JOIN_CONFIRMATION" ||
    input.templateKey === "managed-squad-join-confirmation-email" ||
    input.templateKey === "squad-activation-email" ||
    metadata.includes("managed-squad-join-confirmation-email") ||
    metadata.includes("joinconfirmationurl") ||
    metadata.includes("squad-activation-email") ||
    subject.includes("activation") ||
    subject.includes("sign in") ||
    subject.includes("signin")
  );
}

async function loadActiveMembershipKeys(prospects: ProspectRecord[]) {
  const emails = Array.from(
    new Set(prospects.map((prospect) => normaliseEmail(prospect.email)).filter(Boolean)),
  );
  if (emails.length === 0) return new Set<string>();

  const rows = await prisma.$queryRaw<ActiveMembershipRow[]>(Prisma.sql`
    SELECT
      LOWER(TRIM(u."email")) AS "emailNormalized",
      tm."teamId" AS "teamId"
    FROM "User" u
    JOIN "TeamMember" tm ON tm."userId" = u."id"
    WHERE u."email" IS NOT NULL
      AND LOWER(TRIM(u."email")) IN (${Prisma.join(emails)})
  `);

  return new Set(
    rows.map((row) => `${row.emailNormalized}::${row.teamId}`),
  );
}

async function loadPlayerPoolProfiles(prospects: ProspectRecord[]) {
  const prospectIds = prospects.map((prospect) => prospect.id);
  const emails = Array.from(
    new Set(prospects.map((prospect) => normaliseEmail(prospect.email)).filter(Boolean)),
  );
  if (prospectIds.length === 0) {
    return new Map<string, ProspectPlayerPoolProfile>();
  }

  try {
    const directRows = await prisma.$queryRaw<PlayerPoolProfileRow[]>(Prisma.sql`
      SELECT
        "id",
        "prospectId",
        "emailNormalized",
        "publicCode",
        "status",
        "invitedAt",
        "profileSubmittedAt",
        "updatedAt"
      FROM "PlayerPoolProfile"
      WHERE "prospectId" IN (${Prisma.join(prospectIds)})
      ORDER BY "updatedAt" DESC
    `);

    const emailRows = emails.length
      ? await prisma.$queryRaw<PlayerPoolProfileRow[]>(Prisma.sql`
          SELECT
            "id",
            "prospectId",
            "emailNormalized",
            "publicCode",
            "status",
            "invitedAt",
            "profileSubmittedAt",
            "updatedAt"
          FROM "PlayerPoolProfile"
          WHERE "emailNormalized" IN (${Prisma.join(emails)})
          ORDER BY "updatedAt" DESC
        `)
      : [];

    const directByProspect = new Map<string, PlayerPoolProfileRow>();
    const byEmail = new Map<string, PlayerPoolProfileRow>();
    for (const row of directRows) {
      if (!directByProspect.has(row.prospectId)) {
        directByProspect.set(row.prospectId, row);
      }
    }
    for (const row of emailRows) {
      const email = normaliseEmail(row.emailNormalized);
      if (email && !byEmail.has(email)) byEmail.set(email, row);
    }

    const result = new Map<string, ProspectPlayerPoolProfile>();
    for (const prospect of prospects) {
      const row =
        directByProspect.get(prospect.id) ??
        byEmail.get(normaliseEmail(prospect.email));
      if (!row) continue;
      result.set(prospect.id, {
        id: row.id,
        publicCode: row.publicCode,
        status: row.status,
        invitedAt: row.invitedAt?.toISOString() ?? null,
        profileSubmittedAt: row.profileSubmittedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return result;
  } catch (error) {
    console.error("PlayerPool statuses could not be loaded for prospects", error);
    return new Map<string, ProspectPlayerPoolProfile>();
  }
}

async function enrichPageProspects(prospects: ProspectRecord[]) {
  const prospectIds = prospects.map((prospect) => prospect.id);
  if (prospectIds.length === 0) return [] as ProspectDisplayRecord[];

  const [responseRows, dispatches, playerPoolProfiles] = await Promise.all([
    prisma.$queryRaw<PlayerResponseRow[]>(Prisma.sql`
      SELECT DISTINCT ON (r."prospectId")
        r."prospectId" AS "prospectId",
        r."response"::text AS "response",
        r."respondedAt" AS "respondedAt"
      FROM "PlayerInterestResponse" r
      WHERE r."prospectId" IN (${Prisma.join(prospectIds)})
      ORDER BY r."prospectId", r."respondedAt" DESC
    `),
    prisma.notificationDispatch.findMany({
      where: {
        sourceId: { in: prospectIds },
        channel: "EMAIL",
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        sourceId: true,
        sourceType: true,
        status: true,
        subject: true,
        bodyText: true,
        metadata: true,
        sentAt: true,
        failedAt: true,
        processedAt: true,
        createdAt: true,
        template: { select: { key: true } },
      },
    }),
    loadPlayerPoolProfiles(prospects),
  ]);

  const latestResponseByProspectId = new Map(
    responseRows.map((row) => [row.prospectId, row]),
  );
  const latestYesNoByProspectId = new Map<
    string,
    { status: string; at: Date }
  >();
  const latestSigninByProspectId = new Map<
    string,
    { status: string; at: Date }
  >();
  const chaseByProspectId = new Map<string, ProspectChaseStatus>();

  const orderedDispatches = [...dispatches].sort(
    (a, b) => notificationAt(b).getTime() - notificationAt(a).getTime(),
  );

  for (const dispatch of orderedDispatches) {
    const prospectId = dispatch.sourceId?.trim();
    if (!prospectId) continue;
    const at = notificationAt(dispatch);

    if (
      !latestYesNoByProspectId.has(prospectId) &&
      isYesNoDispatch(dispatch)
    ) {
      latestYesNoByProspectId.set(prospectId, {
        status: String(dispatch.status),
        at,
      });
    }

    if (
      !latestSigninByProspectId.has(prospectId) &&
      isSigninDispatch({
        ...dispatch,
        templateKey: dispatch.template?.key ?? null,
      })
    ) {
      latestSigninByProspectId.set(prospectId, {
        status: String(dispatch.status),
        at,
      });
    }

    if (
      dispatch.sourceType === "MANAGED_SQUAD_JOIN_CHASE" ||
      dispatch.sourceType === "MANAGED_SQUAD_JOIN_FINAL_CHASE"
    ) {
      const current = chaseByProspectId.get(prospectId) ?? {
        chaseStatus: null,
        chaseAt: null,
        finalChaseStatus: null,
        finalChaseAt: null,
      };
      if (
        dispatch.sourceType === "MANAGED_SQUAD_JOIN_FINAL_CHASE" &&
        !current.finalChaseAt
      ) {
        current.finalChaseStatus = String(dispatch.status);
        current.finalChaseAt = at.toISOString();
      }
      if (
        dispatch.sourceType === "MANAGED_SQUAD_JOIN_CHASE" &&
        !current.chaseAt
      ) {
        current.chaseStatus = String(dispatch.status);
        current.chaseAt = at.toISOString();
      }
      chaseByProspectId.set(prospectId, current);
    }
  }

  return prospects.map((prospect) => {
    const response = latestResponseByProspectId.get(prospect.id) ?? null;
    const yesNo = latestYesNoByProspectId.get(prospect.id) ?? null;
    const signin = latestSigninByProspectId.get(prospect.id) ?? null;
    return {
      ...prospect,
      latestPlayerResponse: response?.response ?? null,
      latestPlayerRespondedAt: response?.respondedAt ?? null,
      latestYesNoEmailStatus: yesNo?.status ?? null,
      latestYesNoEmailAt: yesNo?.at ?? null,
      latestSigninEmailStatus: signin?.status ?? null,
      latestSigninEmailAt: signin?.at ?? null,
      playerPoolProfile: playerPoolProfiles.get(prospect.id) ?? null,
      chaseStatus: chaseByProspectId.get(prospect.id) ?? null,
    };
  });
}

function ProspectCard({
  prospect,
  teamOptions,
  activeReason,
  selectedLeagueId,
}: {
  prospect: ProspectDisplayRecord;
  teamOptions: ProspectTeamOption[];
  activeReason: string | null;
  selectedLeagueId: string;
}) {
  const name = getProspectName(prospect);
  const teamLeague = prospect.team?.league
    ? `${prospect.team.league.name}${prospect.team.league.season ? ` · ${prospect.team.league.season}` : ""}`
    : "No team assigned";
  const isUnassigned = !prospect.team;
  const isActivePlayer = Boolean(activeReason);
  const isClosedProspect =
    prospect.status === "DECLINED" || prospect.status === "DUPLICATE";
  const hasEmail = Boolean(prospect.email?.trim());
  const canSendSquadInvite = Boolean(
    prospect.team && hasEmail && !isClosedProspect && !isActivePlayer,
  );
  const canSendYesNo = Boolean(
    hasEmail && !isClosedProspect && !isActivePlayer,
  );

  return (
    <article className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-emerald-400/20 hover:bg-black/25">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)_auto] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(prospect.status)}`}
            >
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
            <span>{prospect.email || "No email"}</span>
            {prospect.phone ? <span>{prospect.phone}</span> : null}
            {prospect.source ? <span>Source: {prospect.source}</span> : null}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div
              className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${responseClasses(prospect.latestPlayerResponse)}`}
            >
              <div className="font-semibold">YES/NO reply</div>
              <div>{responseLabel(prospect.latestPlayerResponse)}</div>
              {prospect.latestPlayerRespondedAt ? (
                <div className="mt-1 opacity-80">
                  {formatDateTime(prospect.latestPlayerRespondedAt)}
                </div>
              ) : null}
            </div>
            <div
              className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${dispatchClasses(prospect.latestYesNoEmailStatus)}`}
            >
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
            <div
              className={`rounded-2xl border px-3 py-2 text-xs leading-5 ${dispatchClasses(prospect.latestSigninEmailStatus)}`}
            >
              <div className="font-semibold">Squad invite</div>
              <div>
                {dispatchLabel({
                  label: "Squad invite",
                  status: prospect.latestSigninEmailStatus,
                  at: prospect.latestSigninEmailAt,
                  empty: "No squad invite sent yet",
                })}
              </div>
            </div>
          </div>

          {activeReason ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.08] px-3 py-2 text-xs leading-5 text-emerald-100/80">
              <span className="font-semibold text-emerald-100">
                Active player reason:
              </span>{" "}
              {activeReason}
            </div>
          ) : null}

          {prospect.preferredPositions || prospect.availabilitySummary ? (
            <p className="mt-3 text-sm leading-6 text-white/60">
              {[prospect.preferredPositions, prospect.availabilitySummary]
                .filter(Boolean)
                .join(" · ")}
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
            {isClosedProspect
              ? "Closed record"
              : isUnassigned
                ? "Prospect pool"
                : isActivePlayer
                  ? "Active team"
                  : "Currently held under"}
          </div>

          {prospect.team ? (
            <>
              <div className="mt-2 font-semibold text-emerald-200">
                {prospect.team.name}
              </div>
              <div className="mt-1 text-sm text-white/45">{teamLeague}</div>
              <div className="mt-2 text-xs text-white/35">
                Mode: {prospect.team.teamMode}
              </div>

              {canSendYesNo ? (
                <form
                  action={sendPlayerProspectYesNoChaseAction}
                  className="mt-4"
                >
                  <input type="hidden" name="prospectId" value={prospect.id} />
                  <input
                    type="hidden"
                    name="leagueId"
                    value={selectedLeagueId}
                  />
                  <input
                    type="hidden"
                    name="responseTeamId"
                    value={prospect.team.id}
                  />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-50 transition hover:bg-violet-500/20"
                  >
                    Resend YES/NO
                  </button>
                </form>
              ) : null}

              {canSendSquadInvite ? (
                <form
                  action={sendPlayerProspectSquadInviteAction}
                  className="mt-3"
                >
                  <input type="hidden" name="prospectId" value={prospect.id} />
                  <input
                    type="hidden"
                    name="leagueId"
                    value={selectedLeagueId}
                  />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
                  >
                    Send squad invite
                  </button>
                </form>
              ) : null}
            </>
          ) : isClosedProspect ? (
            <>
              <div className="mt-2 font-semibold text-orange-100">
                {prospect.status === "DUPLICATE"
                  ? "Duplicate record"
                  : "Not interested"}
              </div>
              <div className="mt-1 text-sm text-white/45">
                Kept for history but not part of the open pipeline.
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 font-semibold text-sky-100">
                Unassigned prospect
              </div>
              <div className="mt-1 text-sm text-white/45">
                Choose a team context to chase them, or assign them permanently.
              </div>

              <form
                action={sendPlayerProspectYesNoChaseAction}
                className="mt-4 space-y-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3"
              >
                <input type="hidden" name="prospectId" value={prospect.id} />
                <input
                  type="hidden"
                  name="leagueId"
                  value={selectedLeagueId}
                />
                <FormListboxField
                  name="responseTeamId"
                  options={teamOptions}
                  placeholder="Choose team for YES/NO"
                  disabled={teamOptions.length === 0 || !hasEmail}
                />
                <button
                  type="submit"
                  disabled={teamOptions.length === 0 || !hasEmail}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-50 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Resend YES/NO
                </button>
              </form>

              <form
                action={assignPlayerProspectToTeamAction}
                className="mt-4 space-y-3"
              >
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

          {!hasEmail && !isClosedProspect ? (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
              Add an email address before sending player emails.
            </div>
          ) : null}

          <ProspectNativeActions
            prospectId={prospect.id}
            playerName={name}
            currentTeamId={prospect.teamId}
            hasEmail={hasEmail}
            isClosed={isClosedProspect}
            isActivePlayer={isActivePlayer}
            latestPlayerResponse={prospect.latestPlayerResponse}
            latestSigninEmailStatus={prospect.latestSigninEmailStatus}
            selectedLeagueId={selectedLeagueId}
            teamOptions={teamOptions}
            playerPoolProfile={prospect.playerPoolProfile}
            chaseStatus={prospect.chaseStatus}
          />
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Link
            href={`/admin/player-prospects/${prospect.id}/communications`}
            className="inline-flex items-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
          >
            Comms & history
          </Link>
          {prospect.team ? (
            <>
              <Link
                href={`/admin/teams/${prospect.team.id}/squad`}
                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Manage squad
              </Link>
              <Link
                href={`/admin/teams/${prospect.team.id}/communications`}
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Team comms
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/35">
        <span>Added {formatDate(prospect.createdAt)}</span>
        <span>Updated {formatDate(prospect.updatedAt)}</span>
        {prospect.lastContactedAt ? (
          <span>Last contacted {formatDate(prospect.lastContactedAt)}</span>
        ) : null}
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
  const selectedLeagueId = String(filters.leagueId ?? "").trim();
  const selectedView = parseView(filters.view);
  const requestedPage = parsePage(filters.page);
  const searchQuery = normaliseProspectSearch(filters.q);
  const matchesSearch = createProspectSearchMatcher(searchQuery);

  const [rawProspects, teams, leagues] = await Promise.all([
    prisma.teamPlayerProspect.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        teamId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        preferredPositions: true,
        availabilitySummary: true,
        source: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        lastContactedAt: true,
        team: {
          select: {
            id: true,
            name: true,
            teamMode: true,
            league: {
              select: {
                id: true,
                name: true,
                season: true,
                area: true,
                dayOfWeek: true,
              },
            },
          },
        },
      },
    }),
    prisma.team.findMany({
      orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        teamMode: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
          },
        },
      },
    }),
    prisma.league.findMany({
      orderBy: [{ area: "asc" }, { name: "asc" }, { season: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        area: true,
        dayOfWeek: true,
      },
    }),
  ]);

  const allProspects: ProspectRecord[] = rawProspects.map((prospect) => ({
    ...prospect,
    status: String(prospect.status),
    team: prospect.team
      ? {
          ...prospect.team,
          teamMode: String(prospect.team.teamMode),
          league: prospect.team.league
            ? {
                ...prospect.team.league,
                dayOfWeek: prospect.team.league.dayOfWeek
                  ? String(prospect.team.league.dayOfWeek)
                  : null,
              }
            : null,
        }
      : null,
  }));

  const selectedLeague =
    leagues.find((league) => league.id === selectedLeagueId) ?? null;
  // Search before status counts and pagination, not just the twelve visible cards.
  const prospects = allProspects.filter((prospect) =>
    prospectMatchesLeague(prospect, selectedLeague) && matchesSearch(prospect),
  );
  const activeSquadMembershipKeys = await loadActiveMembershipKeys(prospects);
  const activeReasonById = new Map<string, string>();

  for (const prospect of prospects) {
    const reason = getActiveProspectReason({
      prospect,
      activeSquadMembershipKeys,
    });
    if (reason) activeReasonById.set(prospect.id, reason);
  }

  const isActive = (prospect: ProspectRecord) =>
    activeReasonById.has(prospect.id);
  const pipelineProspects = prospects.filter(
    (prospect) =>
      !isActive(prospect) &&
      prospect.status !== "DECLINED" &&
      prospect.status !== "DUPLICATE",
  );
  const activeProspects = prospects.filter(isActive);
  const duplicateProspects = prospects.filter(
    (prospect) => !isActive(prospect) && prospect.status === "DUPLICATE",
  );
  const declinedProspects = prospects.filter(
    (prospect) => !isActive(prospect) && prospect.status === "DECLINED",
  );
  const unassignedProspects = pipelineProspects.filter(
    (prospect) => !prospect.teamId,
  );

  const viewProspects =
    selectedView === "active"
      ? activeProspects
      : selectedView === "duplicates"
        ? duplicateProspects
        : selectedView === "declined"
          ? declinedProspects
          : pipelineProspects;
  const totalPages = Math.max(
    1,
    Math.ceil(viewProspects.length / PROSPECTS_PER_PAGE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const pageBaseProspects = viewProspects.slice(
    (currentPage - 1) * PROSPECTS_PER_PAGE,
    currentPage * PROSPECTS_PER_PAGE,
  );
  const pageProspects = await enrichPageProspects(pageBaseProspects);
  const pageStart = viewProspects.length
    ? (currentPage - 1) * PROSPECTS_PER_PAGE + 1
    : 0;
  const pageEnd = Math.min(
    currentPage * PROSPECTS_PER_PAGE,
    viewProspects.length,
  );

  const teamOptions: ProspectTeamOption[] = teams
    .filter(
      (team) => !selectedLeague || team.league?.id === selectedLeague.id,
    )
    .map((team) => ({
      value: team.id,
      label: `${team.name}${team.league?.name ? ` · ${team.league.name}` : ""}${team.league?.season ? ` ${team.league.season}` : ""} · ${String(team.teamMode)}`,
    }));
  const leagueOptions: FormListboxOption[] = [
    { value: "", label: "All leagues" },
    ...leagues.map((league) => ({
      value: league.id,
      label: getLeagueLabel({
        ...league,
        dayOfWeek: league.dayOfWeek ? String(league.dayOfWeek) : null,
      }),
    })),
  ];

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error?.trim() || null;
  const selectedLeagueLabel = selectedLeague
    ? getLeagueLabel({
        ...selectedLeague,
        dayOfWeek: selectedLeague.dayOfWeek
          ? String(selectedLeague.dayOfWeek)
          : null,
      })
    : "All leagues";
  const viewMeta =
    selectedView === "active"
      ? {
          eyebrow: "Active players",
          title: "Already promoted or linked to squads",
          empty: "No active players match this league filter.",
        }
      : selectedView === "duplicates"
        ? {
            eyebrow: "Duplicated",
            title: "Duplicate records kept out of the pipeline",
            empty: "No duplicate records match this league filter.",
          }
        : selectedView === "declined"
          ? {
              eyebrow: "Not interested",
              title: "Players kept out of the active pipeline",
              empty: "No not-interested records match this league filter.",
            }
          : {
              eyebrow: "Open player prospects",
              title: "Pipeline list",
              empty: "No open player prospects match this league filter yet.",
            };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              SIXFL pipeline
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Player prospects
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/70 sm:text-base">
              Assign players, resend YES/NO chases, send squad invites and review
              player history without loading the complete prospect archive at once.
            </p>

            <form
              method="get"
              action="/admin/player-prospects"
              role="search"
              aria-label="Search player prospects"
              className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4"
            >
              <input type="hidden" name="view" value={selectedView} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Filter prospects
              </p>
              <label htmlFor="prospect-search" className="mt-3 block text-sm font-medium text-white/80">
                Search players
              </label>
              <input
                key={searchQuery}
                id="prospect-search"
                name="q"
                type="search"
                defaultValue={searchQuery}
                placeholder="Name, email or mobile number"
                maxLength={120}
                autoComplete="off"
                aria-describedby="prospect-search-help"
                className="mt-2 h-12 w-full min-w-0 rounded-xl border border-white/15 bg-[#0d1424] px-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
              <p id="prospect-search-help" className="mt-2 text-xs leading-5 text-white/50">
                Searches every page, not just the visible players. The tabs show matching players in each status.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <FormListboxField
                  name="leagueId"
                  label="League"
                  value={selectedLeagueId}
                  options={leagueOptions}
                  placeholder="All leagues"
                />
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                >
                  Search
                </button>
                {selectedLeague ? (
                  <Link
                    href={buildProspectHref({
                      leagueId: "",
                      view: selectedView,
                      q: searchQuery,
                    })}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Clear league
                  </Link>
                ) : null}
              </div>
              <p className="mt-3 text-xs leading-5 text-white/45">
                Showing:{" "}
                <span className="font-semibold text-white/70">
                  {selectedLeagueLabel}
                </span>
              </p>
              {searchQuery ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2 text-sm text-emerald-100">
                  <span className="min-w-0 break-words">Matching “{searchQuery}” · {prospects.length} across all status tabs</span>
                  <Link
                    href={buildProspectHref({ leagueId: selectedLeagueId, view: selectedView })}
                    className="shrink-0 rounded-lg px-2 py-1 font-semibold underline underline-offset-4 hover:bg-white/10"
                  >
                    Clear search
                  </Link>
                </div>
              ) : null}
            </form>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label="Open"
              value={pipelineProspects.length}
              helper="Still in the pipeline"
              tone="emerald"
            />
            <StatCard
              label="Unassigned"
              value={unassignedProspects.length}
              helper="Ready to assign"
              tone="sky"
            />
            <StatCard
              label="Active players"
              value={activeProspects.length}
              helper="Already in use"
              tone="emerald"
            />
            <StatCard
              label="Duplicated"
              value={duplicateProspects.length}
              helper="Out of pipeline"
              tone="orange"
            />
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

      <nav
        className="grid gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-4"
        aria-label="Prospect views"
      >
        {(
          [
            ["pipeline", "Open pipeline", pipelineProspects.length],
            ["active", "Active players", activeProspects.length],
            ["duplicates", "Duplicates", duplicateProspects.length],
            ["declined", "Not interested", declinedProspects.length],
          ] as Array<[ProspectView, string, number]>
        ).map(([view, label, count]) => (
          <Link
            key={view}
            href={buildProspectHref({ leagueId: selectedLeagueId, view, q: searchQuery })}
            className={[
              "flex min-h-12 items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition",
              selectedView === view
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                : "border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
            ].join(" ")}
          >
            <span>{label}</span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs">
              {count}
            </span>
          </Link>
        ))}
      </nav>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              {viewMeta.eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {viewMeta.title}
            </h2>
          </div>
          <div className="text-sm text-white/50">
            Showing {pageStart}-{pageEnd} of {viewProspects.length}{searchQuery ? " matching players" : ""}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {pageProspects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">
              {searchQuery
                ? prospects.length > 0
                  ? "No matching players in this status. Check the other status tabs above, or clear the search."
                  : "No players match this search and league filter. Try part of a name, email or mobile number, or clear the filters."
                : viewMeta.empty}
            </div>
          ) : (
            pageProspects.map((prospect) => (
              <ProspectCard
                key={prospect.id}
                prospect={prospect}
                teamOptions={teamOptions}
                activeReason={activeReasonById.get(prospect.id) ?? null}
                selectedLeagueId={selectedLeagueId}
              />
            ))
          )}
        </div>
      </section>

      {totalPages > 1 ? (
        <nav
          className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Prospect pages"
        >
          <div className="text-sm text-white/55">
            Page {currentPage} of {totalPages} · showing {pageStart}-{pageEnd} of{" "}
            {viewProspects.length}
          </div>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link
                href={buildProspectHref({
                  leagueId: selectedLeagueId,
                  view: selectedView,
                  page: currentPage - 1,
                  q: searchQuery,
                })}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white"
              >
                Previous
              </Link>
            ) : null}
            {currentPage < totalPages ? (
              <Link
                href={buildProspectHref({
                  leagueId: selectedLeagueId,
                  view: selectedView,
                  page: currentPage + 1,
                  q: searchQuery,
                })}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
