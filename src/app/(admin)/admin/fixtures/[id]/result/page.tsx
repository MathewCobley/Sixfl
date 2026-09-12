import OverturnEmailPanel from "@/components/admin/OverturnEmailPanel";
import { emailOverturnedResultAction } from "./overturn-email-actions";
import { randomUUID } from "node:crypto";
import OverturnResultForm from "@/components/admin/OverturnResultForm";
import OverturnedResultNotice from "@/components/fixtures/OverturnedResultNotice";
import { overturnResultAction } from "./overturn-actions";
// ========================================
// File: src/app/(admin)/admin/fixtures/[id]/result/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import AdminCard from "@/components/admin/AdminCard";
import { submitResultAction } from "@/app/(admin)/admin/fixtures/actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

export default async function FixtureResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string; overturned?: string; overturnError?: string; noticeError?: string; noticeChecked?: string }>;
}) {
  const access = await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const returnTo = sp.returnTo?.startsWith("/admin/fixtures") ? sp.returnTo : "/admin/fixtures";

  const fixture = await prisma.fixture.findUnique({
    where: { id },
    select: {
      id: true,
      kickoffAt: true,
      status: true,
      pitch: true,
      round: true,
      position: true,
      league: { select: { name: true, season: true } },
      venue: { select: { name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      result: { select: { homeScore: true, awayScore: true, isDisputed: true, updatedAt: true, overturn: true } },
    },
  });

  if (!fixture) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href={returnTo} className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
        ← Back to fixtures
      </Link>

      <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          {fixture.result?.overturn ? "Result overturned" : "Enter result"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          {fixture.homeTeam.name} vs {fixture.awayTeam.name}
        </h1>
        <div className="mt-3 space-y-1 text-sm text-white/60">
          <p>{formatDate(fixture.kickoffAt)} · {fixture.venue?.name ?? "Venue TBC"}</p>
          <p>{fixture.league.name}{fixture.league.season ? ` · ${fixture.league.season}` : ""}</p>
          <p>{fixture.pitch ?? "Pitch not set"}{fixture.position ? ` · Game ${fixture.position}` : ""}{fixture.round ? ` · Week ${fixture.round}` : ""}</p>
        </div>
      </AdminCard>

      {sp.overturned === "1" ? <p role="status" className="rounded-xl border border-emerald-300/25 p-4 text-emerald-100">Overturned result recorded. The table uses the awarded score; the predictor retains the on-pitch score. No messages or payments were triggered.</p> : null}
      {sp.overturnError ? <p role="alert" className="rounded-xl border border-red-300/25 p-4 text-red-100">{sp.overturnError}</p> : null}
      <OverturnedResultNotice overturn={fixture.result?.overturn} homeName={fixture.homeTeam.name} awayName={fixture.awayTeam.name}/>
      {fixture.result?.overturn ? <section className="space-y-3 rounded-2xl border border-white/15 p-5 text-sm text-white/80">
        <h2 className="text-lg font-semibold">Recorded competition decision · Admin only</h2>
        <p>Official result: {fixture.homeTeam.name} {fixture.result.homeScore}–{fixture.result.awayScore} {fixture.awayTeam.name}</p>
        <p>{fixture.result.overturn.decidedByName} · {formatDate(fixture.result.overturn.decidedAt)}</p>
        <p>Rules: {fixture.result.overturn.rulesBasis}</p>
        <p className="whitespace-pre-wrap">{fixture.result.overturn.evidenceNote}</p>
        <p>Original score and decision are retained. Ordinary score corrections cannot overwrite this result.</p>
      </section> : access.user?.role === "ADMIN" && fixture.status === "COMPLETED" && fixture.result ? <OverturnResultForm
        fixtureId={fixture.id} requestId={randomUUID()} updatedAt={fixture.result.updatedAt.toISOString()}
        homeTeam={fixture.homeTeam} awayTeam={fixture.awayTeam} homeScore={fixture.result.homeScore} awayScore={fixture.result.awayScore}
        action={overturnResultAction}/> : null}

      {sp.noticeChecked === "1" ? <p role="status" className="rounded-xl border border-emerald-300/25 p-4 text-sm text-emerald-100">Email request checked. See the queued/sent status below. The recorded result has not been changed.</p> : null}
      {sp.noticeError ? <p role="alert" className="rounded-xl border border-red-300/25 p-4 text-sm text-red-100">{sp.noticeError}</p> : null}
      {fixture.result?.overturn && access.user?.role === "ADMIN" ? <OverturnEmailPanel
        fixtureId={fixture.id} decisionId={fixture.result.overturn.id} actorUserId={access.user.id}
        action={emailOverturnedResultAction}/> : null}

      {fixture.result?.isDisputed ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          This result is currently disputed. Updating the score will change the fixture result, but the dispute record may still need reviewing.
        </div>
      ) : null}

      {!fixture.result?.overturn ? <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <form action={submitResultAction} className="space-y-5">
          <input type="hidden" name="fixtureId" value={fixture.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="space-y-2 text-sm font-semibold text-white">
              {fixture.homeTeam.name}
              <input
                name="homeScore"
                type="number"
                min={0}
                defaultValue={fixture.result?.homeScore ?? ""}
                className="h-16 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-center text-2xl font-black text-white outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>

            <div className="pb-4 text-center text-2xl font-black text-white/35">-</div>

            <label className="space-y-2 text-sm font-semibold text-white">
              {fixture.awayTeam.name}
              <input
                name="awayScore"
                type="number"
                min={0}
                defaultValue={fixture.result?.awayScore ?? ""}
                className="h-16 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-center text-2xl font-black text-white outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
              Save result
            </button>
            <Link href={returnTo} className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
              Cancel
            </Link>
          </div>
        </form>
      </AdminCard> : null}
    </div>
  );
}
