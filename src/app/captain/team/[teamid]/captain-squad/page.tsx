// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/page.tsx
// ========================================

import { randomUUID } from "crypto";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { sendDashboardLoginEmail } from "@/lib/auth/sendDashboardLoginEmail";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Squad | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

type WhatsappPreferenceRow = {
  id: string;
  usesWhatsapp: boolean | null;
};

type ContributionRow = {
  name: string;
  goals: number;
  assists: number;
  teamMemberId?: string;
};

type PlayerStats = {
  goals: number;
  assists: number;
  playerOfMatchAwards: number;
};

function pluralise(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "Captain";
    case "MANAGER":
      return "Manager";
    case "VICE_CAPTAIN":
      return "Vice captain";
    case "BACKUP_PLAYER":
      return "Backup player";
    case "COACH":
      return "Coach";
    case "PLAYER":
      return "Player";
    default:
      return role;
  }
}

function getRoleBadgeClasses(role: TeamRole) {
  switch (role) {
    case "CAPTAIN":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "MANAGER":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "VICE_CAPTAIN":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "BACKUP_PLAYER":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "COACH":
      return "border-white/15 bg-white/5 text-white/80";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function getInitials(name: string | null | undefined) {
  const parts = (name || "Player")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

function formatUkDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPreferredNights(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || null;

  if (typeof value === "object") {
    return (
      Object.values(value as Record<string, unknown>)
        .flat()
        .filter(Boolean)
        .map(String)
        .join(", ") || null
    );
  }

  return String(value);
}

function formatAvailabilitySummary(value: string | null | undefined) {
  const cleaned = value?.replace(/^\s*availability\s*:\s*/i, "").trim();
  return cleaned || null;
}

function normalisePlayerName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseStoredContributions(value: unknown): ContributionRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ContributionRow | null => {
      if (!item || typeof item !== "object") return null;

      const row = item as Partial<ContributionRow>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const goals = Number(row.goals ?? 0);
      const assists = Number(row.assists ?? 0);

      if (
        !name ||
        !Number.isInteger(goals) ||
        goals < 0 ||
        !Number.isInteger(assists) ||
        assists < 0 ||
        goals + assists < 1
      ) {
        return null;
      }

      const contribution: ContributionRow = { name, goals, assists };

      if (typeof row.teamMemberId === "string" && row.teamMemberId.trim()) {
        contribution.teamMemberId = row.teamMemberId;
      }

      return contribution;
    })
    .filter((item): item is ContributionRow => item !== null);
}

function emptyPlayerStats(): PlayerStats {
  return { goals: 0, assists: 0, playerOfMatchAwards: 0 };
}

function getWhatsAppUrl(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;

  const normalized = digits.startsWith("44")
    ? digits
    : digits.startsWith("0")
      ? `44${digits.slice(1)}`
      : digits.length === 10
        ? `44${digits}`
        : digits;

  return `https://wa.me/${normalized}`;
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "player-added":
      return "Player added to your squad.";
    case "login-email-sent":
      return "Dashboard sign-in email sent to the player.";
    default:
      return saved ? "Saved." : null;
  }
}

function DetailPill({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;

  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      <span className="text-white/40">{label}:</span>
      <span className="ml-1 text-white/80">{value}</span>
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100/85">
      <span className="font-semibold text-emerald-100">{value}</span>
      <span className="ml-1 text-emerald-100/65">{label}</span>
    </span>
  );
}

