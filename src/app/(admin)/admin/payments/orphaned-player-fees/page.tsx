// ========================================
// File: src/app/(admin)/admin/payments/orphaned-player-fees/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getPlayerMatchFeeSnapshots,
  recoverPlayerMatchFeeSnapshotFromNotifications,
} from "@/lib/payments/player-match-fee-snapshots";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  saved?: string;
  error?: string;
  feeId?: string;
  user?: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getRepairHref(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value?.trim()) searchParams.set(key, value.trim());
  }

  const query = searchParams.toString();
  return `/admin/payments/orphaned-player-fees${query ? `?${query}` : ""}`;
}

async function attachOrphanedPlayerFeeAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const feeId = getString(formData, "feeId");
  const userLookup = getString(formData, "userLookup");

  if (!feeId || !userLookup) {
    redirect(getRepairHref({ error: "missing_details", feeId }));
  }

  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: feeId },
    select: {
      id: true,
      teamId: true,
      fixtureId: true,
      teamMemberId: true,
      prospectId: true,
    },
  });

  if (!fee) {
    redirect(getRepairHref({ error: "fee_not_found" }));
  }

  if (fee.teamMemberId || fee.prospectId) {
    redirect(getRepairHref({ error: "already_attached", feeId }));
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: userLookup },
        { email: userLookup.toLowerCase() },
        { email: { equals: userLookup, mode: "insensitive" } },
        { name: { equals: userLookup, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    redirect(getRepairHref({ error: "user_not_found", feeId, user: userLookup }));
  }

  const existingFeeForUser = await prisma.playerMatchFee.findFirst({
    where: {
      fixtureId: fee.fixtureId,
      teamMember: {
        userId: user.id,
        teamId: fee.teamId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingFeeForUser && existingFeeForUser.id !== fee.id) {
    redirect(getRepairHref({ error: "duplicate_fee", feeId, user: user.email ?? user.id }));
  }

  const teamMember = await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: fee.teamId,
      },
    },
    update: {},
    create: {
      userId: user.id,
      teamId: fee.teamId,
      role: "PLAYER",
    },
    select: {
      id: true,
    },
  });

  await prisma.playerMatchFee.update({
    where: { id: fee.id },
    data: {
      teamMemberId: teamMember.id,
      prospectId: null,
      note: `Reattached by admin to user ${user.email ?? user.name ?? user.id}.`,
    },
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/orphaned-player-fees");
  revalidatePath(`/captain/team/${fee.teamId}/match-fees`);
  revalidatePath(`/captain/team/${fee.teamId}/player-payments`);

  redirect(
    getRepairHref({
      saved: "reattached",
      feeId: fee.id,
      user: user.email ?? user.name ?? user.id,
    }),
  );
}

async function recoverSnapshotAction(formData: FormData) {
  "use server";

  await requireAdmin();
  const feeId = getString(formData, "feeId");
  if (!feeId) redirect(getRepairHref({ error: "fee_not_found" }));

  const snapshot = await recoverPlayerMatchFeeSnapshotFromNotifications(feeId);

  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/orphaned-player-fees");

  if (!snapshot?.name && !snapshot?.email && !snapshot?.phone) {
    redirect(getRepairHref({ error: "no_recovery", feeId }));
  }

  redirect(getRepairHref({ saved: "recovered", feeId, user: snapshot.name ?? snapshot.email ?? snapshot.phone }));
}

function getNotice(params: SearchParams) {
  if (params.saved === "reattached") {
    return {
      tone: "success" as const,
      text: `Payment reattached${params.user ? ` to ${params.user}` : ""}.`,
    };
  }

  if (params.saved === "recovered") {
    return {
      tone: "success" as const,
      text: `Original player details recovered${params.user ? `: ${params.user}` : ""}.`,
    };
  }

  switch (params.error) {
    case "missing_details":
      return { tone: "error" as const, text: "Enter a user ID, email address or exact name." };
    case "fee_not_found":
      return { tone: "error" as const, text: "That player fee could not be found." };
    case "already_attached":
      return { tone: "info" as const, text: "That player fee is already attached to a player." };
    case "user_not_found":
      return { tone: "error" as const, text: "No matching user was found." };
    case "duplicate_fee":
      return {
        tone: "error" as const,
        text: "That user already has a fee for this fixture. Do not attach this orphan until the duplicate fee is checked.",
      };
    case "no_recovery":
      return { tone: "error" as const, text: "No old notification recipient was found for that fee." };
    default:
      return null;
  }
}

export default async function OrphanedPlayerFeesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const notice = getNotice(sp);

  const orphanedFees = await prisma.playerMatchFee.findMany({
    where: {
      status: "OPEN",
      teamMemberId: null,
      prospectId: null,
    },
    orderBy: [{ createdAt: "asc" }],
    include: {
      team: { select: { id: true, name: true } },
      fixture: {
        select: {
          id: true,
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  const snapshotByFeeId = await getPlayerMatchFeeSnapshots(orphanedFees.map((fee) => fee.id));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/payments" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
            ← Back to payments
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white">Orphaned player fees</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            These are open player payment rows where the original squad player/prospect link has been lost. If available, SIXFL now shows the saved or recovered player snapshot so historic charges still make sense.
          </p>
        </div>
        <span className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
          {orphanedFees.length} orphaned
        </span>
      </div>

      {notice ? (
        <div
          className={[
            "rounded-2xl border p-4 text-sm",
            notice.tone === "success"
              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
              : notice.tone === "error"
                ? "border-red-400/20 bg-red-500/10 text-red-100"
                : "border-white/10 bg-white/[0.04] text-white/70",
          ].join(" ")}
        >
          {notice.text}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="space-y-3">
          {orphanedFees.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No orphaned open player fees found.
            </div>
          ) : (
            orphanedFees.map((fee) => {
              const fixtureName = `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`;
              const highlighted = sp.feeId === fee.id;
              const snapshot = snapshotByFeeId.get(fee.id);
              const recoveredName = snapshot?.name || snapshot?.email || snapshot?.phone || null;
              const recoveredContact = [snapshot?.email, snapshot?.phone].filter(Boolean).join(" · ");

              return (
                <article
                  key={fee.id}
                  className={[
                    "rounded-2xl border bg-[#0d1428] p-4",
                    highlighted ? "border-amber-400/40" : "border-white/10",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {recoveredName ?? fee.team.name} · {formatMoney(fee.amountPence)}
                      </div>
                      {recoveredContact ? (
                        <div className="mt-1 text-sm text-emerald-100/70">Recovered contact: {recoveredContact}</div>
                      ) : null}
                      <div className="mt-1 text-sm text-white/55">
                        {fee.team.name} · {fixtureName} · {formatFixtureDate(fee.fixture.kickoffAt)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-white/55">
                          Fee ID: {fee.id}
                        </span>
                        <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-red-100">
                          Missing player link
                        </span>
                        {recoveredName ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">
                            Snapshot available
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex w-full max-w-xl flex-col gap-3">
                      {!recoveredName ? (
                        <form action={recoverSnapshotAction} className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
                          <input type="hidden" name="feeId" value={fee.id} />
                          <button
                            type="submit"
                            className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
                          >
                            Recover from old notification
                          </button>
                        </form>
                      ) : null}

                      <form action={attachOrphanedPlayerFeeAction} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <input type="hidden" name="feeId" value={fee.id} />
                        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                          Reattach to user ID / email / exact name
                        </label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            name="userLookup"
                            defaultValue={sp.feeId === fee.id ? sp.user ?? recoveredContact ?? "" : recoveredContact ?? ""}
                            placeholder="e.g. Liam Craig user ID or email"
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40"
                          />
                          <button
                            type="submit"
                            className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Attach fee
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
