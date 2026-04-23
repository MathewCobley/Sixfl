// ========================================
// File: src/app/(admin)/admin/leagues/[id]/communications/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import LeagueCommunicationsComposer from "@/components/admin/communications/LeagueCommunicationsComposer";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamContactSnapshot } from "@/lib/notifications/team-contacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League Communications | SIXFL",
};

type SearchParams = {
  saved?: string;
  channel?: string;
  error?: string;
  count?: string;
};

function getChannelLabel(value?: string) {
  return value === "sms" ? "SMS" : "email";
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminLeagueCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  const filters = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      season: true,
      teams: {
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
    },
  });

  if (!league) {
    notFound();
  }

  const teamSnapshots = await Promise.all(
    league.teams.map((team) => getTeamContactSnapshot(team.id)),
  );

  const snapshotMap = new Map<string, NonNullable<(typeof teamSnapshots)[number]>>();
  for (const snapshot of teamSnapshots) {
    if (snapshot) {
      snapshotMap.set(snapshot.teamId, snapshot);
    }
  }

  const [emailTemplates, smsTemplates, teamThreads] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: {
          in: ["TEAM", "GENERAL"],
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        body: true,
        description: true,
        ctaLabel: true,
        ctaUrlKey: true,
      },
    }),
    prisma.notificationTemplate.findMany({
      where: {
        isActive: true,
        channel: "SMS",
        audience: {
          in: ["TEAM", "GENERAL"],
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        body: true,
        description: true,
      },
    }),
    prisma.messageThread.findMany({
      where: {
        leagueId: league.id,
        sourceType: "TEAM",
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 3,
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 40,
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";

  const resolvedEmailTemplates = emailTemplates.map((template) => {
    const ctaUrl =
      template.ctaUrlKey === "signupUrl"
        ? `${baseUrl}/register-interest`
        : template.ctaUrlKey === "paymentUrl"
          ? fixedPaymentUrl
          : null;

    return {
      id: template.id,
      key: template.key,
      name: template.name,
      subject: template.subject,
      body: template.body,
      description: template.description,
      ctaLabel: template.ctaLabel,
      ctaUrl,
    };
  });

  const successMessage =
    filters.saved === "queued"
      ? `${getChannelLabel(filters.channel)} queued to ${filters.count || "0"} team${filters.count === "1" ? "" : "s"}.`
      : null;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  const messages = teamThreads
    .flatMap((thread) => thread.messages.map((message) => ({ thread, message })))
    .sort((a, b) => b.message.createdAt.getTime() - a.message.createdAt.getTime());

  const emailReadyCount = league.teams.filter((team) => {
    const snapshot = snapshotMap.get(team.id);
    return Boolean(snapshot?.primaryContact.email?.trim());
  }).length;
  const smsReadyCount = league.teams.filter((team) => {
    const snapshot = snapshotMap.get(team.id);
    return Boolean(snapshot?.primaryContact.phone?.trim());
  }).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/leagues/${league.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to league
          </Link>
          <h1 className="text-3xl font-semibold text-white">
            {league.name}
            {league.season ? ` · ${league.season}` : ""} communications
          </h1>
          <p className="text-sm text-white/60">
            Queue a broadcast to all teams in this league and keep the resulting history inside each team thread.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/leagues/${league.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            League overview
          </Link>
          <Link
            href="/admin/messaging"
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Communications hub
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{successMessage}</div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">League broadcast</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Whole-league outreach</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Use Communications to send one message across the entire league, while still writing the history back into each team’s own thread.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Teams: {league.teams.length}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Email ready: {emailReadyCount}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">SMS ready: {smsReadyCount}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Teams</p>
              <p className="mt-3 text-3xl font-semibold text-white">{league.teams.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Threads</p>
              <p className="mt-3 text-3xl font-semibold text-white">{teamThreads.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Recent messages</p>
              <p className="mt-3 text-3xl font-semibold text-white">{messages.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <LeagueCommunicationsComposer
          leagueId={league.id}
          fromPath={`/admin/leagues/${league.id}/communications`}
          leagueName={`${league.name}${league.season ? ` — ${league.season}` : ""}`}
          teamCount={league.teams.length}
          teams={league.teams.map((team) => {
            const snapshot = snapshotMap.get(team.id);
            return {
              id: team.id,
              name: team.name,
              emailReady: Boolean(snapshot?.primaryContact.email?.trim()),
              smsReady: Boolean(snapshot?.primaryContact.phone?.trim()),
            };
          })}
          emailTemplates={resolvedEmailTemplates}
          smsTemplates={smsTemplates}
        />

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">RECENT THREAD HISTORY</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Latest team messages</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {messages.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">No messages have been logged for teams in this league yet.</div>
            ) : (
              messages.map(({ thread, message }) => (
                <div key={message.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{message.channel}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{thread.team?.name || thread.contactName || "Team"}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">{message.providerStatus || "RECORDED"}</span>
                  </div>

                  <div className="text-sm font-semibold text-white">{message.subject || `${message.channel} message`}</div>

                  {message.channel === "EMAIL" && message.htmlBody ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                      <div dangerouslySetInnerHTML={{ __html: message.htmlBody }} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">{message.textBody || message.body}</div>
                  )}

                  <div className="text-xs text-white/45">{formatUkDateTime(message.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
