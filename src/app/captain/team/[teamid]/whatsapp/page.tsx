// ========================================
// File: src/app/captain/team/[teamid]/whatsapp/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { normalizePhoneNumber } from "@/lib/messaging/phone";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain WhatsApp | SIXFL",
};

type FixtureRow = {
  id: string;
  kickoffAt: Date;
  pitch: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  venue: { name: string } | null;
  availabilities: Array<{
    teamMemberId: string;
    response: string;
  }>;
};

type WhatsAppTemplate = {
  title: string;
  eyebrow: string;
  description: string;
  message: string;
  tone: "emerald" | "sky" | "amber" | "white";
};

type WhatsappPreferenceRow = {
  id: string;
  usesWhatsapp: boolean | null;
};

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRoleLabel(role: TeamRole) {
  switch (role) {
    case TeamRole.CAPTAIN:
      return "Captain";
    case TeamRole.MANAGER:
      return "Manager";
    case TeamRole.VICE_CAPTAIN:
      return "Vice captain";
    case TeamRole.BACKUP_PLAYER:
      return "Backup player";
    case TeamRole.COACH:
      return "Coach";
    case TeamRole.PLAYER:
      return "Player";
    default:
      return role;
  }
}

function getPlayerDisplayName(input: { name: string | null; email: string | null }) {
  return input.name?.trim() || input.email?.trim() || "Player";
}

function getWhatsAppNumber(value: string | null | undefined) {
  return normalizePhoneNumber(value)?.replace(/\D/g, "") ?? null;
}

function getWhatsAppShareUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function getWhatsAppDirectUrl(input: { phone: string | null | undefined; message: string }) {
  const number = getWhatsAppNumber(input.phone);

  if (!number) {
    return null;
  }

  return `https://wa.me/${number}?text=${encodeURIComponent(input.message)}`;
}

function getPublicLeagueLinks(league: { slug: string } | null | undefined) {
  const siteUrl = getSiteUrl();

  if (!league?.slug) {
    return null;
  }

  return {
    league: `${siteUrl}/leagues/${league.slug}`,
    fixtures: `${siteUrl}/leagues/${league.slug}/fixtures`,
    stats: `${siteUrl}/leagues/${league.slug}/stats`,
  };
}

function getAvailabilityUrl(teamId: string, fixtureId: string) {
  return `${getSiteUrl()}/player/team/${teamId}/availability?fixtureId=${encodeURIComponent(
    fixtureId,
  )}`;
}

function getFixtureDetails(teamId: string, fixture: FixtureRow) {
  const isHome = fixture.homeTeamId === teamId;
  const team = isHome ? fixture.homeTeam : fixture.awayTeam;
  const opponent = isHome ? fixture.awayTeam : fixture.homeTeam;
  const label = `${team.name} vs ${opponent.name}`;
  const meta = [formatKickoff(fixture.kickoffAt), fixture.pitch, fixture.venue?.name]
    .filter(Boolean)
    .join(" · ");

  return { team, opponent, label, meta };
}

function getAvailabilityMap(fixture: FixtureRow) {
  return new Map(fixture.availabilities.map((item) => [item.teamMemberId, item.response]));
}

