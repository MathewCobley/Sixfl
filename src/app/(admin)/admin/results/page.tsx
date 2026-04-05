// ========================================
// File: src/app/(admin)/admin/results/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ResultDisputeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const metadata = {
  title: "Admin Results & Disputes | SIXFL",
};

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function updateDisputeStatus(formData: FormData) {
  "use server";

  const disputeId = String(formData.get("disputeId") ?? "");
  const status = String(formData.get("status") ?? ResultDisputeStatus.UNDER_REVIEW) as ResultDisputeStatus;
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  const { user } = await requireAdmin();

  await prisma.resultDispute.update({
    where: { id: disputeId },
    data: {
      status,
      adminNote: adminNote || null,
      reviewedAt:
        status === ResultDisputeStatus.RESOLVED || status === ResultDisputeStatus.REJECTED
          ? new Date()
          : null,
      reviewedByUserId:
        status === ResultDisputeStatus.RESOLVED || status === ResultDisputeStatus.REJECTED
          ? user?.id ?? null
          : null,
    },
  });

  revalidatePath("/admin/results");
}

export default async function AdminResultsPage() {
  await requireAdmin();

  const [fixtures, disputes] = await Promise.all([
    prisma.fixture.findMany({
      orderBy: { kickoffAt: "desc" },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        result: {
          select: {
            id: true,
            homeScore: true,
            awayScore: true,
            isDisputed: true,
            disputes: {
              where: {
                status: {
                  in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.UNDER_REVIEW],
                },
              },
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.resultDispute.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        team: { select: { name: true } },
        matchResult: {
          include: {
            fixture: {
              include: {
                homeTeam: { select: { name: true } },
                awayTeam: { select: { name: true } },
              },
            },
          },
        },
      },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Page title</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Results & disputes</h1>
        <p className="mt-2 text-sm text-white/60">
          Official scores stay admin-owned. Captains can complete scorer/POM metadata and raise disputes here for review.
        </p>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold">Open dispute queue</h2>
        <div className="mt-4 space-y-3">
          {disputes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-white/60">
              No disputes submitted.
            </div>
          ) : (
            disputes.map((dispute) => (
              <div key={dispute.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm text-white/55">{formatDate(dispute.createdAt)}</p>
                    <h3 className="mt-1 font-semibold">
                      {dispute.matchResult.fixture.homeTeam.name} vs {dispute.matchResult.fixture.awayTeam.name}
                    </h3>
                    <p className="mt-2 text-sm text-white/70">Raised by {dispute.team.name}</p>
                    <p className="mt-2 text-sm text-white/70">Type: {dispute.disputeType.toLowerCase().replaceAll("_", " ")}</p>
                    <p className="mt-2 text-sm text-white/80">{dispute.description}</p>
                  </div>

                  <form action={updateDisputeStatus} className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0d1428] p-4">
                    <input type="hidden" name="disputeId" value={dispute.id} />
                    <select name="status" defaultValue={dispute.status} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none">
                      <option value={ResultDisputeStatus.UNDER_REVIEW}>Under review</option>
                      <option value={ResultDisputeStatus.RESOLVED}>Resolved</option>
                      <option value={ResultDisputeStatus.REJECTED}>Rejected</option>
                    </select>
                    <textarea
                      name="adminNote"
                      rows={3}
                      defaultValue={dispute.adminNote ?? ""}
                      placeholder="Admin note"
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                    />
                    <button type="submit" className="mt-3 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                      Save dispute update
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 divide-y divide-white/10">
        {fixtures.map((fixture) => (
          <div key={fixture.id} className="flex items-center justify-between p-4">
            <div className="space-y-1">
              <div className="text-sm text-white/60">
                {formatDate(fixture.kickoffAt)} • {formatTime(fixture.kickoffAt)}
              </div>

              <div className="text-sm">
                <span className="font-medium">{fixture.homeTeam.name}</span> vs <span className="font-medium">{fixture.awayTeam.name}</span>
                {fixture.result && (
                  <span className="ml-3 text-white/70">({fixture.result.homeScore}-{fixture.result.awayScore})</span>
                )}
                {fixture.result?.disputes.length ? (
                  <span className="ml-3 rounded-full bg-red-500/15 px-2 py-1 text-xs text-red-200">
                    {fixture.result.disputes.length} open dispute{fixture.result.disputes.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>

            <Link
              href={`/referee/fixture/${fixture.id}`}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20"
            >
              Enter Result
            </Link>
          </div>
        ))}

        {fixtures.length === 0 && <div className="p-4 text-white/60">No fixtures found</div>}
      </section>
    </div>
  );
}