function WhatsAppLink({ href, playerName }: { href: string; playerName: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`WhatsApp ${playerName}`}
      aria-label={`WhatsApp ${playerName}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 transition hover:bg-emerald-500/25"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-4 w-4 fill-current">
        <path d="M16.04 3.2A12.68 12.68 0 0 0 5.15 22.4L3.6 28.8l6.55-1.52A12.67 12.67 0 1 0 16.04 3.2Zm0 2.24a10.43 10.43 0 0 1 8.86 15.95 10.42 10.42 0 0 1-13.95 3.7l-.47-.24-3.9.9.92-3.78-.27-.49A10.43 10.43 0 0 1 16.04 5.44Zm-4.2 5.22c-.24 0-.62.09-.94.44-.33.36-1.24 1.22-1.24 2.96 0 1.75 1.27 3.44 1.45 3.68.18.24 2.46 3.94 6.06 5.36 3 .95 3.61.76 4.26.71.65-.05 2.08-.85 2.38-1.68.29-.82.29-1.53.2-1.68-.08-.15-.32-.24-.67-.42-.35-.17-2.08-1.03-2.4-1.15-.32-.12-.56-.18-.8.18-.23.35-.91 1.15-1.12 1.39-.2.24-.41.27-.76.09-.35-.17-1.48-.55-2.82-1.74-1.04-.93-1.74-2.08-1.95-2.43-.2-.35-.02-.54.16-.72.16-.16.35-.42.53-.62.18-.2.24-.35.36-.59.12-.24.06-.44-.03-.62-.09-.17-.78-1.9-1.08-2.6-.28-.68-.57-.59-.8-.6h-.65Z" />
      </svg>
    </a>
  );
}

function MetricCard({
  label,
  value,
  copy,
  tone,
}: {
  label: string;
  value: number;
  copy: string;
  tone: "emerald" | "amber" | "white" | "sky";
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-400/20 bg-amber-500/10 text-amber-100/70"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100/70"
          : "border-white/10 bg-white/5 text-white/55";

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/65">{copy}</p>
    </div>
  );
}

async function addCaptainPlayerAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const usesWhatsapp = formData.get("usesWhatsapp") === "on";

  await requireCaptain(teamid);

  if (!teamid) redirect("/captain");
  if (!displayName) {
    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Enter the player name.")}`);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, teamMode: true },
  });

  if (!team) {
    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Team not found.")}`);
  }

  if (team.teamMode === "MANAGED") {
    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("SIXFL manages player additions for managed teams.")}`);
  }

  let user = email
    ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
    : null;

  if (user) {
    const existingMember = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId: teamid } },
      select: { id: true },
    });

    if (existingMember) {
      redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("That player is already in your squad.")}`);
    }
  }

  if (!user) {
    user = await prisma.user.create({
      data: { name: displayName, email },
      select: { id: true },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { name: displayName } });
  }

  await prisma.$executeRaw`
    UPDATE "User"
    SET "usesWhatsapp" = ${usesWhatsapp}
    WHERE id = ${user.id}
  `;

  const member = await prisma.teamMember.create({
    data: { teamId: teamid, userId: user.id, role: "PLAYER" },
    select: { id: true },
  });

  if (phone) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TeamMemberProfile" ("id", "teamMemberId", "phone", "updatedAt") VALUES ($1, $2, $3, NOW()) ON CONFLICT ("teamMemberId") DO UPDATE SET "phone" = EXCLUDED."phone", "updatedAt" = NOW()`,
      randomUUID(),
      member.id,
      phone,
    );
  }

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  revalidatePath(`/captain/team/${teamid}/squad`);
  revalidatePath(`/captain/team/${teamid}/results`);
  redirect(`/captain/team/${teamid}/captain-squad?saved=player-added`);
}

