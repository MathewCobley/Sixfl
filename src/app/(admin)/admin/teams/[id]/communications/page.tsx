// ========================================
// File: src/app/(admin)/admin/teams/[id]/communications/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import TeamCommunicationsComposer from "@/components/admin/communications/TeamCommunicationsComposer";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Communications | SIXFL",
};

type SearchParams = {
  saved?: string;
  channel?: string;
  error?: string;
};

function getChannelLabel(value?: string) {
  return value === "sms" ? "SMS" : "email";
}

function getDirectionLabel(value: string) {
  return value === "INBOUND" ? "Inbound" : "Outbound";
}

export default async function AdminTeamCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  const filters = await searchParams;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      claimCode: true,
      joinSlug: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const { snapshot } = await upsertTeamNotificationRecipient(team.id);

  const [threads, emailTemplates, smsTemplates] = await Promise.all([
    prisma.messageThread.findMany({
      where: {
        sourceType: "TEAM",
        sourceId: team.id,
      },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 100,
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    }),
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
  ]);

  const messages = threads
    .flatMap((thread) => thread.messages.map((message) => ({ thread, message })))
    .sort((a, b) => b.message.createdAt.getTime() - a.message.createdAt.getTime());

  const successMessage =
    filters.saved === "queued"
      ? `${getChannelLabel(filters.channel)} queued from communications hub.`
      : null;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const claimLink = `${baseUrl}/claim?code=${encodeURIComponent(team.claimCode)}`;
  const teamJoinUrl = team.joinSlug ? `${baseUrl}/teams/join/${team.joinSlug}` : `${baseUrl}/register-interest`;
  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";

  const resolvedEmailTemplates = emailTemplates.map((template) => {
    const ctaUrl =
      template.ctaUrlKey === "signupUrl"
        ? `${baseUrl}/register-interest`
        : template.ctaUrlKey === "manageTeamUrl"
          ? claimLink
          : template.ctaUrlKey === "captainDashboardUrl"
            ? claimLink
            : template.ctaUrlKey === "teamJoinUrl"
              ? teamJoinUrl
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/teams/${team.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>
          <h1 className="text-3xl font-semibold text-white">{team.name} communications</h1>
          <p className="text-sm text-white/60">
            Central message hub for this team. View timeline, send email or SMS, and keep communication history in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/teams/${team.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Team overview
          </Link>
          <Link
            href={`/admin/teams/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Prospects
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Communications hub
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Team timeline
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Every new message from this hub lands in one place so you can stop chasing email and SMS history across multiple pages.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Primary email: {snapshot.primaryContact.email ?? "—"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Primary phone: {snapshot.primaryContact.phone ?? "—"}
              </span>
              {team.league ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league.name}
                  {team.league.season ? ` · ${team.league.season}` : ""}
                </span>
              ) : null}
              {team.joinSlug ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  Join page live
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Threads</p>
              <p className="mt-3 text-3xl font-semibold text-white">{threads.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Messages</p>
              <p className="mt-3 text-3xl font-semibold text-white">{messages.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Unread</p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {threads.reduce((sum, thread) => sum + thread.unreadForAdminCount, 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <TeamCommunicationsComposer
          teamId={team.id}
          fromPath={`/admin/teams/${team.id}/communications`}
          toEmail={snapshot.primaryContact.email ?? null}
          toPhone={snapshot.primaryContact.phone ?? null}
          contactName={snapshot.primaryContact.name ?? null}
          teamName={team.name}
          leagueName={team.league ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}` : null}
          claimCode={team.claimCode}
          claimLink={claimLink}
          captainDashboardUrl={claimLink}
          emailTemplates={resolvedEmailTemplates}
          smsTemplates={smsTemplates}
        />

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">HISTORY</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Timeline</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {messages.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No communications have been logged from the new hub yet.
              </div>
            ) : (
              messages.map(({ thread, message }) => (
                <div key={message.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                      {message.channel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                      {getDirectionLabel(message.direction)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                      {message.providerStatus || "RECORDED"}
                    </span>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">
                      {message.subject || `${message.channel} message`}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {thread.contactName || team.name}
                      {message.toEmail ? ` · ${message.toEmail}` : ""}
                      {message.toNumber ? ` · ${message.toNumber}` : ""}
                    </div>
                  </div>

                  {message.channel === "EMAIL" && message.htmlBody ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                      <div dangerouslySetInnerHTML={{ __html: message.htmlBody }} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                      {message.textBody || message.body}
                    </div>
                  )}

                  <div className="text-xs text-white/45">
                    {message.createdAt.toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
