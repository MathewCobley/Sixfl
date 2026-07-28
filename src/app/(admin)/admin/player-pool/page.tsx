// ========================================
// File: src/app/(admin)/admin/player-pool/page.tsx
// ========================================

import Link from "next/link";

import DeletePlayerPoolProfileButton from "@/components/admin/player-pool/DeletePlayerPoolProfileButton";
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

type SearchParams = Promise<{ saved?: string; error?: string }>;

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
  return nights.map((night) => night.charAt(0) + night.slice(1).toLowerCase()).join(", ");
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
    case "PAUSED":
    case "NOT_LOOKING":
    case "DECLINED":
    case "CLOSED":
      return "border-white/10 bg-white/5 text-white/55";
    default:
      return "border-white/10 bg-white/5 text-white/70";
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
  const awaitingProfile = playerLeads.filter((lead) => !profileLeadIds.has(lead.id));
  const openRequests = requests.filter((request) => request.status === "REQUESTED");
  const availableCount = profiles.filter((profile) => profile.status === "AVAILABLE").length;
  const savedMessage = getSavedMessage(params.saved);

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
              Send profile forms to individual player leads, review completed profiles and approve captain introduction requests without exposing contact details prematurely.
            </p>
          </div>
          <Link
            href="/player-pool"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Open public PlayerPool form
          </Link>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          {[
            ["Available", availableCount],
            ["Open requests", openRequests.length],
            ["Awaiting profile", awaitingProfile.length],
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
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300/80">Profiles</p>
          <h2 className="mt-2 text-2xl font-black text-white">PlayerPool players</h2>
        </div>
        <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
          {profiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/55 xl:col-span-2">
              No PlayerPool profiles have been created yet.
            </div>
          ) : null}
          {profiles.map((profile) => {
            const playerName = nameOf(profile.firstName, profile.lastName) || profile.email || "this player";

            return (
              <article key={profile.id} className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-emerald-200">{profile.publicCode}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClasses(profile.status)}`}>
                        {profile.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-white">{playerName}</h3>
                    <div className="mt-1 text-sm text-white/55">
                      {profile.email || "No email"}{profile.phone ? ` · ${profile.phone}` : ""}
                    </div>
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

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
                  <span>Invited: {formatDate(profile.invitedAt)}</span>
                  <span>·</span>
                  <span>Profile: {formatDate(profile.profileSubmittedAt)}</span>
                </div>

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
          <h2 className="mt-2 text-2xl font-black text-white">Player leads awaiting a profile</h2>
        </div>
        <div className="divide-y divide-white/10">
          {awaitingProfile.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">Every current player lead has a PlayerPool profile or invitation.</div>
          ) : null}
          {awaitingProfile.map((lead) => (
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