async function sendCaptainPlayerDashboardLoginEmailAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();

  await requireCaptain(teamid);

  if (!teamid || !membershipId) {
    redirect("/captain");
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      id: membershipId,
      teamId: teamid,
    },
    select: {
      id: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      team: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!membership) {
    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Player not found in this squad.")}`);
  }

  const email = membership.user.email?.trim().toLowerCase() ?? "";

  if (!email) {
    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("This player does not have an email address saved.")}`);
  }

  await sendDashboardLoginEmail({
    email,
    displayName: membership.user.name,
    teamName: membership.team.name,
    callbackPath: `/player/team/${teamid}`,
  });

  revalidatePath(`/captain/team/${teamid}/captain-squad`);
  redirect(`/captain/team/${teamid}/captain-squad?saved=login-email-sent`);
}

function DashboardLoginEmailButton({
  teamid,
  membershipId,
  email,
}: {
  teamid: string;
  membershipId: string;
  email: string | null;
}) {
  const hasEmail = Boolean(email?.trim());

  if (!hasEmail) {
    return (
      <span className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center text-sm font-medium text-white/40">
        No email saved
      </span>
    );
  }

  return (
    <form action={sendCaptainPlayerDashboardLoginEmailAction}>
      <input type="hidden" name="teamid" value={teamid} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-center text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
      >
        Send login email
      </button>
    </form>
  );
}

export default async function CaptainSquadViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;

  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      league: { select: { id: true, name: true, season: true } },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const canCaptainAddPlayers = team.teamMode !== "MANAGED";
  const userIds = team.members.map((member) => member.user.id);

  const [profileByMemberId, whatsappRows, matchDetails] = await Promise.all([
    getTeamMemberProfilesByTeamMemberIds(team.members.map((member) => member.id)),
    userIds.length > 0
      ? prisma.$queryRaw<WhatsappPreferenceRow[]>`
          SELECT id, "usesWhatsapp"
          FROM "User"
          WHERE id = ANY(${userIds})
        `
      : Promise.resolve([] as WhatsappPreferenceRow[]),
    prisma.matchResultTeamMeta.findMany({
      where: { teamId: teamid },
      select: { scorers: true, playerOfMatchName: true },
    }),
  ]);

  const usesWhatsappByUserId = new Map(
    whatsappRows.map((row) => [row.id, Boolean(row.usesWhatsapp)]),
  );
  const memberIdByPlayerName = new Map(
    team.members.map((member) => [normalisePlayerName(member.user.name), member.id]),
  );
  const statsByMemberId = new Map<string, PlayerStats>();

  team.members.forEach((member) => statsByMemberId.set(member.id, emptyPlayerStats()));

  matchDetails.forEach((details) => {
    parseStoredContributions(details.scorers).forEach((contribution) => {
      const memberId = contribution.teamMemberId || memberIdByPlayerName.get(normalisePlayerName(contribution.name));
      if (!memberId) return;

      const stats = statsByMemberId.get(memberId) ?? emptyPlayerStats();
      stats.goals += contribution.goals;
      stats.assists += contribution.assists;
      statsByMemberId.set(memberId, stats);
    });

    const playerOfMatchMemberId = memberIdByPlayerName.get(
      normalisePlayerName(details.playerOfMatchName),
    );

    if (playerOfMatchMemberId) {
      const stats = statsByMemberId.get(playerOfMatchMemberId) ?? emptyPlayerStats();
      stats.playerOfMatchAwards += 1;
      statsByMemberId.set(playerOfMatchMemberId, stats);
    }
  });

  const organiserCount = team.members.filter((member) =>
    ["CAPTAIN", "MANAGER", "VICE_CAPTAIN"].includes(member.role),
  ).length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const backupCount = team.members.filter((member) => member.role === "BACKUP_PLAYER").length;
  const totalSquadCount = team.members.length;
  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Your team
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your squad
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              View your players, update contact details and quickly open the tools you need for matchdays.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {totalSquadCount} player{totalSquadCount === 1 ? "" : "s"} in your squad
              </span>
              {canCaptainAddPlayers ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
                  Standard team
                </span>
              ) : (
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                  SIXFL-managed team
                </span>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/captain/team/${teamid}`}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Back to overview
              </Link>
              <Link
                href={`/captain/team/${teamid}/availability`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Open availability
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <MetricCard label="Your squad" value={totalSquadCount} copy="Players currently attached to your team." tone="emerald" />
            <MetricCard label="Organisers" value={organiserCount} copy="Captain and support roles for your team." tone="amber" />
            <MetricCard label="Players" value={playerCount} copy="Regular players in your squad." tone="white" />
            <MetricCard label="Backups" value={backupCount} copy="Backup players available if needed." tone="sky" />
          </div>
        </div>
      </section>

      {savedMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Your squad
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Players</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
              {team.members.length} player{team.members.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {team.members.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No players are attached to your team yet.
              </div>
            ) : null}

            {team.members.map((member) => {
              const profile = profileByMemberId.get(member.id);
              const preferredNights = formatPreferredNights(profile?.preferredNights);
              const availabilitySummary = formatAvailabilitySummary(profile?.availabilitySummary);
              const playerUsesWhatsapp = usesWhatsappByUserId.get(member.user.id) === true;
              const whatsAppUrl = playerUsesWhatsapp ? getWhatsAppUrl(profile?.phone) : null;
              const playerName = member.user.name || "player";
              const playerStats = statsByMemberId.get(member.id) ?? emptyPlayerStats();
              const hasPublicProfileDetails = Boolean(
                profile?.ageBand ||
                  profile?.preferredPositions ||
                  profile?.experienceSummary ||
                  profile?.availabilityLevel ||
                  preferredNights ||
                  availabilitySummary,
              );

              return (
                <div key={member.id} className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                      {getInitials(member.user.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold text-white">
                          {member.user.name || "Unnamed player"}
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>
                          {getRoleLabel(member.role)}
                        </span>
                        {whatsAppUrl ? <WhatsAppLink href={whatsAppUrl} playerName={playerName} /> : null}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Added {formatUkDate(member.createdAt)}
                        {member.user.email ? ` · ${member.user.email}` : " · No email saved"}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatPill label={pluralise(playerStats.goals, "goal", "goals")} value={playerStats.goals} />
                        <StatPill label={pluralise(playerStats.assists, "assist", "assists")} value={playerStats.assists} />
                        <StatPill label="Player of the Match" value={playerStats.playerOfMatchAwards} />
                      </div>
                      {hasPublicProfileDetails ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <DetailPill label="Age" value={profile?.ageBand} />
                            <DetailPill label="Position" value={profile?.preferredPositions} />
                            <DetailPill label="Level" value={profile?.experienceSummary} />
                            <DetailPill label="Availability" value={profile?.availabilityLevel} />
                            <DetailPill label="Nights" value={preferredNights} />
                          </div>
                          {availabilitySummary ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/60">
                              <span className="font-semibold text-white/70">Availability notes:</span> {availabilitySummary}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
                          No availability details saved yet.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:w-72 xl:justify-end">
                    <Link
                      href={`/captain/team/${teamid}/squad/${member.id}/edit`}
                      className="inline-flex items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
                    >
                      Edit player
                    </Link>
                    <DashboardLoginEmailButton
                      teamid={teamid}
                      membershipId={member.id}
                      email={member.user.email}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {canCaptainAddPlayers ? (
            <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.04] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">
                Add player
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Add a player to your squad</h2>
              <p className="mt-2 text-sm text-white/60">
                Add a basic player record now so they can be picked for goals, assists and Player of the Match. Add an email if you want to send a dashboard login link.
              </p>
              <form action={addCaptainPlayerAction} className="mt-5 space-y-4">
                <input type="hidden" name="teamid" value={teamid} />
                <label className="block space-y-2 text-sm text-white/65">
                  <span>Player name</span>
                  <input
                    name="displayName"
                    required
                    placeholder="e.g. Tom Smith"
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                  />
                </label>
                <label className="block space-y-2 text-sm text-white/65">
                  <span>Email optional</span>
                  <input
                    name="email"
                    type="email"
                    placeholder="player@example.com"
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                  />
                </label>
                <label className="block space-y-2 text-sm text-white/65">
                  <span>Phone optional</span>
                  <input
                    name="phone"
                    placeholder="Mobile number"
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" name="usesWhatsapp" />
                  Show WhatsApp icon if a phone number is saved
                </label>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
                >
                  Add player
                </button>
              </form>
            </section>
          ) : null}

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Matchday tools
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Manage your team</h2>
            <div className="mt-4 space-y-3 text-sm text-white/65">
              <p>Use this page to check your squad and edit player contact details.</p>
              <p>For each fixture, use availability to see who can play and matchday squad to confirm who actually played.</p>
              <p>
                {canCaptainAddPlayers
                  ? "Need a player removed? Message SIXFL and we will update it for you."
                  : "For managed teams, SIXFL still controls squad additions, but captains can update player contact details."}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Quick actions
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link href={`/captain/team/${teamid}/availability`} className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                Manage availability
              </Link>
              <Link href={`/captain/team/${teamid}/match-fees`} className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                Open matchday squad
              </Link>
              <Link href={`/captain/team/${teamid}/fixtures`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
                Open fixtures
              </Link>
              <Link href={`/captain/team/${teamid}/results`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
                Open results
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
