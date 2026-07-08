// ========================================
// File: src/app/(admin)/admin/fixtures/carry-forward-payments/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Carry Managed Squad Payments | SIXFL Admin",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FixtureOption = {
  id: string;
  label: string;
  teamLabel: string;
  paidFeeCount: number;
};

type PaidFeeRow = {
  id: string;
  fixtureId: string;
  teamId: string;
  teamMemberId: string | null;
  prospectId: string | null;
  amountPence: number;
  paidAt: Date | null;
  note: string | null;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

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

function getNotice(params: Record<string, string | string[] | undefined>) {
  const carried = Number(getSearchParam(params.carried) || 0);
  const skipped = Number(getSearchParam(params.skipped) || 0);

  if (getSearchParam(params.saved) === "carried") {
    return `Carried ${carried} managed squad payment${carried === 1 ? "" : "s"} forward. ${skipped} skipped because the player already existed on the rearranged fixture.`;
  }

  if (getSearchParam(params.saved) === "none") {
    return "No paid managed squad fees were available to carry forward.";
  }

  return null;
}

async function getPaidManagedFees(fixtureId: string) {
  return prisma.playerMatchFee.findMany({
    where: {
      fixtureId,
      status: "PAID",
      OR: [{ teamMemberId: { not: null } }, { prospectId: { not: null } }],
    },
    select: {
      id: true,
      fixtureId: true,
      teamId: true,
      teamMemberId: true,
      prospectId: true,
      amountPence: true,
      paidAt: true,
      note: true,
    },
  });
}

function buildCarryNote(input: { sourceFixtureLabel: string; sourceFeeId: string; existingNote: string | null }) {
  const note = `Carried forward from postponed fixture ${input.sourceFixtureLabel}. Source player fee ID: ${input.sourceFeeId}.`;
  const existing = input.existingNote?.trim();
  if (!existing) return note;
  if (existing.includes(input.sourceFeeId)) return existing;
  return `${existing}\n${note}`;
}

async function carryManagedSquadPaymentsAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const sourceFixtureId = String(formData.get("sourceFixtureId") ?? "").trim();
  const targetFixtureId = String(formData.get("targetFixtureId") ?? "").trim();

  if (!sourceFixtureId || !targetFixtureId || sourceFixtureId === targetFixtureId) {
    redirect("/admin/fixtures/carry-forward-payments?error=invalid");
  }

  const [sourceFixture, targetFixture, paidFees] = await Promise.all([
    prisma.fixture.findUnique({
      where: { id: sourceFixtureId },
      select: {
        id: true,
        leagueId: true,
        status: true,
        kickoffAt: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        league: { select: { slug: true } },
      },
    }),
    prisma.fixture.findUnique({
      where: { id: targetFixtureId },
      select: {
        id: true,
        leagueId: true,
        kickoffAt: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        league: { select: { slug: true } },
      },
    }),
    getPaidManagedFees(sourceFixtureId),
  ]);

  if (!sourceFixture || !targetFixture) {
    redirect("/admin/fixtures/carry-forward-payments?error=fixture_not_found");
  }

  if (paidFees.length === 0) {
    redirect("/admin/fixtures/carry-forward-payments?saved=none");
  }

  const sourceTeams = new Set([sourceFixture.homeTeamId, sourceFixture.awayTeamId]);
  const targetTeams = new Set([targetFixture.homeTeamId, targetFixture.awayTeamId]);
  const sameTeams = [...sourceTeams].every((teamId) => targetTeams.has(teamId));

  if (!sameTeams) {
    redirect("/admin/fixtures/carry-forward-payments?error=team_mismatch");
  }

  const sourceFixtureLabel = `${sourceFixture.homeTeam.name} vs ${sourceFixture.awayTeam.name} on ${formatDate(sourceFixture.kickoffAt)}`;
  let carried = 0;
  let skipped = 0;

  for (const fee of paidFees as PaidFeeRow[]) {
    const existing = await prisma.playerMatchFee.findFirst({
      where: {
        fixtureId: targetFixture.id,
        OR: [
          ...(fee.teamMemberId ? [{ teamMemberId: fee.teamMemberId }] : []),
          ...(fee.prospectId ? [{ prospectId: fee.prospectId }] : []),
        ],
      },
      select: { id: true, status: true, note: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.playerMatchFee.create({
      data: {
        fixtureId: targetFixture.id,
        teamId: fee.teamId,
        teamMemberId: fee.teamMemberId,
        prospectId: fee.prospectId,
        amountPence: fee.amountPence,
        status: "PAID",
        paidAt: fee.paidAt ?? new Date(),
        waivedAt: null,
        cancelledAt: null,
        paymentUrl: null,
        paymentToken: null,
        note: buildCarryNote({
          sourceFixtureLabel,
          sourceFeeId: fee.id,
          existingNote: fee.note,
        }),
      },
    });

    carried += 1;
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/carry-forward-payments");
  revalidatePath(`/captain/team/${targetFixture.homeTeamId}/match-fees`);
  revalidatePath(`/captain/team/${targetFixture.awayTeamId}/match-fees`);
  revalidatePath(`/captain/team/${targetFixture.homeTeamId}/player-payments`);
  revalidatePath(`/captain/team/${targetFixture.awayTeamId}/player-payments`);

  if (sourceFixture.league.slug) revalidatePath(`/leagues/${sourceFixture.league.slug}/fixtures`);
  if (targetFixture.league.slug) revalidatePath(`/leagues/${targetFixture.league.slug}/fixtures`);

  redirect(`/admin/fixtures/carry-forward-payments?saved=carried&carried=${carried}&skipped=${skipped}`);
}

async function getFixtureOptions() {
  const fixtures = await prisma.fixture.findMany({
    orderBy: [{ kickoffAt: "desc" }],
    take: 120,
    select: {
      id: true,
      status: true,
      kickoffAt: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      playerMatchFees: {
        where: { status: "PAID" },
        select: { id: true },
      },
    },
  });

  return fixtures.map((fixture): FixtureOption => ({
    id: fixture.id,
    label: `${formatDate(fixture.kickoffAt)} · ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} · ${fixture.status}`,
    teamLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    paidFeeCount: fixture.playerMatchFees.length,
  }));
}

export default async function CarryForwardManagedSquadPaymentsPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const notice = getNotice(params);
  const error = getSearchParam(params.error);
  const fixtures = await getFixtureOptions();
  const sourceFixtures = fixtures.filter((fixture) => fixture.paidFeeCount > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/fixtures" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to fixtures
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Managed squad payments
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Carry payments to rearranged fixture
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Use this when a managed squad fixture was postponed but the match will be played later. Paid player rows are copied to the rearranged fixture as already paid. Unpaid/open links are not carried.
        </p>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error === "team_mismatch"
            ? "The rearranged fixture must involve the same two teams."
            : error === "fixture_not_found"
              ? "One of the selected fixtures could not be found."
              : "Choose a postponed/source fixture and a different rearranged fixture."}
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.05] p-6">
        <form action={carryManagedSquadPaymentsAction} className="space-y-5">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/85">
            This does not refund or duplicate Stripe transactions. It records the rearranged fixture player rows as paid because the money was already received for the postponed match.
          </div>

          <label className="space-y-2 text-sm font-semibold text-white">
            Original postponed fixture with paid player fees
            <select name="sourceFixtureId" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40">
              <option value="">Choose original fixture</option>
              {sourceFixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.label} · {fixture.paidFeeCount} paid player fee{fixture.paidFeeCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Rearranged fixture
            <select name="targetFixtureId" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40">
              <option value="">Choose rearranged fixture</option>
              {fixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
            Carry paid player fees forward
          </button>
        </form>
      </AdminCard>
    </div>
  );
}
