// ========================================
// File: src/app/(admin)/admin/player-pool/page.tsx
// ========================================

import Link from "next/link";
import PlayerPoolSmsChaseHistory from "@/components/admin/player-pool/PlayerPoolSmsChaseHistory";
import { getPlayerPoolProfileSmsHistory } from "@/lib/player-pool/profile-sms-reminders";

import DeletePlayerPoolProfileButton from "@/components/admin/player-pool/DeletePlayerPoolProfileButton";
import PlayerPoolJoinedTeams from "@/components/admin/player-pool/PlayerPoolJoinedTeams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { ensurePlayerPoolTables, readPlayerPoolStringArray } from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  introducePlayerPoolRequestAction,
  returnPlayerPoolProfileAction,
  sendPlayerPoolProfileInviteAction,
  setPlayerPoolProfileStatusAction,
} from "./actions";
import { deletePlayerPoolProfileAction } from "./delete-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "SIXFL PlayerPool | Admin",
};

type ProfileView =
  | "available"
  | "introductions"
  | "joined"
  | "inactive"
  | "awaiting"
  | "all";

type SearchParams = Promise<{ saved?: string; error?: string; view?: string }>;

type ProfileRow = {
  id: string;
  leadId: string | null;
  publicCode: string;
  profileToken: string;
  area: string | null;
  preferredPosition: string | null;
  status: string;
  invitedAt: Date | null;
  profileSubmittedAt: Date | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown;
  availabilitySummary: string | null;
  leagueName: string | null;
};

