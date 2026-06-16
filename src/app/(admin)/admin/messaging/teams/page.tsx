// ========================================
// File: src/app/(admin)/admin/messaging/teams/page.tsx
// ========================================

import Link from "next/link";

import AllTeamsCommunicationsComposer from "@/components/admin/communications/AllTeamsCommunicationsComposer";
import { getTeamContactSnapshot } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  saved?: string;
  channel?: string;
  count?: string;
  skipped?: string;
  failed?: string;
  warning?: string;
  error?: string;
};

function getNotice(params: SearchParams) {
  if (params.error?.trim()) {
    return {
      tone: "error" as const,
      message: decodeURIComponent(params.error),
    };
  }

  if (params.saved === "queued") {
    const count = Number(params.count ?? "0");
    const skipped = Number(params.skipped ?? "0");
    const failed = Number(params.failed ?? "0");

    return {
      tone: "success" as const,
      message: `Email queued to ${Number.isFinite(count) ? count : 0} team${count === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} skipped because email details were missing` : ""}${failed > 0 ? ` · ${failed} failed` : ""}.`,
    };
  }

  return null;
}

export default async function AdminAllTeamsCommunicationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const notice = getNotice(sp);
  const warningMessage = sp.warning ? decodeURIComponent(sp.warning) : null;

  const [teams, emailTemplates] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ league: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
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
  ]);

  const snapshots = await Promise.all(teams.map((team) => getTeamContactSnapshot(team.id)));
  const snapshotByTeamId = new Map(
    snapshots
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
      .map((snapshot) => [snapshot.teamId, snapshot]),
  );

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://www.sixfl.co.uk";
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

  const teamOptions = teams.map((team) => {
    const snapshot = snapshotByTeamId.get(team.id);
    const leagueLabel = team.league
      ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
      : null;

    return {
      id: team.id,
      name: team.name,
      leagueLabel,
      emailReady: Boolean(snapshot?.primaryContact.email?.trim()),
    };
  });

  const emailReadyCount = teamOptions.filter((team) => team.emailReady).length;
  const noLeagueCount = teamOptions.filter((team) => !team.leagueLabel).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/admin/messaging"
            className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
          >
            ← Back to communications
          </Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
            All teams
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Email selected teams
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Send an email across any mix of teams, including old, inactive or
            unassigned teams. Use the picker to choose exactly who receives it.
          </p>
        </div>

        <Link
          href="/admin/teams"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Team contacts
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Teams loaded
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{teamOptions.length}</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Email ready
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{emailReadyCount}</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            No league assigned
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{noLeagueCount}</p>
        </div>
      </div>

      {notice ? (
        <section
          className={`rounded-2xl border p-4 text-sm ${
            notice.tone === "error"
              ? "border-red-400/20 bg-red-500/10 text-red-100"
              : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {notice.message}
        </section>
      ) : null}

      {warningMessage ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          {warningMessage}
        </section>
      ) : null}

      <AllTeamsCommunicationsComposer
        fromPath="/admin/messaging/teams"
        teams={teamOptions}
        emailTemplates={resolvedEmailTemplates}
      />
    </div>
  );
}
