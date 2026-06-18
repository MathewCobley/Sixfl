// ========================================
// File: src/app/(admin)/admin/payments/page.tsx
// ========================================

import Link from "next/link";
import { PaymentMethod, PlayerMatchFeeStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { summariseCharge } from "@/lib/payments/charge-status";
import {
  buildChargePaymentUrl,
  cancelQueuedMatchFeeNotificationDispatches,
} from "@/lib/payments/fixture-match-fees";
import {
  ensurePlayerMatchFeePaymentDetails,
  queuePlayerMatchFeeReminder,
} from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Payments | SIXFL",
};

const paymentMethodValues = new Set<PaymentMethod>(Object.values(PaymentMethod));
const ADMIN_CHASE_THRESHOLD_MS = 72 * 60 * 60 * 1000;

function isPaymentMethod(value: string): value is PaymentMethod {
  return paymentMethodValues.has(value as PaymentMethod);
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatAmountInput(amountPence: number) {
  return (amountPence / 100).toFixed(2);
}

function formatDateTimeLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocalInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastChasedLabel(value: Date | null) {
  if (!value) return "Last chased: not chased yet";
  return `Last chased: ${formatFixtureDate(value)}`;
}

function getChargeSortDate(value: Date | null, fallback: Date) {
  return value?.getTime() ?? fallback.getTime();
}

function formatPaymentMethodLabel(method: PaymentMethod) {
  const labels: Record<PaymentMethod, string> = {
    [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
    [PaymentMethod.STRIPE]: "Stripe",
    [PaymentMethod.CASH]: "Cash",
    [PaymentMethod.CARD]: "Card",
    [PaymentMethod.OTHER]: "Other",
  };

  return labels[method];
}

function formatDueLabel(value: Date | null) {
  if (!value) return "No due date";
  return formatDateTimeLabel(value);
}

function getPlayerFeeName(input: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}) {
  if (input.teamMember) {
    return input.teamMember.user.name || input.teamMember.user.email || "Unnamed player";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || input.prospect.email || input.prospect.phone || "Unnamed player";
  }

  return "Unnamed player";
}

function getPlayerFeeContact(input: {
  teamMember: { user: { email: string | null } } | null;
  prospect: { email: string | null; phone: string | null } | null;
}) {
  if (input.teamMember) return input.teamMember.user.email || "No email";
  if (input.prospect) {
    return [input.prospect.email, input.prospect.phone].filter(Boolean).join(" · ") || "No contact";
  }
  return "No contact";
}

const methodOptions = [
  { value: PaymentMethod.BANK_TRANSFER, label: "Bank transfer" },
  { value: PaymentMethod.STRIPE, label: "Stripe" },
  { value: PaymentMethod.CASH, label: "Cash" },
  { value: PaymentMethod.CARD, label: "Card" },
  { value: PaymentMethod.OTHER, label: "Other" },
];

async function createChargeAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountPounds = Number(formData.get("amountPounds") ?? "0");
  const dueDateValue = String(formData.get("dueDate") ?? "").trim();

  if (!teamId || !title || !Number.isFinite(amountPounds) || amountPounds <= 0) {
    redirect("/admin/payments?error=invalid_charge");
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, leagueId: true },
  });

  if (!team) redirect("/admin/payments?error=missing_team");

  await prisma.paymentCharge.create({
    data: {
      teamId,
      leagueId: team.leagueId,
      title,
      description: description || null,
      amountPence: Math.round(amountPounds * 100),
      dueDate: dueDateValue ? new Date(dueDateValue) : null,
    },
  });

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=charge");
}

