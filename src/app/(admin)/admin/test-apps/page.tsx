import Link from "next/link";
import { TeamMode, TeamRole, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Test apps | SIXFL Admin",
};

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasNamePart(value: string | null | undefined, name: string) {
  return normalise(value).split(" ").includes(normalise(name));
}

function leagueLabel(input: {
  league: { name: string; season: string | null } | null;
}) {
  if (!input.league) return "No league assigned";
  return input.league.season
    ? `${input.league.name} · ${input.league.season}`
    : input.league.name;
}

type TestAppCardProps = {
  eyebrow: string;
  title: string;
  detail: string;
  href: string | null;
  unavailableText: string;
  badge: string;
};

function TestAppCard({
  eyebrow,
  title,
  detail,
  href,
  unavailableText,
  badge,
}: TestAppCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">{detail}</p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-lg font-black text-emerald-200"
        >
          {badge}
        </span>
      </div>

      <div className="mt-5 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <span className={href ? "text-sm font-bold text-white" : "text-sm font-semibold text-amber-100"}>
          {href ? "Open test app" : unavailableText}
        </span>
        <span aria-hidden="true" className={href ? "text-emerald-300" : "text-amber-200/60"}>
          {href ? "›" : "!"}
        </span>
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-[1.6rem] border border-amber-400/15 bg-amber-500/[0.05] p-5 opacity-85">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-5 transition hover:border-emerald-400/25 hover:bg-emerald-500/[0.05] active:scale-[0.995]"
    >
      {content}
    </Link>
  );
}

export default async function AdminTestAppsPage() {
  await requireAdmin();

  const [teams, referees] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        teamMode: true,
        league: {
          select: {
            name: true,
            season: true,
            isActive: true,
          },
        },
        members: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            role: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: UserRole.REFEREE },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
  ]);

  const kebabTeams = teams.filter((team) => normalise(team.name).includes("kebab"));
  const kebabTeam =
    kebabTeams.find(
      (team) =>
        team.league?.isActive &&
        team.teamMode !== TeamMode.MANAGED &&
        team.members.some(
          (member) =>
            member.role === TeamRole.CAPTAIN &&
            hasNamePart(member.user.name, "hakan"),
        ),
    ) ??
    kebabTeams.find(
      (team) =>
        team.teamMode !== TeamMode.MANAGED &&
        team.members.some(
          (member) =>
            member.role === TeamRole.CAPTAIN &&
            hasNamePart(member.user.name, "hakan"),
        ),
    ) ??
    null;

  const hakanCaptain = kebabTeam?.members.find(
    (member) =>
      member.role === TeamRole.CAPTAIN &&
      hasNamePart(member.user.name, "hakan"),
  ) ?? null;

  const finnMemberships = teams.flatMap((team) =>
    team.members
      .filter((member) => normalise(member.user.name) === "finn mcintosh")
      .map((member) => ({ member, team })),
  );
  const finn =
    finnMemberships.find(({ team }) => team.league?.isActive) ??
    finnMemberships[0] ??
    null;

  const stefanCandidates = referees.filter((referee) =>
    hasNamePart(referee.name, "stefan"),
  );
  const stefan =
    stefanCandidates.find((referee) => normalise(referee.name) === "stefan") ??
    (stefanCandidates.length === 1 ? stefanCandidates[0] : null);

  const captainHref =
    kebabTeam && hakanCaptain
      ? `/admin/teams/${kebabTeam.id}/captain-preview`
      : null;
  const playerHref = finn
    ? `/player/team/${finn.team.id}?previewMembershipId=${encodeURIComponent(finn.member.id)}&pwaPreview=1`
    : null;
  const refereeHref = stefan
    ? `/admin/referees/${stefan.id}/referee-preview?to=${encodeURIComponent("/referee?pwaPreview=1")}`
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-5 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
            Test apps
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            Fixed test accounts for checking the real Captain, Player and Referee apps. No picker needed.
          </p>
        </div>
        <Link
          href="/admin"
          className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/60"
        >
          Admin home
        </Link>
      </div>

      <div className="grid gap-3">
        <TestAppCard
          eyebrow="Captain app"
          title="Kebab · Hakan"
          detail={
            kebabTeam
              ? `${kebabTeam.name} · ${leagueLabel(kebabTeam)}`
              : "Fixed captain test account"
          }
          href={captainHref}
          unavailableText="Kebab with Hakan as captain was not found"
          badge="C"
        />

        <TestAppCard
          eyebrow="Player app"
          title="Finn McIntosh"
          detail={
            finn
              ? `${finn.team.name} · ${leagueLabel(finn.team)}`
              : "Fixed player test account"
          }
          href={playerHref}
          unavailableText="Finn McIntosh was not found in a squad"
          badge="P"
        />

        <TestAppCard
          eyebrow="Referee app"
          title={stefan?.name?.trim() || "Stefan"}
          detail={
            stefan?.email?.trim() || "Fixed referee test account"
          }
          href={refereeHref}
          unavailableText={
            stefanCandidates.length > 1
              ? "More than one Stefan referee was found"
              : "Stefan was not found as a referee"
          }
          badge="R"
        />
      </div>

      <p className="mt-5 text-center text-xs leading-5 text-white/35">
        These links are admin-only and use the existing SIXFL preview access. They do not change the real user&apos;s login.
      </p>
    </div>
  );
}
