// ========================================
// File: src/app/captain/team/[teamid]/captain-squad/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

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
  error?: string;
};

type WhatsappPreferenceRow = {
  id: string;
  usesWhatsapp: boolean | null;
};

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
  const parts = (name || "Player").trim().split(/\s+/).filter(Boolean).slice(0, 2);
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

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || null;
  }

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

function DetailPill({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;

  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      <span className="text-white/40">{label}:</span>
      <span className="ml-1 text-white/80">{value}</span>
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

function MetricCard({ label, value, copy, tone }: { label: string; value: number; copy: string; tone: "emerald" | "amber" | "white" | "sky" }) {
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

export default async function CaptainSquadViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
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
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const userIds = team.members.map((member) => member.user.id);

  const [profileByMemberId, whatsappRows] = await Promise.all([
    getTeamMemberProfilesByTeamMemberIds(team.members.map((member) => member.id)),
    userIds.length > 0
      ? prisma.$queryRaw<WhatsappPreferenceRow[]>`
          SELECT id, "usesWhatsapp"
          FROM "User"
          WHERE id = ANY(${userIds})
        `
      : Promise.resolve([] as WhatsappPreferenceRow[]),
  ]);

  const usesWhatsappByUserId = new Map(
    whatsappRows.map((row) => [row.id, Boolean(row.usesWhatsapp)]),
  );

  const organiserCount = team.members.filter((member) =>
    ["CAPTAIN", "MANAGER", "VICE_CAPTAIN"].includes(member.role),
  ).length;
  const playerCount = team.members.filter((member) => member.role === "PLAYER").length;
  const backupCount = team.members.filter((member) => member.role === "BACKUP_PLAYER").length;
  const totalSquadCount = team.members.length;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Captain squad view
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Team squad
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              A captain-safe view of your linked squad. You can see who is attached to the team and check public profile details, but player records, role changes, activation messages and internal notes stay with SIXFL admin.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.league?.name ?? "No league assigned"}
                {team.league?.season ? ` · ${team.league.season}` : ""}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {totalSquadCount} linked squad player{totalSquadCount === 1 ? "" : "s"}
              </span>
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
              {access.isAdmin ? (
                <Link
                  href={`/admin/teams/${teamid}/squad`}
                  className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
                >
                  Open admin squad console
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <MetricCard label="Total squad" value={totalSquadCount} copy="Linked players attached to this team." tone="emerald" />
            <MetricCard label="Organisers" value={organiserCount} copy="Captain, manager and vice-captain roles." tone="amber" />
            <MetricCard label="Players" value={playerCount} copy="Regular linked player roles." tone="white" />
            <MetricCard label="Backups" value={backupCount} copy="Backup player roles." tone="sky" />
          </div>
        </div>
      </section>

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
                Current squad
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Players and roles</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/70">
              {team.members.length} linked
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {team.members.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No linked squad members are attached to this team yet.
              </div>
            ) : null}

            {team.members.map((member) => {
              const profile = profileByMemberId.get(member.id);
              const preferredNights = formatPreferredNights(profile?.preferredNights);
              const playerUsesWhatsapp = usesWhatsappByUserId.get(member.user.id) === true;
              const whatsAppUrl = playerUsesWhatsapp ? getWhatsAppUrl(profile?.phone) : null;
              const playerName = member.user.name || "player";
              const hasPublicProfileDetails = Boolean(
                profile?.ageBand ||
                  profile?.preferredPositions ||
                  profile?.experienceSummary ||
                  profile?.availabilityLevel ||
                  preferredNights ||
                  profile?.availabilitySummary,
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
                        {whatsAppUrl ? (
                          <WhatsAppLink href={whatsAppUrl} playerName={playerName} />
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Added {formatUkDate(member.createdAt)}
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

                          {profile?.availabilitySummary ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/60">
                              <span className="font-semibold text-white/70">Availability:</span> {profile.availabilitySummary}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
                          No public squad profile details saved yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Captain limits
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">What you can do here</h2>
            <div className="mt-4 space-y-3 text-sm text-white/65">
              <p>This view is intentionally lighter than the SIXFL admin console.</p>
              <p>You can review the squad, check public availability details and use the availability page to manage matchday responses.</p>
              <p>Only SIXFL admin can edit player records, change roles, remove players, send activation messages or view internal notes.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Quick actions
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href={`/captain/team/${teamid}/availability`}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Manage availability
              </Link>
              <Link
                href={`/captain/team/${teamid}/fixtures`}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open fixtures
              </Link>
              <Link
                href={`/captain/team/${teamid}/results`}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open results
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
