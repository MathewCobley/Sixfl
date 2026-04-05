// ========================================
// File: src/app/captain/team/[teamid]/payments/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  PaymentChargeStatus,
  PaymentChargeType,
  PaymentMethod,
  PaymentTransactionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Captain Payments | SIXFL",
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatDate(date: Date | null) {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function computeDisplayStatus({
  status,
  dueAt,
  outstanding,
}: {
  status: PaymentChargeStatus;
  dueAt: Date | null;
  outstanding: number;
}) {
  if (status === PaymentChargeStatus.WAIVED) return "Waived";
  if (status === PaymentChargeStatus.VOID) return "Void";
  if (outstanding <= 0) return "Paid";
  if (dueAt && dueAt < new Date()) return "Overdue";
  if (status === PaymentChargeStatus.PARTIAL) return "Partial";
  return "Unpaid";
}

async function createCharge(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const target = String(formData.get("target") ?? "all");
  const description = String(formData.get("description") ?? "").trim();
  const amountPence = Number(formData.get("amountPence") ?? 0);
  const dueAtValue = String(formData.get("dueAt") ?? "");
  const chargeType = String(formData.get("chargeType") ?? PaymentChargeType.OTHER) as PaymentChargeType;
  const note = String(formData.get("note") ?? "").trim();

  await requireCaptain(teamid);

  if (!description || !Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("Description and a positive amount are required.");
  }

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    include: {
      league: { select: { season: true } },
      members: {
        where: { isActive: true, isPayable: true },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!team) throw new Error("Team not found.");

  const members = target === "all"
    ? team.members
    : team.members.filter((member) => member.userId === target);

  if (members.length === 0) {
    throw new Error("No payable members matched the selected target.");
  }

  const batchId = members.length > 1 ? crypto.randomUUID() : null;
  const dueAt = dueAtValue ? new Date(`${dueAtValue}T12:00:00.000Z`) : null;

  await prisma.paymentCharge.createMany({
    data: members.map((member) => ({
      teamId: teamid,
      playerUserId: member.userId,
      playerNameSnapshot: member.user.name?.trim() || member.user.email || "Unnamed player",
      seasonLabel: team.league?.season ?? null,
      description,
      chargeType,
      amountPence,
      dueAt,
      batchId,
      note: note || null,
    })),
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/payments`);
}

async function recordPayment(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const playerUserId = String(formData.get("playerUserId") ?? "");
  const amountPence = Number(formData.get("amountPence") ?? 0);
  const paidAtValue = String(formData.get("paidAt") ?? "");
  const method = String(formData.get("method") ?? PaymentMethod.BANK_TRANSFER) as PaymentMethod;
  const note = String(formData.get("note") ?? "").trim();

  await requireCaptain(teamid);

  if (!playerUserId || !Number.isInteger(amountPence) || amountPence <= 0) {
    throw new Error("Player and a positive amount are required.");
  }

  const player = await prisma.teamMember.findFirst({
    where: { teamId: teamid, userId: playerUserId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!player) {
    throw new Error("Player not found for this team.");
  }

  const charges = await prisma.paymentCharge.findMany({
    where: {
      teamId: teamid,
      playerUserId,
      status: {
        notIn: [PaymentChargeStatus.WAIVED, PaymentChargeStatus.VOID, PaymentChargeStatus.PAID],
      },
    },
    include: { allocations: true },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });

  const outstandingRows = charges
    .map((charge) => {
      const allocated = charge.allocations.reduce((sum, row) => sum + row.amountPence, 0);
      return {
        charge,
        outstanding: Math.max(charge.amountPence - allocated, 0),
      };
    })
    .filter((row) => row.outstanding > 0);

  const totalOutstanding = outstandingRows.reduce((sum, row) => sum + row.outstanding, 0);

  if (amountPence > totalOutstanding) {
    throw new Error("Payment exceeds the player outstanding balance.");
  }

  const payment = await prisma.paymentTransaction.create({
    data: {
      teamId: teamid,
      playerUserId,
      playerNameSnapshot: player.user.name?.trim() || player.user.email || "Unnamed player",
      amountPence,
      paidAt: paidAtValue ? new Date(paidAtValue) : new Date(),
      method,
      note: note || null,
      status: PaymentTransactionStatus.RECORDED,
    },
  });

  let remaining = amountPence;

  for (const row of outstandingRows) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, row.outstanding);

    await prisma.paymentAllocation.create({
      data: {
        paymentTransactionId: payment.id,
        paymentChargeId: row.charge.id,
        amountPence: applied,
      },
    });

    const newOutstanding = row.outstanding - applied;

    await prisma.paymentCharge.update({
      where: { id: row.charge.id },
      data: {
        status:
          newOutstanding <= 0
            ? PaymentChargeStatus.PAID
            : PaymentChargeStatus.PARTIAL,
      },
    });

    remaining -= applied;
  }

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/payments`);
}

export default async function CaptainPaymentsPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    include: {
      league: { select: { season: true } },
      members: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!team) notFound();

  const [charges, transactions] = await Promise.all([
    prisma.paymentCharge.findMany({
      where: { teamId: teamid },
      include: { allocations: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.paymentTransaction.findMany({
      where: { teamId: teamid },
      include: { allocations: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const chargeRows = charges.map((charge) => {
    const allocated = charge.allocations.reduce((sum, row) => sum + row.amountPence, 0);
    const outstanding = Math.max(charge.amountPence - allocated, 0);
    return {
      charge,
      allocated,
      outstanding,
      displayStatus: computeDisplayStatus({
        status: charge.status,
        dueAt: charge.dueAt,
        outstanding,
      }),
    };
  });

  const summary = {
    outstandingPence: chargeRows.reduce((sum, row) => sum + row.outstanding, 0),
    overduePence: chargeRows
      .filter((row) => row.outstanding > 0 && row.charge.dueAt && row.charge.dueAt < new Date())
      .reduce((sum, row) => sum + row.outstanding, 0),
    collectedPence: transactions.reduce((sum, row) => sum + row.amountPence, 0),
    unpaidPlayers: new Set(
      chargeRows.filter((row) => row.outstanding > 0).map((row) => row.charge.playerNameSnapshot),
    ).size,
  };

  const balances = Array.from(
    chargeRows.reduce((map, row) => {
      const key = row.charge.playerUserId ?? row.charge.playerNameSnapshot;
      const existing = map.get(key) ?? {
        label: row.charge.playerNameSnapshot,
        charged: 0,
        outstanding: 0,
        overdue: 0,
      };
      existing.charged += row.charge.amountPence;
      existing.outstanding += row.outstanding;
      if (row.outstanding > 0 && row.charge.dueAt && row.charge.dueAt < new Date()) {
        existing.overdue += row.outstanding;
      }
      map.set(key, existing);
      return map;
    }, new Map<string, { label: string; charged: number; outstanding: number; overdue: number }>()).values(),
  ).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Page title</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Payments</h1>
        <p className="mt-2 text-sm text-white/65">
          Track charges, record payments, and monitor outstanding balances for {team.name}.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/55">Outstanding</p>
          <p className="mt-2 text-3xl font-semibold">{formatMoney(summary.outstandingPence)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/55">Overdue</p>
          <p className="mt-2 text-3xl font-semibold">{formatMoney(summary.overduePence)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/55">Collected</p>
          <p className="mt-2 text-3xl font-semibold">{formatMoney(summary.collectedPence)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/55">Players unpaid</p>
          <p className="mt-2 text-3xl font-semibold">{summary.unpaidPlayers}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={createCharge} className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <input type="hidden" name="teamid" value={team.id} />
          <h2 className="text-xl font-semibold">Create charge</h2>
          <div className="mt-4 grid gap-3">
            <select name="target" defaultValue="all" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none">
              <option value="all">Whole team</option>
              {team.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name?.trim() || member.user.email || member.userId}
                </option>
              ))}
            </select>
            <select name="chargeType" defaultValue={PaymentChargeType.SUBS} className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none">
              <option value={PaymentChargeType.REGISTRATION}>Registration</option>
              <option value={PaymentChargeType.SUBS}>Subs</option>
              <option value={PaymentChargeType.MATCH_FEE}>Match fee</option>
              <option value={PaymentChargeType.FINE}>Fine</option>
              <option value={PaymentChargeType.OTHER}>Other</option>
            </select>
            <input type="text" name="description" placeholder="Description" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
            <input type="number" name="amountPence" min="1" placeholder="Amount in pence (e.g. 2500)" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
            <input type="date" name="dueAt" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
            <textarea name="note" rows={3} placeholder="Optional note" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
          </div>
          <button type="submit" className="mt-4 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">
            Create charge
          </button>
        </form>

        <form action={recordPayment} className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <input type="hidden" name="teamid" value={team.id} />
          <h2 className="text-xl font-semibold">Record payment</h2>
          <div className="mt-4 grid gap-3">
            <select name="playerUserId" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none">
              {team.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name?.trim() || member.user.email || member.userId}
                </option>
              ))}
            </select>
            <input type="number" name="amountPence" min="1" placeholder="Amount in pence" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
            <input type="datetime-local" name="paidAt" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
            <select name="method" defaultValue={PaymentMethod.BANK_TRANSFER} className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none">
              <option value={PaymentMethod.CASH}>Cash</option>
              <option value={PaymentMethod.BANK_TRANSFER}>Bank transfer</option>
              <option value={PaymentMethod.CARD}>Card</option>
              <option value={PaymentMethod.OTHER}>Other</option>
            </select>
            <textarea name="note" rows={3} placeholder="Optional note" className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
          </div>
          <button type="submit" className="mt-4 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">
            Record payment
          </button>
        </form>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Balances</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="pb-3 pr-4">Player</th>
                <th className="pb-3 pr-4">Charged</th>
                <th className="pb-3 pr-4">Outstanding</th>
                <th className="pb-3 pr-4">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => (
                <tr key={row.label} className="border-t border-white/10">
                  <td className="py-3 pr-4">{row.label}</td>
                  <td className="py-3 pr-4 text-white/75">{formatMoney(row.charged)}</td>
                  <td className="py-3 pr-4 text-white/75">{formatMoney(row.outstanding)}</td>
                  <td className="py-3 pr-4 text-white/75">{formatMoney(row.overdue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Charges</h2>
        <div className="mt-4 space-y-3">
          {chargeRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/60">
              No charges created yet.
            </div>
          ) : (
            chargeRows.map((row) => (
              <div key={row.charge.id} className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium">{row.charge.playerNameSnapshot}</p>
                    <p className="mt-1 text-sm text-white/60">{row.charge.description}</p>
                    <p className="mt-1 text-xs text-white/50">
                      Due {formatDate(row.charge.dueAt)} · {row.charge.chargeType.toLowerCase().replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatMoney(row.charge.amountPence)}</p>
                    <p className="mt-1 text-sm text-white/60">Outstanding {formatMoney(row.outstanding)}</p>
                    <p className="mt-1 text-xs text-white/50">{row.displayStatus}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Recent payments</h2>
        <div className="mt-4 space-y-3">
          {transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/60">
              No payments recorded yet.
            </div>
          ) : (
            transactions.map((payment) => (
              <div key={payment.id} className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium">{payment.playerNameSnapshot}</p>
                    <p className="mt-1 text-sm text-white/60">
                      {formatDate(payment.paidAt)} · {payment.method.toLowerCase().replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatMoney(payment.amountPence)}</p>
                    <p className="mt-1 text-xs text-white/50">{payment.note ?? "No note"}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