async function recordPaymentAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "");
  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const amountPounds = Number(formData.get("amountPounds") ?? "0");
  const methodValue = String(formData.get("method") ?? PaymentMethod.BANK_TRANSFER);
  const method = isPaymentMethod(methodValue) ? methodValue : PaymentMethod.BANK_TRANSFER;
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const paidAtValue = String(formData.get("paidAt") ?? "").trim();
  const paidAt = paidAtValue ? new Date(paidAtValue) : new Date();

  if (
    !teamId ||
    !Number.isFinite(amountPounds) ||
    amountPounds <= 0 ||
    Number.isNaN(paidAt.getTime())
  ) {
    redirect("/admin/payments?error=invalid_payment");
  }

  if (chargeId) {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      select: { id: true, teamId: true, status: true },
    });

    if (!charge || charge.teamId !== teamId || charge.status === "PAID" || charge.status === "VOID") {
      redirect("/admin/payments?error=invalid_payment");
    }
  }

  await prisma.paymentTransaction.create({
    data: {
      teamId,
      chargeId: chargeId || null,
      amountPence: Math.round(amountPounds * 100),
      method,
      reference: reference || null,
      notes: notes || null,
      paidAt,
    },
  });

  if (chargeId) {
    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      include: { transactions: { select: { amountPence: true } } },
    });

    if (charge) {
      const summary = summariseCharge({
        amountPence: charge.amountPence,
        transactions: charge.transactions,
      });

      await prisma.paymentCharge.update({
        where: { id: chargeId },
        data: { status: summary.status },
      });

      if (summary.status === "PAID") {
        await cancelQueuedMatchFeeNotificationDispatches([chargeId]);
      }
    }
  }

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=payment");
}

async function sendTeamChargeReminderAction(formData: FormData) {
  "use server";

  const { user } = await requireAdmin();
  const chargeId = String(formData.get("chargeId") ?? "").trim();

  if (!chargeId) redirect("/admin/payments?error=invalid_charge");

  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    include: {
      team: { select: { id: true, name: true } },
      fixture: {
        select: {
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
      transactions: { select: { amountPence: true } },
    },
  });

  if (!charge) redirect("/admin/payments?error=invalid_charge");

  const summary = summariseCharge({
    amountPence: charge.amountPence,
    transactions: charge.transactions,
  });

  if (
    charge.status === "PAID" ||
    charge.status === "VOID" ||
    summary.outstandingPence <= 0 ||
    !charge.paymentToken
  ) {
    redirect("/admin/payments?error=invalid_charge");
  }

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(charge.team.id);
  const fixtureName = charge.fixture
    ? `${charge.fixture.homeTeam.name} vs ${charge.fixture.awayTeam.name}`
    : charge.title;
  const kickoffLabel = charge.fixture?.kickoffAt
    ? formatFixtureDate(charge.fixture.kickoffAt)
    : charge.dueDate
      ? formatDateTimeLabel(charge.dueDate)
      : "TBC";

  await queueNotificationFromTemplate({
    templateKey: "match-fee-reminder-sms",
    recipientId: recipient.id,
    sourceType: "FIXTURE_MATCH_FEE_MANUAL_CHASE",
    sourceId: `${charge.id}:manual-sms:${Date.now()}`,
    metadata: {
      kind: "fixture_match_fee_manual_chase_sms",
      chargeId: charge.id,
      fixtureId: charge.fixtureId,
      teamId: charge.team.id,
      teamName: charge.team.name,
      triggeredFrom: "admin_payments_page",
    },
    variables: {
      firstName: snapshot.primaryContact.name ?? charge.team.name,
      fixtureName,
      kickoffLabel,
      paymentUrl: buildChargePaymentUrl(charge.paymentToken),
      reminderIntro: "Your team match fee is still unpaid.",
    },
    createdByUserId: user?.id ?? null,
  });

  revalidatePath("/admin/payments");
  redirect("/admin/payments?created=team_charge_reminder");
}

