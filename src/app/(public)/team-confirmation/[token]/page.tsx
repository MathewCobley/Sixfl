// ========================================
// File: src/app/(public)/team-confirmation/[token]/page.tsx
// ========================================

import { LeadStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  confirmTeamPlaceFromLead,
  declineTeamPlaceFromLead,
  getTeamPlaceConfirmationStatus,
  verifyTeamPlaceConfirmationToken,
} from "@/lib/leads/teamPlaceConfirmation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Confirm Your Team | SIXFL",
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{
    confirmed?: string;
    declined?: string;
    commitmentSaved?: string;
    teamNameSaved?: string;
    teamNameError?: string;
    squadError?: string;
  }>;
};

type LeagueConfirmationDetails = {
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
};

const SQUAD_SIZE_LABELS = {
  "6": "6 players",
  "7": "7 players",
  "8": "8 players",
  "9+": "9 or more players",
  building: "still putting the squad together",
} as const;

type SquadSizeValue = keyof typeof SQUAD_SIZE_LABELS;

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function formatNoteDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

function formatPreferredNight(value: string | null | undefined) {
  if (!value || value === "ANY") return null;
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatCurrencyPence(value: number | null) {
  if (value === null) return null;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

function formatVenue(value: string | null | undefined) {
  const venue = value?.trim();
  if (!venue || venue.toUpperCase() === "TBC") return null;
  return venue;
}

function parseTeamName(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function isSquadSizeValue(value: string): value is SquadSizeValue {
  return Object.prototype.hasOwnProperty.call(SQUAD_SIZE_LABELS, value);
}

function confirmationPath(token: string, query: string) {
  return `/team-confirmation/${encodeURIComponent(token)}?${query}`;
}

async function getLeagueConfirmationDetails(leagueId: string | null | undefined) {
  if (!leagueId) return null;

  const rows = await prisma.$queryRaw<LeagueConfirmationDetails[]>(Prisma.sql`
    SELECT
      "proposedStartDate" AS "proposedStartDate",
      "minutesPerGame"::int AS "minutesPerGame",
      "costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence"
    FROM "League"
    WHERE "id" = ${leagueId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function confirmTeamCommitmentAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const leadId = verifyTeamPlaceConfirmationToken(token);
  if (!leadId) throw new Error("This confirmation link is not valid.");

  const teamNameInput = parseTeamName(formData.get("teamName"));
  const squadSizeInput = String(formData.get("squadSize") ?? "").trim();

  if (teamNameInput && (teamNameInput.length < 2 || teamNameInput.length > 80)) {
    redirect(confirmationPath(token, "teamNameError=invalid"));
  }

  if (!isSquadSizeValue(squadSizeInput)) {
    redirect(confirmationPath(token, "squadError=invalid"));
  }

  const [lead, confirmation] = await Promise.all([
    prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        interestType: true,
        status: true,
        convertedTeamId: true,
        teamName: true,
        message: true,
      },
    }),
    getTeamPlaceConfirmationStatus(leadId),
  ]);

  if (!lead) throw new Error("Lead not found.");
  if (lead.interestType !== "TEAM") {
    throw new Error("This link is not for a team enquiry.");
  }
  if (lead.convertedTeamId) {
    redirect(confirmationPath(token, "confirmed=1"));
  }
  if (lead.status === LeadStatus.CLOSED || confirmation?.status === "DECLINED") {
    redirect(confirmationPath(token, "declined=1"));
  }

  const wasAlreadyConfirmed =
    confirmation?.status === "CONFIRMED" || lead.status === LeadStatus.QUALIFIED;

  if (!wasAlreadyConfirmed) {
    await confirmTeamPlaceFromLead(lead.id);
  }

  const effectiveTeamName = teamNameInput || lead.teamName?.trim() || "not decided yet";
  const commitmentNote = [
    `Team commitment confirmed via secure link (${formatNoteDate(new Date())}).`,
    `Team name: ${effectiveTeamName}.`,
    `Approximate squad: ${SQUAD_SIZE_LABELS[squadSizeInput]}.`,
  ].join(" ");

  await prisma.interestLead.update({
    where: { id: lead.id },
    data: {
      ...(teamNameInput ? { teamName: teamNameInput } : {}),
      ...(!wasAlreadyConfirmed
        ? {
            message: lead.message?.trim()
              ? `${lead.message.trim()}\n\n${commitmentNote}`
              : commitmentNote,
          }
        : {}),
    },
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath(`/team-confirmation/${encodeURIComponent(token)}`);
  redirect(confirmationPath(token, "confirmed=1&commitmentSaved=1"));
}

async function declineTeamAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const leadId = verifyTeamPlaceConfirmationToken(token);
  if (!leadId) throw new Error("This confirmation link is not valid.");

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: { id: true, interestType: true, convertedTeamId: true },
  });

  if (!lead) throw new Error("Lead not found.");
  if (lead.interestType !== "TEAM") throw new Error("This link is not for a team enquiry.");
  if (lead.convertedTeamId) redirect(confirmationPath(token, "confirmed=1"));

  await declineTeamPlaceFromLead(lead.id);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath(`/team-confirmation/${encodeURIComponent(token)}`);
  redirect(confirmationPath(token, "declined=1"));
}

async function saveTeamNameAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();
  const leadId = verifyTeamPlaceConfirmationToken(token);
  const teamName = parseTeamName(formData.get("teamName"));

  if (!leadId) throw new Error("This confirmation link is not valid.");
  if (teamName.length < 2 || teamName.length > 80) {
    redirect(confirmationPath(token, "confirmed=1&teamNameError=invalid"));
  }

  const [lead, confirmation] = await Promise.all([
    prisma.interestLead.findUnique({
      where: { id: leadId },
      select: { id: true, interestType: true, convertedTeamId: true, status: true },
    }),
    getTeamPlaceConfirmationStatus(leadId),
  ]);

  if (!lead) throw new Error("Lead not found.");
  if (lead.interestType !== "TEAM") throw new Error("This link is not for a team enquiry.");
  if (lead.convertedTeamId) redirect(confirmationPath(token, "confirmed=1"));

  const isConfirmed =
    confirmation?.status === "CONFIRMED" || lead.status === LeadStatus.QUALIFIED;
  if (!isConfirmed) throw new Error("Confirm that you want to enter a team first.");

  await prisma.interestLead.update({
    where: { id: lead.id },
    data: { teamName },
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath(`/team-confirmation/${encodeURIComponent(token)}`);
  redirect(confirmationPath(token, "confirmed=1&teamNameSaved=1"));
}

function InvalidLinkCard() {
  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <section className="mx-auto max-w-2xl rounded-3xl border border-red-400/20 bg-red-500/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/80">
          SIXFL team decision
        </p>
        <h1 className="mt-3 text-2xl font-semibold">This link is not valid</h1>
        <p className="mt-3 text-sm leading-6 text-red-100/80">
          Please reply to SIXFL and we’ll send you a fresh link.
        </p>
      </section>
    </main>
  );
}

export default async function TeamConfirmationPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const leadId = verifyTeamPlaceConfirmationToken(token);
  if (!leadId) return <InvalidLinkCard />;

  const [lead, confirmation] = await Promise.all([
    prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        interestType: true,
        contactName: true,
        teamName: true,
        area: true,
        status: true,
        convertedTeamId: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            area: true,
            dayOfWeek: true,
            venueName: true,
            kickoffInfo: true,
            competition: {
              select: {
                currentLeague: {
                  select: {
                    id: true,
                    name: true,
                    season: true,
                    area: true,
                    dayOfWeek: true,
                    venueName: true,
                    kickoffInfo: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    getTeamPlaceConfirmationStatus(leadId),
  ]);

  if (!lead || lead.interestType !== "TEAM") return <InvalidLinkCard />;

  const effectiveLeague = lead.league?.competition?.currentLeague ?? lead.league;
  const leagueDetails = await getLeagueConfirmationDetails(effectiveLeague?.id);
  const leagueName = effectiveLeague
    ? `${effectiveLeague.name}${effectiveLeague.season ? ` · ${effectiveLeague.season}` : ""}`
    : lead.area
      ? `${lead.area} SIXFL league`
      : "your SIXFL league";

  const isConfirmed =
    sp.confirmed === "1" ||
    confirmation?.status === "CONFIRMED" ||
    lead.status === LeadStatus.QUALIFIED;
  const isDeclined =
    sp.declined === "1" ||
    confirmation?.status === "DECLINED" ||
    lead.status === LeadStatus.CLOSED;
  const savedTeamName = lead.teamName?.trim() || "";
  const firstName = lead.contactName?.trim().split(/\s+/)[0] || "there";
  const fee = formatCurrencyPence(leagueDetails?.costPerTeamPerMatchPence ?? null);
  const details = [
    formatPreferredNight(effectiveLeague?.dayOfWeek)
      ? `${formatPreferredNight(effectiveLeague?.dayOfWeek)} evenings`
      : null,
    formatVenue(effectiveLeague?.venueName) || effectiveLeague?.area?.trim() || lead.area?.trim(),
    effectiveLeague?.kickoffInfo?.trim() || null,
    leagueDetails?.proposedStartDate
      ? `Planned start ${formatLongDate(leagueDetails.proposedStartDate)}`
      : null,
    leagueDetails?.minutesPerGame ? `${leagueDetails.minutesPerGame} minute matches` : null,
    fee ? `${fee} per team per match` : null,
  ].filter((value): value is string => Boolean(value));

  const teamNameError =
    sp.teamNameError === "invalid"
      ? "Enter a team name between 2 and 80 characters, or leave it blank if it is not decided yet."
      : null;
  const squadError =
    sp.squadError === "invalid" ? "Please choose the option that best describes your squad." : null;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SIXFL team decision
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {isConfirmed
              ? lead.convertedTeamId
                ? "Your SIXFL team is set up"
                : "Your team commitment is recorded"
              : isDeclined
                ? "Thanks for letting us know"
                : `Hi ${firstName} — are you entering a team?`}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {isConfirmed
              ? lead.convertedTeamId
                ? `${savedTeamName || "Your team"} has already been set up for ${leagueName}.`
                : `SIXFL has recorded that you want to enter a team in ${leagueName}.`
              : isDeclined
                ? `We’ve recorded that you are not entering a team in ${leagueName}.`
                : `We already have your contact details from your enquiry. We only need your decision and a couple of useful team details.`}
          </p>

          {details.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {details.map((detail) => (
                <span
                  key={detail}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75"
                >
                  {detail}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          {isConfirmed ? (
            <div className="space-y-5">
              {sp.commitmentSaved === "1" ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
                  Thank you — your positive team decision has been sent to SIXFL. We have not asked you to repeat any contact details.
                </div>
              ) : null}

              {sp.teamNameSaved === "1" ? (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100">
                  Team name updated successfully.
                </div>
              ) : null}

              {lead.convertedTeamId ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/70">
                  SIXFL already has the details needed for this team. We’ll contact you with the next steps.
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <h2 className="text-lg font-semibold text-white">
                    {savedTeamName ? "Need to correct the team name?" : "Team name not decided yet?"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {savedTeamName
                      ? `We currently have “${savedTeamName}”. You can correct it below before SIXFL creates the team.`
                      : "That’s fine. Your commitment is already recorded and you can add the team name here when it is decided."}
                  </p>

                  {teamNameError ? (
                    <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {teamNameError}
                    </div>
                  ) : null}

                  <form action={saveTeamNameAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input type="hidden" name="token" value={token} />
                    <input
                      name="teamName"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={savedTeamName}
                      placeholder="e.g. Richmond Rovers"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                    >
                      {savedTeamName ? "Update team name" : "Save team name"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : isDeclined ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
                Your enquiry has been updated and SIXFL will not continue chasing you for a team decision.
              </div>
              <p className="text-sm leading-6 text-white/60">
                Changed your mind? Reply to the SIXFL email and we can reopen the enquiry.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white">What we need from you</h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  A clear yes or no, your team name if it is decided, and a rough idea of how many players you have. We do not need your name, email, phone number or area again.
                </p>
              </div>

              {(teamNameError || squadError) ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {teamNameError || squadError}
                </div>
              ) : null}

              <form action={confirmTeamCommitmentAction} className="space-y-5 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.05] p-5">
                <input type="hidden" name="token" value={token} />

                <label className="block">
                  <span className="text-sm font-semibold text-white/85">Team name</span>
                  <span className="mt-1 block text-xs leading-5 text-white/45">
                    Leave this blank if you have not decided it yet.
                  </span>
                  <input
                    name="teamName"
                    type="text"
                    minLength={2}
                    maxLength={80}
                    defaultValue={savedTeamName}
                    placeholder="e.g. Richmond Rovers"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-white/85">Roughly how many players do you have?</span>
                  <span className="mt-1 block text-xs leading-5 text-white/45">
                    This helps us understand how close your squad is. It does not limit the final squad size.
                  </span>
                  <select
                    name="squadSize"
                    defaultValue="building"
                    required
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1713] px-4 py-3 text-white outline-none transition focus:border-emerald-400/50"
                  >
                    <option value="building">Still putting the squad together</option>
                    <option value="6">6 players</option>
                    <option value="7">7 players</option>
                    <option value="8">8 players</option>
                    <option value="9+">9 or more players</option>
                  </select>
                </label>

                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/55">
                  Clicking yes tells SIXFL you intend to enter a team. There is no payment due now and there is no long-term contract tying your team in.
                </div>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(16,185,129,0.24)] transition hover:bg-emerald-500"
                >
                  YES — I WANT TO ENTER A TEAM
                </button>
              </form>

              <div className="border-t border-white/10 pt-5">
                <form action={declineTeamAction}>
                  <input type="hidden" name="token" value={token} />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08]"
                  >
                    No — I’m not entering a team
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>

        <div className="text-center text-xs text-white/40">
          <Link href="https://www.sixfl.co.uk" className="transition hover:text-white/70">
            SIXFL · 6-a-side football. Done properly.
          </Link>
        </div>
      </div>
    </main>
  );
}