type RequestRow = {
  id: string;
  profileId: string;
  status: string;
  requestedAt: Date;
  introducedAt: Date | null;
  resolvedAt: Date | null;
  captainMessage: string | null;
  publicCode: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  teamId: string;
  teamName: string;
  requesterName: string | null;
  requesterEmail: string | null;
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nameOf(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function formatNights(value: unknown) {
  const nights = readPlayerPoolStringArray(value);
  if (!nights.length || nights.includes("ANY")) return "Flexible";
  return nights
    .map((night) => night.charAt(0) + night.slice(1).toLowerCase())
    .join(", ");
}

function statusClasses(status: string) {
  switch (status) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "REQUESTED":
    case "INTRODUCTION_REQUESTED":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "INTRODUCED":
    case "TRIAL_ARRANGED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "JOINED":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "INVITED":
      return "border-cyan-400/25 bg-cyan-500/10 text-cyan-100";
    case "PAUSED":
    case "NOT_LOOKING":
    case "DECLINED":
    case "CLOSED":
      return "border-white/10 bg-white/5 text-white/55";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function getDisplayedProfileStatus(profileStatus: string, activity: RequestRow | null) {
  if (profileStatus === "TRIAL_ARRANGED" && activity?.status === "INTRODUCED") {
    return "INTRODUCED";
  }
  return profileStatus;
}

function parseView(value?: string): ProfileView {
  if (
    value === "available" ||
    value === "introductions" ||
    value === "joined" ||
    value === "inactive" ||
    value === "awaiting" ||
    value === "all"
  ) {
    return value;
  }
  return "available";
}

function profileViewFor(profile: ProfileRow, activity: RequestRow | null): Exclude<ProfileView, "all"> {
  const status = getDisplayedProfileStatus(profile.status, activity);
  if (status === "AVAILABLE") return "available";
  if (
    status === "INTRODUCTION_REQUESTED" ||
    status === "REQUESTED" ||
    status === "INTRODUCED" ||
    status === "TRIAL_ARRANGED"
  ) {
    return "introductions";
  }
  if (status === "JOINED") return "joined";
  if (status === "INVITED") return "awaiting";
  return "inactive";
}

function viewLabel(view: ProfileView) {
  switch (view) {
    case "available":
      return "Available";
    case "introductions":
      return "Introductions";
    case "joined":
      return "Joined";
    case "inactive":
      return "Paused / not looking";
    case "awaiting":
      return "Awaiting profile";
    default:
      return "All profiles";
  }
}

function activityCopy(request: RequestRow) {
  switch (request.status) {
    case "REQUESTED":
      return {
        eyebrow: "Introduction requested",
        title: `${request.teamName} has asked to speak to this player`,
        detail: `Requested ${formatDate(request.requestedAt)} by ${request.requesterName || request.requesterEmail || "captain"}. Contact details have not yet been released by SIXFL.`,
        tone: "border-amber-400/20 bg-amber-500/[0.08] text-amber-50/80",
      };
    case "INTRODUCED":
      return {
        eyebrow: "Introduction made",
        title: `Introduced to ${request.teamName}`,
        detail: `SIXFL introduced the player to ${request.teamName} on ${formatDate(request.introducedAt)}. The team and player can now discuss a game or trial.`,
        tone: "border-sky-400/20 bg-sky-500/[0.08] text-sky-50/80",
      };
    case "JOINED":
      return {
        eyebrow: "Joined team",
        title: `Joined ${request.teamName}`,
        detail: `This PlayerPool route is recorded as completed${request.resolvedAt ? ` on ${formatDate(request.resolvedAt)}` : ""}.`,
        tone: "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-50/80",
      };
    case "DECLINED":
      return {
        eyebrow: "Introduction declined",
        title: `Request from ${request.teamName} declined`,
        detail: `Requested ${formatDate(request.requestedAt)}${request.resolvedAt ? ` · closed ${formatDate(request.resolvedAt)}` : ""}.`,
        tone: "border-red-400/20 bg-red-500/[0.07] text-red-50/75",
      };
    case "CLOSED":
      return {
        eyebrow: "Introduction closed",
        title: `Request involving ${request.teamName} is closed`,
        detail: `Requested ${formatDate(request.requestedAt)}${request.resolvedAt ? ` · closed ${formatDate(request.resolvedAt)}` : ""}.`,
        tone: "border-white/10 bg-white/[0.04] text-white/65",
      };
    default:
      return {
        eyebrow: request.status.replaceAll("_", " "),
        title: `PlayerPool activity with ${request.teamName}`,
        detail: `Requested ${formatDate(request.requestedAt)}.`,
        tone: "border-white/10 bg-white/[0.04] text-white/65",
      };
  }
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "invite-sent":
      return "PlayerPool profile invitation sent.";
    case "introduced":
      return "Introduction emails sent and the player was added to the team prospect list.";
    case "returned":
      return "Player returned to the available pool.";
    case "status-updated":
      return "PlayerPool status updated.";
    case "deleted":
      return "Player removed from PlayerPool. Their original lead and player record were kept.";
    default:
      return null;
  }
}

export default async function AdminPlayerPoolPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  await ensurePlayerPoolTables();

  const params = (await searchParams) ?? {};
  const selectedView = parseView(params.view);

  const [profiles, requests, playerLeads] = await Promise.all([
    prisma.$queryRaw<ProfileRow[]>`
      SELECT
        profile."id",
        profile."leadId",
        profile."publicCode",
        profile."profileToken",
        profile."area",
        profile."preferredPosition",
        profile."status",
        profile."invitedAt",
        profile."profileSubmittedAt",
        prospect."firstName",
        prospect."lastName",
        prospect."email",
        prospect."phone",
        prospect."ageBand",
        prospect."preferredPositions",
        prospect."experienceSummary",
        prospect."availabilityLevel",
        prospect."preferredNights",
        prospect."availabilitySummary",
        league."name" AS "leagueName"
      FROM "PlayerPoolProfile" profile
      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
      LEFT JOIN "League" league ON league."id" = profile."leagueId"
      ORDER BY COALESCE(profile."profileSubmittedAt", profile."invitedAt", profile."createdAt") DESC
    `,
    prisma.$queryRaw<RequestRow[]>`
      SELECT
        request."id",
        request."profileId",
        request."status",
        request."requestedAt",
        request."introducedAt",
        request."resolvedAt",
        request."captainMessage",
        profile."publicCode",
        prospect."firstName",
        prospect."lastName",
        prospect."email",
        prospect."phone",
        team."id" AS "teamId",
        team."name" AS "teamName",
        requester."name" AS "requesterName",
        requester."email" AS "requesterEmail"
      FROM "PlayerPoolIntroductionRequest" request
      JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"
      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
      JOIN "Team" team ON team."id" = request."teamId"
      LEFT JOIN "User" requester ON requester."id" = request."requestedByUserId"
      ORDER BY request."requestedAt" DESC
    `,
    prisma.interestLead.findMany({
      where: {
        interestType: "PLAYER",
        status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
        email: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        league: { select: { name: true } },
        preferredNights: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  const profileLeadIds = new Set(profiles.map((profile) => profile.leadId).filter(Boolean));
  const awaitingProfileLeads = playerLeads.filter((lead) => !profileLeadIds.has(lead.id));
  const openRequests = requests.filter((request) => request.status === "REQUESTED");
  const latestRequestByProfileId = new Map<string, RequestRow>();
  for (const request of requests) {
    if (!latestRequestByProfileId.has(request.profileId)) {
      latestRequestByProfileId.set(request.profileId, request);
    }
  }

  const counts: Record<Exclude<ProfileView, "all">, number> = {
    available: 0,
    introductions: 0,
    joined: 0,
    inactive: 0,
    awaiting: 0,
  };
  for (const profile of profiles) {
    counts[profileViewFor(profile, latestRequestByProfileId.get(profile.id) ?? null)] += 1;
  }

  const visibleProfiles =
    selectedView === "all"
      ? profiles
      : profiles.filter(
          (profile) =>
            profileViewFor(profile, latestRequestByProfileId.get(profile.id) ?? null) === selectedView,
        );

  const smsHistory = await getPlayerPoolProfileSmsHistory(visibleProfiles.map((profile) => profile.id));

  const totalAwaitingProfile = counts.awaiting + awaitingProfileLeads.length;
  const savedMessage = getSavedMessage(params.saved);
  const tabs: Array<{ view: ProfileView; label: string; count: number }> = [
    { view: "available", label: "Available", count: counts.available },
    { view: "introductions", label: "Introductions", count: counts.introductions },
    { view: "joined", label: "Joined", count: counts.joined },
    { view: "inactive", label: "Paused / not looking", count: counts.inactive },
    { view: "awaiting", label: "Awaiting profile", count: counts.awaiting },
    { view: "all", label: "All", count: profiles.length },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
              SIXFL PlayerPool
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Match available players with teams
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">
              Work the available pool first, then follow introductions through to joined. Older joined and inactive players stay accessible without filling the live working list.
            </p>
          </div>
          <Link
            href="/player-pool"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Open public PlayerPool form
          </Link>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Available", counts.available],
            ["Open requests", openRequests.length],
            ["Joined", counts.joined],
            ["Awaiting profile", totalAwaitingProfile],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">{label}</div>
              <div className="mt-2 text-3xl font-black text-white">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {savedMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {params.error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/80">Action needed</p>
          <h2 className="mt-2 text-2xl font-black text-white">Introduction requests</h2>
        </div>
        <div className="divide-y divide-white/10">
          {openRequests.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">No captain introduction requests are waiting.</div>
          ) : null}
          {openRequests.map((request) => (
            <article key={request.id} className="grid gap-5 px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClasses(request.status)}`}>
                    {request.status.replaceAll("_", " ")}
                  </span>
                  <span className="font-mono text-sm text-emerald-200">{request.publicCode}</span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-white">
                  {request.teamName} wants an introduction to {nameOf(request.firstName, request.lastName)}
                </h3>
                <p className="mt-2 text-sm text-white/55">
                  Requested {formatDate(request.requestedAt)} by {request.requesterName || request.requesterEmail || "captain"}
                </p>
                {request.captainMessage ? (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white/70">
                    {request.captainMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                <form action={introducePlayerPoolRequestAction}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-400">
                    Approve and introduce
                  </button>
                </form>
                <form action={returnPlayerPoolProfileAction}>
                  <input type="hidden" name="profileId" value={request.profileId} />
                  <input type="hidden" name="requestId" value={request.id} />
                  <button className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/10">
                    Close and return to pool
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-4 py-5 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300/80">Profiles</p>
          <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-2xl font-black text-white">{viewLabel(selectedView)}</h2>
              <p className="mt-1 text-sm text-white/50">
                {selectedView === "available"
                  ? "Players currently looking for a team."
                  : selectedView === "introductions"
                    ? "Players with an introduction or trial-stage journey in progress."
                    : selectedView === "joined"
                      ? "Players whose PlayerPool journey has ended in a team."
                      : selectedView === "inactive"
                        ? "Players paused or no longer looking, retained for history."
                        : selectedView === "awaiting"
                          ? "Invited players who have not yet completed their PlayerPool profile."
                          : "Every PlayerPool profile, regardless of status."}
              </p>
            </div>
            <div className="text-sm text-white/45">{visibleProfiles.length} shown · {profiles.length} total</div>
          </div>

          <nav className="mt-5 flex flex-wrap gap-2" aria-label="PlayerPool status sections">
            {tabs.map((tab) => {
              const active = selectedView === tab.view;
              return (
                <Link
                  key={tab.view}
                  href={`/admin/player-pool?view=${tab.view}`}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition",
                    active
                      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-50"
                      : "border-white/10 bg-black/20 text-white/55 hover:bg-white/[0.06] hover:text-white",
                  ].join(" ")}
                >
                  <span>{tab.label}</span>
                  <span className={active ? "text-emerald-200" : "text-white/35"}>{tab.count}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
          {visibleProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/55 xl:col-span-2">
              No players are currently in the {viewLabel(selectedView).toLowerCase()} section.
            </div>
          ) : null}

          {visibleProfiles.map((profile) => {
            const playerName = nameOf(profile.firstName, profile.lastName) || profile.email || "this player";
            const activity = latestRequestByProfileId.get(profile.id) ?? null;
            const displayedStatus = getDisplayedProfileStatus(profile.status, activity);
            const activityDetails = activity ? activityCopy(activity) : null;
            const legacyTrialLabel =
              profile.status === "TRIAL_ARRANGED" && activity?.status === "INTRODUCED";

            return (
              <article key={profile.id} className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-emerald-200">{profile.publicCode}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClasses(displayedStatus)}`}>
                        {displayedStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-white">{playerName}</h3>
                    <div className="mt-1 text-sm text-white/55">
                      {profile.email || "No email"}{profile.phone ? ` · ${profile.phone}` : ""}
                    </div>
                    {displayedStatus === "JOINED" ? (
                      <PlayerPoolJoinedTeams
                        profileId={profile.id}
                        email={profile.email}
                        playerName={playerName}
                      />
                    ) : null}
                  </div>
                  <Link
                    href={`/player-pool/profile/${profile.profileToken}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10"
                  >
                    Open form
                  </Link>
                </div>

                <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    ["Age", profile.ageBand],
                    ["Positions", profile.preferredPositions],
                    ["Preferred", profile.preferredPosition],
                    ["Experience", profile.experienceSummary],
                    ["Availability", profile.availabilityLevel],
                    ["Nights", formatNights(profile.preferredNights)],
                    ["Area", profile.area],
                    ["League", profile.leagueName],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</div>
                      <div className="mt-1 text-white/75">{value || "—"}</div>
                    </div>
                  ))}
                </div>

                {profile.availabilitySummary ? (
                  <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/65">
                    {profile.availabilitySummary}
                  </p>
                ) : null}

                {activity && activityDetails ? (
                  <section className={`mt-4 rounded-2xl border p-4 ${activityDetails.tone}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                          {activityDetails.eyebrow}
                        </p>
                        <h4 className="mt-1 text-base font-bold text-white">{activityDetails.title}</h4>
                      </div>
                      <Link
                        href={`/admin/teams/${activity.teamId}`}
                        className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
                      >
                        Open {activity.teamName}
                      </Link>
                    </div>
                    <p className="mt-2 text-sm leading-6">{activityDetails.detail}</p>
                    {activity.captainMessage ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/65">
                        <span className="font-semibold text-white/80">Captain message:</span>{" "}
                        {activity.captainMessage}
                      </div>
                    ) : null}
                    {legacyTrialLabel ? (
                      <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-50/85">
                        <strong>Trial detail not recorded.</strong> Older PlayerPool logic labelled an approved introduction as “Trial arranged” immediately. The stored record only proves that SIXFL introduced this player to {activity.teamName}; there is no separate trial date or trial confirmation on record.
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
                  <span>Invited: {formatDate(profile.invitedAt)}</span>
                  <span>·</span>
                  <span>Profile: {formatDate(profile.profileSubmittedAt)}</span>
                </div>

                <PlayerPoolSmsChaseHistory profile={profile} history={smsHistory.get(profile.id)!} />

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {[
                    ["AVAILABLE", "Available"],
                    ["PAUSED", "Pause"],
                    ["JOINED", "Joined"],
                    ["NOT_LOOKING", "Not looking"],
                  ].map(([status, label]) => (
                    <form key={status} action={setPlayerPoolProfileStatusAction}>
                      <input type="hidden" name="profileId" value={profile.id} />
                      <input type="hidden" name="status" value={status} />
                      <button className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/65 transition hover:bg-white/10 hover:text-white">
                        {label}
                      </button>
                    </form>
                  ))}
                </div>

                <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
                  <DeletePlayerPoolProfileButton
                    profileId={profile.id}
                    playerName={playerName}
                    action={deletePlayerPoolProfileAction}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300/80">Invite players</p>
          <h2 className="mt-2 text-2xl font-black text-white">Player leads not yet invited</h2>
        </div>
        <div className="divide-y divide-white/10">
          {awaitingProfileLeads.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">Every current player lead has a PlayerPool profile or invitation.</div>
          ) : null}
          {awaitingProfileLeads.map((lead) => (
            <div key={lead.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="font-bold text-white">{lead.contactName}</div>
                <div className="mt-1 text-sm text-white/55">
                  {lead.email}{lead.phone ? ` · ${lead.phone}` : ""}
                </div>
                <div className="mt-2 text-xs text-white/40">
                  {lead.area || "No area"}
                  {lead.league?.name ? ` · ${lead.league.name}` : ""}
                  {lead.preferredNights.length
                    ? ` · ${lead.preferredNights.map((item) => item.night.charAt(0) + item.night.slice(1).toLowerCase()).join(", ")}`
                    : ""}
                </div>
              </div>
              <form action={sendPlayerPoolProfileInviteAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <button className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-400 lg:w-auto">
                  Send PlayerPool form
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
