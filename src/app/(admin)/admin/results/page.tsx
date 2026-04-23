// ========================================
// File: src/app/(admin)/admin/results/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ResultDisputeStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Results | SIXFL",
};

const disputeStatusOptions = [
  { value: "OPEN", label: "Open" },
  { value: "REVIEW", label: "In review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
];

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function updateDisputeAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const disputeId = String(formData.get("disputeId") ?? "");
  const status = String(formData.get("status") ?? "OPEN") as ResultDisputeStatus;
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  if (!disputeId) {
    redirect("/admin/results?error=missing_id");
  }

  await prisma.resultDispute.update({
    where: { id: disputeId },
    data: {
      status,
      adminNote: adminNote || null,
    },
  });

  const dispute = await prisma.resultDispute.findUnique({
    where: { id: disputeId },
    select: { matchResultId: true },
  });

  if (dispute && (status === "RESOLVED" || status === "REJECTED")) {
    const openCount = await prisma.resultDispute.count({
      where: {
        matchResultId: dispute.matchResultId,
        status: {
          in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.REVIEW],
        },
      },
    });

    if (openCount === 0) {
      await prisma.matchResult.update({
        where: { id: dispute.matchResultId },
        data: { isDisputed: false },
      });
    }
  }

  revalidatePath("/admin/results");
  redirect("/admin/results?updated=1");
}

export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    updated?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const updated = sp.updated === "1";
  const error = sp.error;

  const disputes = await prisma.resultDispute.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      matchResult: {
        include: {
          fixture: {
            include: {
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
              league: { select: { name: true, season: true } },
            },
          },
        },
      },
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Result disputes</h1>
        <p className="text-sm text-white/60">
          Review captain-submitted result disputes without changing official
          score ownership.
        </p>
      </div>

      {(updated || error) && (
        <div className="space-y-1 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {updated ? (
            <div className="text-emerald-300">Dispute updated.</div>
          ) : null}
          {error === "missing_id" ? (
            <div className="text-red-300">Action failed (missing dispute id).</div>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Total disputes
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {disputes.length}
          </div>
        </div>

        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Open
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {disputes.filter((item) => item.status === "OPEN").length}
          </div>
        </div>

        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/70">
            In review
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {disputes.filter((item) => item.status === "REVIEW").length}
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Resolved
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {disputes.filter((item) => item.status === "RESOLVED").length}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {disputes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-sm text-white/55">
            No result disputes yet.
          </div>
        ) : (
          disputes.map((dispute) => (
            <section
              key={dispute.id}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm text-white/50">
                    {dispute.matchResult.fixture.league?.name ?? "League"}
                    {dispute.matchResult.fixture.league?.season
                      ? ` · ${dispute.matchResult.fixture.league.season}`
                      : ""}
                  </p>

                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    {dispute.matchResult.fixture.homeTeam.name}{" "}
                    {dispute.matchResult.homeScore}-
                    {dispute.matchResult.awayScore}{" "}
                    {dispute.matchResult.fixture.awayTeam.name}
                  </h2>

                  <p className="mt-2 text-sm text-white/65">
                    Team: {dispute.team.name}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/75">
                    {dispute.type}
                  </span>
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-100">
                    {dispute.status}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#0d1428] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">
                    Dispute details
                  </h3>

                  <p className="mt-3 text-sm text-white/70">
                    <span className="text-white/45">Submitted by:</span>{" "}
                    {dispute.createdByUser?.name ||
                      dispute.createdByUser?.email ||
                      "Unknown"}
                  </p>

                  <p className="mt-2 text-sm text-white/70">
                    <span className="text-white/45">Created:</span>{" "}
                    {formatUkDateTime(dispute.createdAt)}
                  </p>

                  <p className="mt-3 text-sm text-white/80">
                    {dispute.description}
                  </p>

                  {dispute.adminNote ? (
                    <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                      <span className="font-medium text-white">Admin note:</span>{" "}
                      {dispute.adminNote}
                    </div>
                  ) : null}
                </div>

                <form
                  action={updateDisputeAction}
                  className="rounded-2xl border border-white/10 bg-[#0d1428] p-4"
                >
                  <input type="hidden" name="disputeId" value={dispute.id} />

                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">
                    Review dispute
                  </h3>

                  <div className="mt-3">
                    <FormListboxField
                      name="status"
                      value={dispute.status}
                      options={disputeStatusOptions}
                      placeholder="Select status"
                    />
                  </div>

                  <textarea
                    name="adminNote"
                    rows={5}
                    defaultValue={dispute.adminNote ?? ""}
                    placeholder="Add an admin note for the captain or internal review."
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                  />

                  <button
                    type="submit"
                    className="mt-3 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200"
                  >
                    Save dispute update
                  </button>
                </form>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
