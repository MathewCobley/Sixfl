// ========================================
// File: src/app/captain/team/[teamid]/player-pool/page.tsx
// ========================================

import { notFound } from "next/navigation";

import {
  ensurePlayerPoolTables,
  readPlayerPoolStringArray,
} from "@/lib/player-pool/storage";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { requestPlayerPoolIntroductionAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "SIXFL PlayerPool | Captain",
};

type SearchParams = Promise<{ saved?: string; error?: string }>;

type ProfileRow = {
  profileId: string;
  publicCode: string;
  area: string | null;
  leagueId: string | null;
  preferredPosition: string | null;
  profileStatus: string;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown;
  availabilitySummary: string | null;
  requestId: string | null;
  requestStatus: string | null;
};

function formatNights(value: unknown) {
  const nights = readPlayerPoolStringArray(value);
  if (!nights.length || nights.includes("ANY")) return "Flexible";
  return nights.map((night) => night.charAt(0) + night.slice(1).toLowerCase()).join(", ");
}

function matchesNight(value: unknown, teamNight: string | null | undefined) {
  if (!teamNight) return true;
  const nights = readPlayerPoolStringArray(value);
  return nights.length === 0 || nights.includes("ANY") || nights.includes(teamNight);
}

function requestStatusCopy(status: string | null) {
  switch (status) {
    case "REQUESTED":
      return "Introduction requested";
    case "INTRODUCED":
      return "Introduction arranged";
    case "DECLINED":
      return "Introduction declined";
    case "CLOSED":
      return "Request closed";
    default:
      return null;
  }
}

function savedMessage(saved?: string) {
  if (saved === "request-sent") {
    return "Introduction requested. SIXFL will contact the player before sharing any details.";
  }
  if (saved === "request-already-sent") {
    return "You have already requested an introduction to that player.";
  }
  return null;
}

export default async function CaptainPlayerPoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: SearchParams;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  await ensurePlayerPoolTables();

  const query: { saved?: string; error?: string } = searchParams
    ? await searchParams
    : {};

  const [team, rows] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: {
          select: {
            name: true,
            area: true,
            dayOfWeek: true,
          },
        },
      },
    }),
    prisma.$queryRaw<ProfileRow[]>`
      SELECT
        profile."id" AS "profileId",
        profile."publicCode",
        profile."area",
        profile."leagueId",
        profile."preferredPosition",
        profile."status" AS "profileStatus",
        prospect."ageBand",
        prospect."preferredPositions",
        prospect."experienceSummary",
        prospect."availabilityLevel",
        prospect."preferredNights",
        prospect."availabilitySummary",
        request."id" AS "requestId",
        request."status" AS "requestStatus"
      FROM "PlayerPoolProfile" profile
      JOIN "TeamPlayerProspect" prospect ON prospect."id" = profile."prospectId"
      LEFT JOIN "PlayerPoolIntroductionRequest" request
        ON request."profileId" = profile."id"
       AND request."teamId" = ${teamid}
      WHERE profile."consentShareProfile" = true
        AND profile."consentContact" = true
        AND profile."profileSubmittedAt" IS NOT NULL
        AND (profile."status" = 'AVAILABLE' OR request."id" IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM "TeamPlayerProspect" squad_prospect
          WHERE squad_prospect."teamId" = ${teamid}
            AND squad_prospect."email" IS NOT NULL
            AND prospect."email" IS NOT NULL
            AND LOWER(TRIM(squad_prospect."email")) = LOWER(TRIM(prospect."email"))
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "TeamMember" squad_member
          JOIN "User" squad_user ON squad_user."id" = squad_member."userId"
          WHERE squad_member."teamId" = ${teamid}
            AND squad_user."email" IS NOT NULL
            AND prospect."email" IS NOT NULL
            AND LOWER(TRIM(squad_user."email")) = LOWER(TRIM(prospect."email"))
        )
      ORDER BY profile."profileSubmittedAt" DESC
    `,
  ]);

  if (!team) notFound();

  const teamArea = team.league?.area?.trim().toLowerCase() || "";
  const teamNight = team.league?.dayOfWeek || null;

  const profiles = rows.filter((profile) => {
    const areaMatches =
      !teamArea ||
      profile.leagueId === team.leagueId ||
      profile.area?.trim().toLowerCase() === teamArea;
    const nightMatches = matchesNight(profile.preferredNights, teamNight);
    return areaMatches && nightMatches;
  });

  const notice = savedMessage(query.saved);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Available players for {team.name}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">
          These players are looking for a SIXFL team and match your league area or playing night. Profiles are anonymised: names, email addresses and mobile numbers stay private until the player agrees to an introduction.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70">
            {team.league?.name || "Your league"}
          </span>
          {team.league?.dayOfWeek ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70">
              {team.league.dayOfWeek.charAt(0) + team.league.dayOfWeek.slice(1).toLowerCase()}
            </span>
          ) : null}
          {team.league?.area ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70">
              {team.league.area}
            </span>
          ) : null}
        </div>
      </section>

      {notice ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
          {notice}
        </section>
      ) : null}
      {query.error ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
          {query.error}
        </section>
      ) : null}

      {profiles.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
          <h2 className="text-xl font-bold text-white">No matching players are available right now</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-white/55">
            PlayerPool updates automatically as new players complete their profiles. SIXFL will also continue recruiting individual players for local leagues.
          </p>
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {profiles.map((profile) => {
            const statusLabel = requestStatusCopy(profile.requestStatus);
            const requestOpen = profile.requestStatus === "REQUESTED";
            const introduced = profile.requestStatus === "INTRODUCED";

            return (
              <article
                key={profile.profileId}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
                      Available player
                    </p>
                    <h2 className="mt-2 font-mono text-xl font-black text-white">
                      {profile.publicCode}
                    </h2>
                  </div>
                  {statusLabel ? (
                    <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                      introduced
                        ? "border-sky-400/25 bg-sky-500/10 text-sky-100"
                        : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                    }`}>
                      {statusLabel}
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-100">
                      Available
                    </span>
                  )}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Age group", profile.ageBand],
                    ["Can play", profile.preferredPositions],
                    ["Preferred position", profile.preferredPosition],
                    ["Football experience", profile.experienceSummary],
                    ["Usual availability", profile.availabilityLevel],
                    ["Available nights", formatNights(profile.preferredNights)],
                    ["Area", profile.area],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                        {label}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-white/75">{value || "Not specified"}</div>
                    </div>
                  ))}
                </div>

                {profile.availabilitySummary ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/65">
                    <span className="font-semibold text-white/80">Player notes:</span>{" "}
                    {profile.availabilitySummary}
                  </div>
                ) : null}

                <div className="mt-5 border-t border-white/10 pt-5">
                  {requestOpen || introduced ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/60">
                      {introduced
                        ? "SIXFL has arranged this introduction. The player now appears in your team prospects area."
                        : "SIXFL is checking with the player. Their contact details have not been shared yet."}
                    </div>
                  ) : (
                    <form action={requestPlayerPoolIntroductionAction} className="space-y-3">
                      <input type="hidden" name="teamid" value={teamid} />
                      <input type="hidden" name="profileId" value={profile.profileId} />
                      <label className="block space-y-2 text-sm font-semibold text-white/75">
                        <span>Optional message to SIXFL</span>
                        <textarea
                          name="captainMessage"
                          rows={2}
                          maxLength={500}
                          placeholder="For example: We need a defender most Wednesdays and would like to offer a trial."
                          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
                        />
                      </label>
                      <button
                        type="submit"
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-400"
                      >
                        Request an introduction
                      </button>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