async function sendPlayerMatchFeeReminderAction(formData: FormData) {
  "use server";

  await requireAdmin();
  const feeId = String(formData.get("feeId") ?? "").trim();

  if (!feeId) redirect("/admin/payments?error=invalid_player_fee");

  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: feeId },
    select: { id: true, status: true },
  });

  if (!fee || fee.status !== PlayerMatchFeeStatus.OPEN) {
    redirect("/admin/payments?error=invalid_player_fee");
  }

  const modes = ["request", "chase24h", "chase72h"] as const;

  for (const mode of modes) {
    const result = await queuePlayerMatchFeeReminder({ feeId: fee.id, mode });

    if (result.queued > 0) {
      revalidatePath("/admin/payments");
      redirect("/admin/payments?created=player_fee_reminder");
    }

    if (["no_contact", "not_open", "no_payment_url"].includes(result.status)) {
      redirect(`/admin/payments?error=${result.status}`);
    }
  }

  redirect("/admin/payments?created=player_fee_already_sent");
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; error?: string; paymentChargeId?: string }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const [teams, charges, transactions, openPlayerFeesRaw] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: { select: { name: true, season: true } },
      },
    }),
    prisma.paymentCharge.findMany({
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        team: { select: { id: true, name: true } },
        transactions: { select: { amountPence: true } },
      },
    }),
    prisma.paymentTransaction.findMany({
      orderBy: [{ paidAt: "desc" }],
      include: {
        team: { select: { id: true, name: true } },
        charge: { select: { id: true, title: true } },
      },
      take: 20,
    }),
    prisma.playerMatchFee.findMany({
      where: { status: PlayerMatchFeeStatus.OPEN },
      orderBy: [{ createdAt: "asc" }],
      take: 50,
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
        teamMember: {
          select: {
            user: { select: { name: true, email: true } },
          },
        },
        prospect: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
      },
    }),
  ]);

  const playerPaymentDetails = await Promise.all(
    openPlayerFeesRaw.map((fee) => ensurePlayerMatchFeePaymentDetails(fee.id)),
  );
  const playerPaymentDetailsById = new Map(
    playerPaymentDetails.filter(Boolean).map((item) => [item!.id, item!]),
  );
  const openPlayerFees = openPlayerFeesRaw.map((fee) => ({
    ...fee,
    paymentUrl: playerPaymentDetailsById.get(fee.id)?.paymentUrl ?? fee.paymentUrl,
  }));

  const chargeRows = charges
    .map((charge) => {
      const summary = summariseCharge({
        amountPence: charge.amountPence,
        transactions: charge.transactions,
      });
      const isClosed = charge.status === "PAID" || charge.status === "VOID";
      const needsAdminChase =
        !isClosed &&
        summary.outstandingPence > 0 &&
        !!charge.dueDate &&
        charge.dueDate.getTime() + ADMIN_CHASE_THRESHOLD_MS <= Date.now();

      return { charge, summary, needsAdminChase };
    })
    .sort((a, b) => {
      const aOpen = a.charge.status !== "PAID" && a.charge.status !== "VOID";
      const bOpen = b.charge.status !== "PAID" && b.charge.status !== "VOID";
      if (aOpen !== bOpen) return aOpen ? -1 : 1;

      if (a.needsAdminChase !== b.needsAdminChase) return a.needsAdminChase ? -1 : 1;

      const aOutstanding = a.summary.outstandingPence > 0;
      const bOutstanding = b.summary.outstandingPence > 0;
      if (aOutstanding !== bOutstanding) return aOutstanding ? -1 : 1;

      const aDueSort = getChargeSortDate(a.charge.dueDate, a.charge.createdAt);
      const bDueSort = getChargeSortDate(b.charge.dueDate, b.charge.createdAt);
      if (aDueSort !== bDueSort) return aDueSort - bDueSort;

      return a.charge.createdAt.getTime() - b.charge.createdAt.getTime();
    });

  const openChargeRows = chargeRows.filter(
    (row) => row.charge.status !== "PAID" && row.charge.status !== "VOID",
  );
  const openChargeIds = openChargeRows.map((row) => row.charge.id);
  const teamChargeChases = openChargeIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: "FIXTURE_MATCH_FEE_MANUAL_CHASE",
          OR: openChargeIds.map((chargeId) => ({
            OR: [
              { sourceId: { startsWith: `${chargeId}:manual-sms:` } },
              { metadata: { path: ["chargeId"], equals: chargeId } },
            ],
          })),
        },
        select: {
          id: true,
          sourceId: true,
          metadata: true,
          createdAt: true,
          scheduledFor: true,
          sentAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : [];

  const lastTeamChargeChaseByChargeId = new Map<string, Date>();
  for (const dispatch of teamChargeChases) {
    const metadata =
      dispatch.metadata && typeof dispatch.metadata === "object" && !Array.isArray(dispatch.metadata)
        ? (dispatch.metadata as Record<string, unknown>)
        : null;
    const chargeIdFromMetadata =
      typeof metadata?.chargeId === "string" ? metadata.chargeId : null;
    const chargeIdFromSource = openChargeIds.find((chargeId) =>
      dispatch.sourceId?.startsWith(`${chargeId}:manual-sms:`),
    );
    const chargeId = chargeIdFromMetadata ?? chargeIdFromSource;
    if (!chargeId) continue;
    const chasedAt = dispatch.sentAt ?? dispatch.scheduledFor ?? dispatch.createdAt;
    const existing = lastTeamChargeChaseByChargeId.get(chargeId);
    if (!existing || chasedAt > existing) lastTeamChargeChaseByChargeId.set(chargeId, chasedAt);
  }

  const teamChargeOutstanding = openChargeRows.reduce(
    (sum, row) => sum + row.summary.outstandingPence,
    0,
  );
  const playerFeeOutstanding = openPlayerFees.reduce(
    (sum, fee) => sum + fee.amountPence,
    0,
  );
  const totalOutstanding = teamChargeOutstanding + playerFeeOutstanding;
  const needsAdminChaseCount = chargeRows.filter((row) => row.needsAdminChase).length;

  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: team.league?.name
      ? `${team.name} · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}`
      : team.name,
  }));
  const openChargeOptions = openChargeRows.map((row) => ({
    value: row.charge.id,
    label: `${row.charge.team.name} · ${row.charge.title} · ${formatMoney(row.summary.outstandingPence)}`,
  }));

  const selectedPaymentChargeId = String(sp.paymentChargeId ?? "").trim();
  const selectedPaymentChargeRow =
    openChargeRows.find((row) => row.charge.id === selectedPaymentChargeId) ?? null;
  const recordPaymentTeamId = selectedPaymentChargeRow?.charge.teamId ?? "";
  const recordPaymentChargeId = selectedPaymentChargeRow?.charge.id ?? "";
  const recordPaymentAmount = selectedPaymentChargeRow
    ? formatAmountInput(selectedPaymentChargeRow.summary.outstandingPence)
    : "";
  const recordPaymentHelpText = selectedPaymentChargeRow
    ? `Ready to record a payment against ${selectedPaymentChargeRow.charge.team.name} · ${selectedPaymentChargeRow.charge.title}. The amount has been set to the outstanding balance.`
    : "Select a team and link an open charge to record a payment against it.";
  const defaultPaidAt = formatDateTimeLocalInput(new Date());

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Payments</h1>
        <p className="text-sm text-white/60">
          Create charges, record payments, chase outstanding player fees, and keep on top of unpaid balances.
        </p>
      </div>

      {(sp.created || sp.error) ? (
        <div className="space-y-1 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.created === "charge" ? <div className="text-emerald-300">Charge created.</div> : null}
          {sp.created === "payment" ? <div className="text-emerald-300">Payment recorded.</div> : null}
          {sp.created === "team_charge_reminder" ? <div className="text-emerald-300">Team charge SMS queued.</div> : null}
          {sp.created === "player_fee_reminder" ? <div className="text-emerald-300">Player fee reminder queued.</div> : null}
          {sp.created === "player_fee_already_sent" ? <div className="text-amber-200">All player fee reminder stages have already been queued or sent.</div> : null}
          {sp.created === "charge_voided" ? <div className="text-emerald-300">Charge voided.</div> : null}
          {sp.error === "invalid_charge" ? <div className="text-red-300">Charge details are incomplete.</div> : null}
          {sp.error === "missing_team" ? <div className="text-red-300">Selected team was not found.</div> : null}
          {sp.error === "invalid_payment" ? <div className="text-red-300">Payment details are incomplete.</div> : null}
          {sp.error === "invalid_player_fee" || sp.error === "not_open" ? <div className="text-red-300">That player fee cannot be chased.</div> : null}
          {sp.error === "no_contact" ? <div className="text-red-300">No contact details were found for that player.</div> : null}
          {sp.error === "no_payment_url" ? <div className="text-red-300">A payment link could not be created for that player fee.</div> : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Open items</div>
          <div className="mt-3 text-3xl font-semibold text-white">{openChargeRows.length + openPlayerFees.length}</div>
          <p className="mt-2 text-sm text-white/50">Team charges + player fees.</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">Outstanding</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatMoney(totalOutstanding)}</div>
          <p className="mt-2 text-sm text-amber-100/75">Includes {formatMoney(playerFeeOutstanding)} from player fees.</p>
        </div>
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-100/70">Needs admin chase</div>
          <div className="mt-3 text-3xl font-semibold text-white">{needsAdminChaseCount}</div>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Recent payments</div>
          <div className="mt-3 text-3xl font-semibold text-white">{transactions.length}</div>
        </div>
      </div>