function getResponseLabel(value: string | null | undefined) {
  switch (value) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

function buildTemplates(input: {
  teamId: string;
  teamName: string;
  league: { slug: string; name: string; season: string | null } | null;
  fixture: FixtureRow | null;
  noResponseNames: string[];
}) {
  const publicLinks = getPublicLeagueLinks(input.league);
  const templates: WhatsAppTemplate[] = [];

  if (input.fixture) {
    const fixtureDetails = getFixtureDetails(input.teamId, input.fixture);
    const availabilityUrl = getAvailabilityUrl(input.teamId, input.fixture.id);
    const noResponseLine = input.noResponseNames.length
      ? `\n\nStill waiting on: ${input.noResponseNames.join(", ")}.`
      : "";

    templates.push({
      eyebrow: "availability",
      title: "Share availability link",
      description: "Post this into the team group so players can update the SIXFL availability page themselves.",
      tone: "emerald",
      message: [
        `SIXFL: ${input.teamName} availability`,
        "",
        `${fixtureDetails.label}`,
        `${fixtureDetails.meta}`,
        "",
        "Can everyone update whether they can play please:",
        availabilityUrl,
      ].join("\n"),
    });

    templates.push({
      eyebrow: "chase",
      title: "Chase no responses",
      description: "A firmer group message for players who have not replied yet.",
      tone: "amber",
      message: [
        `SIXFL: ${input.teamName} availability reminder`,
        "",
        `${fixtureDetails.label}`,
        `${fixtureDetails.meta}`,
        noResponseLine,
        "",
        "Please update your availability here as soon as you can:",
        availabilityUrl,
      ].filter(Boolean).join("\n"),
    });

    templates.push({
      eyebrow: "matchday",
      title: "Matchday reminder",
      description: "A simple match details message for the group on the day of the game.",
      tone: "sky",
      message: [
        `SIXFL match reminder: ${input.teamName}`,
        "",
        `${fixtureDetails.label}`,
        `${fixtureDetails.meta}`,
        "",
        "Please arrive in good time and let me know ASAP if anything changes.",
      ].join("\n"),
    });
  }

  if (publicLinks) {
    templates.push({
      eyebrow: "league",
      title: "Share league page",
      description: "Send players to the live SIXFL page for fixtures, tables and stats.",
      tone: "white",
      message: [
        `SIXFL: ${input.teamName}`,
        "",
        "Fixtures, results, league table and stats are here:",
        publicLinks.league,
        "",
        "Stats:",
        publicLinks.stats,
      ].join("\n"),
    });
  }

  templates.push({
    eyebrow: "payments",
    title: "Match fee reminder",
    description: "A captain-owned reminder. This does not create or send a SIXFL payment request.",
    tone: "white",
    message: [
      `${input.teamName} match fees`,
      "",
      "Can everyone please sort their match fee before the game. I’ll update the SIXFL team record once collected.",
      "",
      "Thanks.",
    ].join("\n"),
  });

  return templates;
}

function TemplateCard({ template }: { template: WhatsAppTemplate }) {
  const toneClasses =
    template.tone === "emerald"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100/80"
      : template.tone === "sky"
        ? "border-sky-400/25 bg-sky-500/10 text-sky-100/80"
        : template.tone === "amber"
          ? "border-amber-400/25 bg-amber-500/10 text-amber-100/80"
          : "border-white/10 bg-white/[0.04] text-white/70";

  return (
    <article className={`rounded-3xl border p-5 ${toneClasses}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">
            {template.eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{template.title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">{template.description}</p>
        </div>
        <a
          href={getWhatsAppShareUrl(template.message)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-200"
        >
          Open in WhatsApp
        </a>
      </div>

      <pre className="mt-5 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/75">
        {template.message}
      </pre>
    </article>
  );
}

function PlayerWhatsAppCard({
  player,
  phone,
  usesWhatsapp,
  message,
  status,
}: {
  player: { name: string; role: TeamRole };
  phone: string | null;
  usesWhatsapp: boolean;
  message: string;
  status: string;
}) {
  const href = getWhatsAppDirectUrl({ phone, message });

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-white">{player.name}</div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/55">
              {getRoleLabel(player.role)}
            </span>
            {usesWhatsapp ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                WhatsApp
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-white/45">
            {phone || "No phone saved"} · {getResponseLabel(status)}
          </div>
        </div>

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            WhatsApp player
          </a>
        ) : (
          <span className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/40">
            Add phone first
          </span>
        )}
      </div>
    </div>
  );
}

export default async function CaptainWhatsAppPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
          slug: true,
        },
      },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        where: {
          role: {
            in: [
              TeamRole.CAPTAIN,
              TeamRole.MANAGER,
              TeamRole.VICE_CAPTAIN,
              TeamRole.PLAYER,
              TeamRole.BACKUP_PLAYER,
            ],
          },
        },
        select: {
          id: true,
          role: true,
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

  if (!team) {
    notFound();
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      ...publishedFixtureWhere,
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      kickoffAt: { gte: new Date() },
      status: "SCHEDULED",
    },
    orderBy: [{ kickoffAt: "asc" }],
    take: 3,
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { name: true } },
      availabilities: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          teamMemberId: true,
          response: true,
        },
      },
    },
  });

  const nextFixture = fixtures[0] as FixtureRow | undefined;
  const teamMemberIds = team.members.map((member) => member.id);
  const userIds = team.members.map((member) => member.user.id);
  const [profilesByMemberId, whatsappRows] = await Promise.all([
    getTeamMemberProfilesByTeamMemberIds(teamMemberIds),
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
  const nextAvailabilityByMemberId = nextFixture
    ? getAvailabilityMap(nextFixture)
    : new Map<string, string>();
  const noResponseMembers = nextFixture
    ? team.members.filter((member) => {
        const response = nextAvailabilityByMemberId.get(member.id) ?? "NO_RESPONSE";
        return response === "NO_RESPONSE";
      })
    : [];
  const noResponseNames = noResponseMembers.map((member) =>
    getPlayerDisplayName(member.user),
  );
  const templates = buildTemplates({
    teamId: team.id,
    teamName: team.name,
    league: team.league,
    fixture: nextFixture ?? null,
    noResponseNames,
  });

  const individualMessage = nextFixture
    ? [
        `Hi {{name}}, can you update your SIXFL availability for ${getFixtureDetails(team.id, nextFixture).label} please?`,
        getAvailabilityUrl(team.id, nextFixture.id),
      ].join("\n")
    : "Hi {{name}}, can you confirm your availability for the next SIXFL game please?";

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Captain comms
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              WhatsApp toolkit
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
              Create WhatsApp messages for your team group without SIXFL sending SMS. Open a template, choose your WhatsApp group or player, then press send yourself.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                {team.teamMode === "MANAGED" ? "Managed team" : "Standard team"}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {team.members.length} squad contact{team.members.length === 1 ? "" : "s"}
              </span>
              {nextFixture ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">
                  Next fixture {formatKickoff(nextFixture.kickoffAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Templates
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{templates.length}</p>
              <p className="mt-2 text-sm text-emerald-100/65">Ready-made group messages.</p>
            </div>
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                No response
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{noResponseMembers.length}</p>
              <p className="mt-2 text-sm text-amber-100/65">For the next fixture.</p>
            </div>
          </div>
        </div>
      </section>

      {team.teamMode === "MANAGED" ? (
        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100/80">
          This team is currently managed by SIXFL. Automated player availability reminders may still be handled through the managed squad tools. WhatsApp templates are mainly intended for standard captains who manage their own squad group.
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        {templates.map((template) => (
          <TemplateCard key={template.title} template={template} />
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Individual messages
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">WhatsApp players directly</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            These links open WhatsApp with a pre-filled message. They only work where a valid phone number is saved on the player profile.
          </p>
        </div>

        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {team.members.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
              No squad contacts yet.
            </div>
          ) : (
            team.members.map((member) => {
              const profile = profilesByMemberId.get(member.id) ?? null;
              const playerName = getPlayerDisplayName(member.user);
              const response = nextAvailabilityByMemberId.get(member.id) ?? "NO_RESPONSE";
              const message = individualMessage.replace(/{{name}}/g, playerName.split(/\s+/)[0] || playerName);

              return (
                <PlayerWhatsAppCard
                  key={member.id}
                  player={{ name: playerName, role: member.role }}
                  phone={profile?.phone ?? null}
                  usesWhatsapp={usesWhatsappByUserId.get(member.user.id) ?? false}
                  message={message}
                  status={response}
                />
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
