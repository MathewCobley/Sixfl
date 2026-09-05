// ========================================
// File: src/app/(admin)/admin/payments/page.tsx
// ========================================

import Link from "next/link";
import { PaymentChargeStatus, PaymentMethod, PlayerMatchFeeStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { summariseChargesWithPlayerMatchFees } from "@/lib/payments/charge-summary";
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

type PaymentsViewFilter = "none" | "all" | "playerFees" | "teamCharges" | "recentPayments";
type PaymentsActionFilter = "none" | "createCharge" | "recordPayment";

type PaymentsSearchParams = {
  created?: string;
  error?: string;
  paymentChargeId?: string;
  q?: string;
  leagueId?: string;
  teamId?: string;
  view?: string;
  limit?: string;
  action?: string;
};

const paymentMethodValues = new Set<PaymentMethod>(Object.values(PaymentMethod));
const ADMIN_CHASE_THRESHOLD_MS = 72 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 10;
const LIST_LIMIT_OPTIONS = [10, 25, 50, 100];
const VIEW_OPTIONS: Array<{ value: PaymentsViewFilter; label: string }> = [
  { value: "none", label: "Choose a payment list" },
  { value: "all", label: "All payment lists" },
  { value: "playerFees", label: "Player fees only" },
  { value: "teamCharges", label: "Team charges only" },
  { value: "recentPayments", label: "Recent payments only" },
];
const ACTION_OPTIONS: Array<{ value: PaymentsActionFilter; label: string; description: string }> = [
  { value: "none", label: "No form open", description: "Keep charge and payment forms hidden." },
  { value: "createCharge", label: "Create charge", description: "Open the form to add a new team charge." },
  { value: "recordPayment", label: "Record payment", description: "Open the form to record a team payment." },
];

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
  if (!value) return "Last request/chase: not sent yet";
  return `Last request/chase: ${formatFixtureDate(value)}`;
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

function formatChargeStatusLabel(status: string) {
  if (status === "PART_PAID") return "PART PAID";
  return status.replaceAll("_", " ");
}

function isChargeDisplayClosed(status: string) {
  return status === "PAID" || status === "VOID";
}

function getChargeKey(input: { teamId: string; fixtureId: string | null }) {
  return input.fixtureId ? `${input.teamId}:${input.fixtureId}` : null;
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

function isPlayerFeePaymentNotes(value: string | null) {
  const notes = value?.toLowerCase() ?? "";
  return notes.includes("player match fee paid online") || notes.includes("player fee id:");
}

function normaliseSearch(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesSearch(search: string, values: Array<string | number | Date | null | undefined>) {
  if (!search) return true;

  return values.some((value) => {
    if (value === null || value === undefined) return false;
    const text = value instanceof Date ? formatDateTimeLabel(value) : String(value);
    return normaliseSearch(text).includes(search);
  });
}

function parseViewFilter(value: string | undefined): PaymentsViewFilter {
  if (value === "all" || value === "playerFees" || value === "teamCharges" || value === "recentPayments") {
    return value;
  }

  return "none";
}

function parseActionFilter(value: string | undefined): PaymentsActionFilter {
  if (value === "createCharge" || value === "recordPayment") return value;
  return "none";
}

function parseListLimit(value: string | undefined) {
  const parsed = Number(value);
  return LIST_LIMIT_OPTIONS.includes(parsed) ? parsed : DEFAULT_LIST_LIMIT;
}

function buildFilterQuery(input: {
  q: string;
  leagueId: string;
  teamId: string;
  view: PaymentsViewFilter;
  limit: number;
  action?: PaymentsActionFilter;
  paymentChargeId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.leagueId) params.set("leagueId", input.leagueId);
  if (input.teamId) params.set("teamId", input.teamId);
  if (input.view !== "none") params.set("view", input.view);
  if (input.limit !== DEFAULT_LIST_LIMIT) params.set("limit", String(input.limit));
  if (input.action && input.action !== "none") params.set("action", input.action);
  if (input.paymentChargeId) params.set("paymentChargeId", input.paymentChargeId);
  const query = params.toString();
  return query ? `/admin/payments?${query}` : "/admin/payments";
}

const methodOptions = [
  { value: PaymentMethod.BANK_TRANSFER, label: "Bank transfer" },
  { value: PaymentMethod.STRIPE, label: "Stripe" },
  { value: PaymentMethod.CASH, label: "Cash" },
  { value: PaymentMethod.CARD, label: "Card" },
  { value: PaymentMethod.OTHER, label: "Other" },
];

async function getChargeSummaryWithPlayerPayments(chargeId: string) {
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId },
    include: {
      transactions: { select: { amountPence: true, notes: true } },
    },
  });

  if (!charge) return null;

  const paidPlayerMatchFees = charge.fixtureId
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: charge.teamId,
          fixtureId: charge.fixtureId,
          status: PlayerMatchFeeStatus.PAID,
        },
        select: { fixtureId: true, amountPence: true },
      })
    : [];

  const [summary] = summariseChargesWithPlayerMatchFees([charge], paidPlayerMatchFees);

  if (!summary) return null;

  return { charge, summary };
}

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
    const existing = await getChargeSummaryWithPlayerPayments(chargeId);

    if (
      !existing ||
      existing.charge.teamId !== teamId ||
      isChargeDisplayClosed(existing.summary.displayStatus)
    ) {
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
    const refreshed = await getChargeSummaryWithPlayerPayments(chargeId);

    if (refreshed) {
      const nextStatus = refreshed.summary.displayStatus as PaymentChargeStatus;

      await prisma.paymentCharge.update({
        where: { id: chargeId },
        data: { status: nextStatus },
      });

      if (nextStatus === PaymentChargeStatus.PAID) {
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
      transactions: { select: { amountPence: true, notes: true } },
    },
  });

  if (!charge) redirect("/admin/payments?error=invalid_charge");

  const paidPlayerMatchFees = charge.fixtureId
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: charge.teamId,
          fixtureId: charge.fixtureId,
          status: PlayerMatchFeeStatus.PAID,
        },
        select: { fixtureId: true, amountPence: true },
      })
    : [];
  const [summary] = summariseChargesWithPlayerMatchFees([charge], paidPlayerMatchFees);

  if (
    !summary ||
    isChargeDisplayClosed(summary.displayStatus) ||
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
      reminderIntro: `Your team match fee still has ${formatMoney(summary.outstandingPence)} outstanding.`,
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
  searchParams?: Promise<PaymentsSearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const searchQuery = String(sp.q ?? "").trim();
  const normalisedQuery = normaliseSearch(searchQuery);
  const selectedLeagueId = String(sp.leagueId ?? "").trim();
  const selectedTeamId = String(sp.teamId ?? "").trim();
  const selectedView = parseViewFilter(sp.view);
  const listLimit = parseListLimit(sp.limit);
  const selectedPaymentChargeId = String(sp.paymentChargeId ?? "").trim();
  const selectedActionFromUrl = parseActionFilter(sp.action);
  const selectedAction = selectedActionFromUrl === "none" && selectedPaymentChargeId ? "recordPayment" : selectedActionFromUrl;
  const hasFilters = Boolean(
    searchQuery ||
      selectedLeagueId ||
      selectedTeamId ||
      selectedView !== "none" ||
      selectedAction !== "none" ||
      selectedPaymentChargeId ||
      listLimit !== DEFAULT_LIST_LIMIT,
  );

  const [teams, charges, transactions, openPlayerFeesRaw, paidPlayerMatchFees] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: { select: { id: true, name: true, season: true } },
      },
    }),
    prisma.paymentCharge.findMany({
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        team: { select: { id: true, name: true } },
        transactions: { select: { amountPence: true, notes: true } },
      },
    }),
    prisma.paymentTransaction.findMany({
      orderBy: [{ paidAt: "desc" }],
      include: {
        team: { select: { id: true, name: true } },
        charge: { select: { id: true, title: true } },
      },
      take: 150,
    }),
    prisma.playerMatchFee.findMany({
      where: { status: PlayerMatchFeeStatus.OPEN },
      orderBy: [{ createdAt: "asc" }],
      take: 300,
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
    prisma.playerMatchFee.findMany({
      where: { status: PlayerMatchFeeStatus.PAID },
      select: {
        teamId: true,
        fixtureId: true,
        amountPence: true,
      },
    }),
  ]);

  const teamLeagueById = new Map(teams.map((team) => [team.id, team.league?.id ?? null]));
  const leagueOptionsById = new Map<string, string>();

  for (const team of teams) {
    if (!team.league?.id) continue;
    leagueOptionsById.set(
      team.league.id,
      `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`,
    );
  }

  const leagueOptions = Array.from(leagueOptionsById, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const visibleTeamOptions = selectedLeagueId
    ? teams.filter((team) => team.league?.id === selectedLeagueId)
    : teams;
  const matchesSelectedLeague = (teamId: string) => !selectedLeagueId || teamLeagueById.get(teamId) === selectedLeagueId;

  const paidPlayerMatchFeesByTeamId = new Map<string, typeof paidPlayerMatchFees>();
  for (const fee of paidPlayerMatchFees) {
    const existing = paidPlayerMatchFeesByTeamId.get(fee.teamId) ?? [];
    existing.push(fee);
    paidPlayerMatchFeesByTeamId.set(fee.teamId, existing);
  }

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
      const teamPaidFees = paidPlayerMatchFeesByTeamId.get(charge.teamId) ?? [];
      const [summary] = summariseChargesWithPlayerMatchFees([charge], teamPaidFees);

      if (!summary) {
        throw new Error(`Unable to summarise payment charge ${charge.id}.`);
      }

      const isClosed = isChargeDisplayClosed(summary.displayStatus);
      const needsAdminChase =
        !isClosed &&
        summary.outstandingPence > 0 &&
        !!charge.dueDate &&
        charge.dueDate.getTime() + ADMIN_CHASE_THRESHOLD_MS <= Date.now();

      return { charge, summary, needsAdminChase };
    })
    .sort((a, b) => {
      const aOpen = !isChargeDisplayClosed(a.summary.displayStatus) && a.summary.outstandingPence > 0;
      const bOpen = !isChargeDisplayClosed(b.summary.displayStatus) && b.summary.outstandingPence > 0;
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
    (row) => !isChargeDisplayClosed(row.summary.displayStatus) && row.summary.outstandingPence > 0,
  );
  const chargeKeysWithLedgerRows = new Set(
    chargeRows
      .map((row) => getChargeKey({ teamId: row.charge.teamId, fixtureId: row.charge.fixtureId }))
      .filter(Boolean) as string[],
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
    const chargeIdFromMetadata = typeof metadata?.chargeId === "string" ? metadata.chargeId : null;
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
  const playerFeeOutstanding = openPlayerFees.reduce((sum, fee) => sum + fee.amountPence, 0);
  const standalonePlayerFeeOutstanding = openPlayerFees.reduce((sum, fee) => {
    const hasLedgerCharge = chargeKeysWithLedgerRows.has(getChargeKey({ teamId: fee.teamId, fixtureId: fee.fixtureId }) ?? "");
    return hasLedgerCharge ? sum : sum + fee.amountPence;
  }, 0);
  const totalOutstanding = teamChargeOutstanding + standalonePlayerFeeOutstanding;
  const needsAdminChaseCount = chargeRows.filter((row) => row.needsAdminChase).length;

  const filteredOpenPlayerFees = openPlayerFees.filter((fee) => {
    const playerName = getPlayerFeeName({ teamMember: fee.teamMember, prospect: fee.prospect });
    const playerContact = getPlayerFeeContact({ teamMember: fee.teamMember, prospect: fee.prospect });
    const fixtureName = `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`;

    return (
      matchesSelectedLeague(fee.teamId) &&
      (!selectedTeamId || fee.teamId === selectedTeamId) &&
      matchesSearch(normalisedQuery, [
        playerName,
        playerContact,
        fee.team.name,
        fixtureName,
        fee.fixture.kickoffAt,
        fee.amountPence / 100,
      ])
    );
  });

  const filteredChargeRows = chargeRows.filter((row) =>
    matchesSelectedLeague(row.charge.teamId) &&
    (!selectedTeamId || row.charge.teamId === selectedTeamId) &&
    matchesSearch(normalisedQuery, [
      row.charge.team.name,
      row.charge.title,
      row.charge.description,
      row.charge.status,
      row.summary.displayStatus,
      row.summary.outstandingPence / 100,
      row.charge.dueDate,
    ]),
  );

  const filteredTransactions = transactions.filter((payment) =>
    matchesSelectedLeague(payment.teamId) &&
    (!selectedTeamId || payment.teamId === selectedTeamId) &&
    matchesSearch(normalisedQuery, [
      payment.team.name,
      payment.charge?.title,
      payment.notes,
      payment.reference,
      formatPaymentMethodLabel(payment.method),
      payment.amountPence / 100,
      payment.paidAt,
    ]),
  );

  const visibleOpenPlayerFees = filteredOpenPlayerFees.slice(0, listLimit);
  const visibleChargeRows = filteredChargeRows.slice(0, listLimit);
  const visibleTransactions = filteredTransactions.slice(0, listLimit);
  const filteredPlayerFeeOutstanding = filteredOpenPlayerFees.reduce((sum, fee) => sum + fee.amountPence, 0);
  const showPlayerFees = selectedView === "all" || selectedView === "playerFees";
  const showTeamCharges = selectedView === "all" || selectedView === "teamCharges";
  const showRecentPayments = selectedView === "all" || selectedView === "recentPayments";

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

  const selectedPaymentChargeRow =
    openChargeRows.find((row) => row.charge.id === selectedPaymentChargeId) ?? null;
  const recordPaymentTeamId = selectedPaymentChargeRow?.charge.teamId ?? "";
  const recordPaymentChargeId = selectedPaymentChargeRow?.charge.id ?? "";
  const recordPaymentAmount = selectedPaymentChargeRow
    ? formatAmountInput(selectedPaymentChargeRow.summary.outstandingPence)
    : "";
  const recordPaymentHelpText = selectedPaymentChargeRow
    ? `Ready to record a payment against ${selectedPaymentChargeRow.charge.team.name} · ${selectedPaymentChargeRow.charge.title}. The amount has been set to the outstanding balance after squad payments.`
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
          {sp.created === "player_fee_already_sent" ? (
            <div className="text-amber-200">All player fee reminder stages have already been queued or sent.</div>
          ) : null}
          {sp.created === "charge_voided" ? <div className="text-emerald-300">Charge voided.</div> : null}
          {sp.error === "invalid_charge" ? <div className="text-red-300">Charge details are incomplete.</div> : null}
          {sp.error === "missing_team" ? <div className="text-red-300">Selected team was not found.</div> : null}
          {sp.error === "invalid_payment" ? <div className="text-red-300">Payment details are incomplete.</div> : null}
          {sp.error === "invalid_player_fee" || sp.error === "not_open" ? (
            <div className="text-red-300">That player fee cannot be chased.</div>
          ) : null}
          {sp.error === "no_contact" ? <div className="text-red-300">No contact details were found for that player.</div> : null}
          {sp.error === "no_payment_url" ? (
            <div className="text-red-300">A payment link could not be created for that player fee.</div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Open items</div>
          <div className="mt-3 text-3xl font-semibold text-white">{openChargeRows.length + openPlayerFees.length}</div>
          <p className="mt-2 text-sm text-white/50">Team charges + player payment links.</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">Outstanding</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatMoney(totalOutstanding)}</div>
          <p className="mt-2 text-sm text-amber-100/75">
            Team charge balances now include paid squad payments.
          </p>
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

      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Payment list selector</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Choose what payment list to show</h2>
            <p className="mt-2 text-sm text-sky-50/70">
              No payment rows are shown until you choose a list. Narrow by league, team, player, email, fixture or reference.
            </p>
          </div>

          {hasFilters ? (
            <Link href="/admin/payments" className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-semibold text-white/75 transition hover:bg-black/35">
              Reset page
            </Link>
          ) : null}
        </div>

        <form method="get" action="/admin/payments" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr_0.65fr_auto]">
          {selectedAction !== "none" ? <input type="hidden" name="action" value={selectedAction} /> : null}
          {selectedPaymentChargeId ? <input type="hidden" name="paymentChargeId" value={selectedPaymentChargeId} /> : null}

          <label className="space-y-1.5 text-sm font-semibold text-white">
            Search
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="Player, team, email, fixture, reference..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-300/50"
            />
          </label>

          <label className="space-y-1.5 text-sm font-semibold text-white">
            League
            <select name="leagueId" defaultValue={selectedLeagueId} className="h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-sky-300/50">
              <option value="">All leagues</option>
              {leagueOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm font-semibold text-white">
            Team
            <select name="teamId" defaultValue={selectedTeamId} className="h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-sky-300/50">
              <option value="">All teams</option>
              {visibleTeamOptions.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm font-semibold text-white">
            Show
            <select name="view" defaultValue={selectedView} className="h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-sky-300/50">
              {VIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm font-semibold text-white">
            Rows
            <select name="limit" defaultValue={String(listLimit)} className="h-12 w-full rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-sky-300/50">
              {LIST_LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-sky-300 px-5 text-sm font-semibold text-black transition hover:bg-sky-200 xl:self-end">
            Apply
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-sky-50/75">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Matching player fees: {filteredOpenPlayerFees.length}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Matching team charges: {filteredChargeRows.length}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Matching recent payments: {filteredTransactions.length}</span>
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/70">Payment actions</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Choose an admin action</h2>
            <p className="mt-2 text-sm text-emerald-50/70">
              Create charge and Record payment are hidden until selected, so the page stays clear.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {ACTION_OPTIONS.map((option) => {
              const href = buildFilterQuery({
                q: searchQuery,
                leagueId: selectedLeagueId,
                teamId: selectedTeamId,
                view: selectedView,
                limit: listLimit,
                action: option.value,
                paymentChargeId: option.value === "recordPayment" ? selectedPaymentChargeId : null,
              });
              const active = selectedAction === option.value;

              return (
                <Link
                  key={option.value}
                  href={href}
                  className={[
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    active
                      ? "border-emerald-300/35 bg-emerald-400/20 text-emerald-50"
                      : "border-white/10 bg-black/25 text-white/70 hover:bg-black/35 hover:text-white",
                  ].join(" ")}
                  title={option.description}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {selectedView === "none" ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm leading-6 text-white/60">
          Choose a payment list above to show player fees, team charges or recent payments.
        </section>
      ) : null}

      {showPlayerFees ? (
        <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70">Player match fees</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{formatMoney(filteredPlayerFeeOutstanding)} pending from players</h2>
              <p className="mt-2 max-w-3xl text-sm text-white/65">
                Showing {visibleOpenPlayerFees.length} of {filteredOpenPlayerFees.length} matching open player fees.
              </p>
            </div>
            <span className="rounded-2xl border border-amber-400/25 bg-black/20 px-4 py-3 text-sm font-semibold text-amber-100">
              {filteredOpenPlayerFees.length} open player fee{filteredOpenPlayerFees.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {filteredOpenPlayerFees.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">No open player fees match the current filters.</div>
            ) : null}

            {visibleOpenPlayerFees.map((fee) => {
              const playerName = getPlayerFeeName({ teamMember: fee.teamMember, prospect: fee.prospect });
              const playerContact = getPlayerFeeContact({ teamMember: fee.teamMember, prospect: fee.prospect });
              const fixtureName = `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`;

              return (
                <div key={fee.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-semibold text-white">{playerName} · {formatMoney(fee.amountPence)}</div>
                      <div className="mt-1 text-sm text-white/55">{fee.team.name} · {fixtureName} · {formatFixtureDate(fee.fixture.kickoffAt)}</div>
                      <div className="mt-1 text-xs text-white/40">{playerContact}</div>
                      <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${fee.lastChasedAt ? "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100" : "border-white/10 bg-white/5 text-white/55"}`}>
                        {formatLastChasedLabel(fee.lastChasedAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Link href={`/captain/team/${fee.team.id}/match-fees?fixtureId=${fee.fixture.id}`} className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10">Open team fees</Link>
                      {fee.paymentUrl ? <Link href={fee.paymentUrl} className="inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15">Payment link</Link> : null}
                      <form action={sendPlayerMatchFeeReminderAction}>
                        <input type="hidden" name="feeId" value={fee.id} />
                        <button type="submit" className="inline-flex items-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2.5 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/15">Chase player</button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedAction !== "none" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {selectedAction === "createCharge" ? (
            <form action={createChargeAction} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-xl font-semibold text-white">Create charge</h2>
              <div className="mt-4 space-y-4">
                <FormListboxField name="teamId" options={teamOptions} placeholder="Select team" />
                <input type="text" name="title" placeholder="Charge title" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <textarea name="description" rows={4} placeholder="Optional description" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <input type="number" step="0.01" min="0" name="amountPounds" placeholder="Amount in pounds" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <input type="date" name="dueDate" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <button type="submit" className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">Create charge</button>
              </div>
            </form>
          ) : null}

          {selectedAction === "recordPayment" ? (
            <form id="record-payment" action={recordPaymentAction} className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Record payment</h2>
                  <p className="mt-1 text-sm text-white/55">{recordPaymentHelpText}</p>
                </div>
                {selectedPaymentChargeRow ? (
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
                    Outstanding {formatMoney(selectedPaymentChargeRow.summary.outstandingPence)}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 space-y-4">
                <FormListboxField name="teamId" value={recordPaymentTeamId} options={teamOptions} placeholder="Select team" />
                <FormListboxField name="chargeId" value={recordPaymentChargeId} options={[{ value: "", label: "No linked charge" }, ...openChargeOptions]} placeholder="Optional linked charge" />
                <input type="number" step="0.01" min="0" name="amountPounds" defaultValue={recordPaymentAmount} placeholder="Amount in pounds" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <FormListboxField name="method" value={PaymentMethod.BANK_TRANSFER} options={methodOptions} placeholder="Select payment method" />
                <input type="text" name="reference" placeholder="Reference" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <textarea name="notes" rows={4} placeholder="Optional notes" className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <input type="datetime-local" name="paidAt" defaultValue={defaultPaidAt} className="w-full rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none" />
                <button type="submit" className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">Record payment</button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {showTeamCharges ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Team charges</h2>
            <p className="text-sm text-white/55">Showing {visibleChargeRows.length} of {filteredChargeRows.length} matching charges. Calculated from team payments plus paid squad/player match fees for the same fixture.</p>
          </div>
          <div className="mt-4 space-y-3">
            {filteredChargeRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">No team charges match the current filters.</div>
            ) : null}
            {visibleChargeRows.map((row) => {
              const lastChasedAt = lastTeamChargeChaseByChargeId.get(row.charge.id) ?? null;
              const canChaseTeamCharge =
                !isChargeDisplayClosed(row.summary.displayStatus) &&
                row.summary.outstandingPence > 0 &&
                Boolean(row.charge.paymentToken);
              const canRecordPayment =
                !isChargeDisplayClosed(row.summary.displayStatus) &&
                row.summary.outstandingPence > 0;
              const canVoidCharge = !isChargeDisplayClosed(row.summary.displayStatus);
              const statusChanged = row.summary.displayStatus !== row.charge.status;
              const recordPaymentHref = `${buildFilterQuery({
                q: searchQuery,
                leagueId: selectedLeagueId,
                teamId: selectedTeamId,
                view: selectedView,
                limit: listLimit,
                action: "recordPayment",
                paymentChargeId: row.charge.id,
              })}#record-payment`;

              return (
                <div key={row.charge.id} className={`rounded-2xl border bg-[#0d1428] p-4 ${row.needsAdminChase ? "border-red-500/30" : "border-white/10"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">{row.charge.team.name} · {row.charge.title}</div>
                      <div className="mt-1 text-sm text-white/55">{row.charge.description || "No description"}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {row.charge.dueDate ? <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Due {formatDueLabel(row.charge.dueDate)}</span> : null}
                        {row.needsAdminChase ? <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-200">Needs admin chase</span> : null}
                        {row.summary.outstandingPence > 0 && row.summary.displayStatus !== "VOID" ? <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">Awaiting payment</span> : null}
                        {row.summary.playerPaidPence > 0 ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Squad paid {formatMoney(row.summary.playerPaidPence)}</span> : null}
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${lastChasedAt ? "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100" : "border-white/10 bg-white/[0.05] text-white/55"}`}>{formatLastChasedLabel(lastChasedAt)}</span>
                      </div>
                      {(canRecordPayment || canChaseTeamCharge || canVoidCharge) ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {canRecordPayment ? (
                            <Link href={recordPaymentHref} className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15">Record payment</Link>
                          ) : null}
                          {canChaseTeamCharge ? (
                            <form action={sendTeamChargeReminderAction}>
                              <input type="hidden" name="chargeId" value={row.charge.id} />
                              <button type="submit" className="inline-flex items-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2.5 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/15">Team chase SMS</button>
                            </form>
                          ) : null}
                          {canVoidCharge ? (
                            <Link href={`/admin/payments/void/${row.charge.id}`} className="inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15">Void charge</Link>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold text-white">{formatMoney(row.charge.amountPence)}</div>
                      <div className="mt-1 text-sm text-white/55">Paid {formatMoney(row.summary.paidPence)} · Outstanding {formatMoney(row.summary.outstandingPence)}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                        {formatChargeStatusLabel(row.summary.displayStatus)}{statusChanged ? ` · stored ${formatChargeStatusLabel(row.charge.status)}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {showRecentPayments ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-xl font-semibold text-white">Recent payments</h2>
          <p className="mt-2 text-sm text-white/55">Showing {visibleTransactions.length} of {filteredTransactions.length} matching recent payments.</p>
          <div className="mt-4 space-y-3">
            {filteredTransactions.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">No recent payments match the current filters.</div> : null}
            {visibleTransactions.map((payment) => (
              <div key={payment.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0d1428] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-white">{payment.team.name}</div>
                  <div className="mt-1 text-sm text-white/55">
                    {payment.charge?.title ?? (isPlayerFeePaymentNotes(payment.notes) ? "Squad player payment" : "Unlinked payment")} · {formatPaymentMethodLabel(payment.method)}
                  </div>
                  {payment.reference ? <div className="mt-1 text-xs text-white/40">Ref {payment.reference}</div> : null}
                </div>
                <div className="text-sm text-white/60 sm:text-right">
                  <div className="font-semibold text-white">{formatMoney(payment.amountPence)}</div>
                  <div>{formatDateTimeLabel(payment.paidAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
