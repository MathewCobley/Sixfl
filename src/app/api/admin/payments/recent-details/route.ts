import { NextResponse } from "next/server";
import { PaymentMethod } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function formatDateTimeLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatPaymentMethodLabel(method: PaymentMethod) {
  const labels: Record<PaymentMethod, string> = {
    [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
    [PaymentMethod.STRIPE]: "Stripe",
    [PaymentMethod.CASH]: "Cash",
    [PaymentMethod.CARD]: "Card",
    [PaymentMethod.OTHER]: "Other",
  };

  return labels[method] ?? String(method).replaceAll("_", " ");
}

function extractPlayerFeeId(notes: string | null) {
  const match = /Player fee ID:\s*([a-zA-Z0-9_-]+)/i.exec(notes ?? "");
  return match?.[1] ?? null;
}

function isPlayerFeePaymentNotes(value: string | null) {
  const notes = value?.toLowerCase() ?? "";
  return notes.includes("player match fee paid online") || notes.includes("player fee id:");
}

function isRecurringTeamPayment(value: { notes: string | null; reference: string | null }) {
  const notes = value.notes?.toLowerCase() ?? "";
  const reference = value.reference?.toLowerCase() ?? "";
  return notes.includes("recurring team subscription") || reference.startsWith("in_");
}

function getPlayerFeeName(input: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string; lastName: string | null; email: string | null; phone: string | null } | null;
}) {
  if (input.teamMember) {
    return input.teamMember.user.name || input.teamMember.user.email || "Linked player";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName].filter(Boolean).join(" ").trim() ||
      input.prospect.email ||
      input.prospect.phone ||
      "Player prospect";
  }

  return "Player";
}

function getPlayerFeeContact(input: {
  teamMember: { user: { email: string | null } } | null;
  prospect: { email: string | null; phone: string | null } | null;
}) {
  if (input.teamMember) return input.teamMember.user.email;
  if (input.prospect) return [input.prospect.email, input.prospect.phone].filter(Boolean).join(" · ") || null;
  return null;
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const searchQuery = String(url.searchParams.get("q") ?? "").trim();
  const normalisedQuery = normaliseSearch(searchQuery);
  const selectedLeagueId = String(url.searchParams.get("leagueId") ?? "").trim();
  const selectedTeamId = String(url.searchParams.get("teamId") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "10") || 10, 1), 100);

  const transactions = await prisma.paymentTransaction.findMany({
    orderBy: [{ paidAt: "desc" }],
    take: 150,
    include: {
      team: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          league: { select: { id: true, name: true, season: true } },
        },
      },
      charge: {
        select: {
          id: true,
          title: true,
          description: true,
          fixture: {
            select: {
              id: true,
              kickoffAt: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
              league: { select: { name: true, season: true } },
            },
          },
        },
      },
    },
  });

  const playerFeeIds = Array.from(
    new Set(
      transactions
        .map((transaction) => extractPlayerFeeId(transaction.notes))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const playerFees = playerFeeIds.length
    ? await prisma.playerMatchFee.findMany({
        where: { id: { in: playerFeeIds } },
        select: {
          id: true,
          amountPence: true,
          team: { select: { id: true, name: true } },
          teamMember: { select: { user: { select: { name: true, email: true } } } },
          prospect: { select: { firstName: true, lastName: true, email: true, phone: true } },
          fixture: {
            select: {
              id: true,
              kickoffAt: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
              league: { select: { name: true, season: true } },
            },
          },
        },
      })
    : [];

  const playerFeeById = new Map(playerFees.map((fee) => [fee.id, fee]));

  const details = transactions
    .map((payment) => {
      const playerFeeId = extractPlayerFeeId(payment.notes);
      const playerFee = playerFeeId ? playerFeeById.get(playerFeeId) ?? null : null;
      const methodLabel = formatPaymentMethodLabel(payment.method);
      const fixture = playerFee?.fixture ?? payment.charge?.fixture ?? null;
      const fixtureLabel = fixture
        ? `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`
        : null;
      const fixtureDateLabel = fixture ? formatFixtureDate(fixture.kickoffAt) : null;
      const teamContact = [payment.team.contactName, payment.team.contactEmail, payment.team.contactPhone]
        .filter(Boolean)
        .join(" · ") || null;
      const playerName = playerFee
        ? getPlayerFeeName({ teamMember: playerFee.teamMember, prospect: playerFee.prospect })
        : null;
      const playerContact = playerFee
        ? getPlayerFeeContact({ teamMember: playerFee.teamMember, prospect: playerFee.prospect })
        : null;
      const recurring = isRecurringTeamPayment({ notes: payment.notes, reference: payment.reference });
      const playerPayment = Boolean(playerFee) || isPlayerFeePaymentNotes(payment.notes);

      let typeLabel = "Unlinked / manual payment";
      let title = `${payment.team.name} payment`;
      let line1 = `Team record: ${payment.team.name}`;
      let line2 = payment.team.league
        ? `${payment.team.league.name}${payment.team.league.season ? ` · ${payment.team.league.season}` : ""}`
        : "No league on team record";

      if (playerPayment) {
        typeLabel = "Player match fee";
        title = `${playerName ?? "Player"} paid ${formatMoney(payment.amountPence)}`;
        line1 = [fixtureLabel, playerContact].filter(Boolean).join(" · ") || "Player match fee payment";
        line2 = `Team: ${playerFee?.team.name ?? payment.team.name}${fixtureDateLabel ? ` · ${fixtureDateLabel}` : ""}`;
      } else if (payment.charge) {
        typeLabel = payment.charge.fixture ? "Team fixture payment" : "Team charge payment";
        title = `${payment.team.name} paid ${formatMoney(payment.amountPence)}`;
        line1 = payment.charge.title;
        line2 = [fixtureLabel, fixtureDateLabel, payment.charge.description].filter(Boolean).join(" · ") || "Linked team charge";
      } else if (recurring) {
        typeLabel = "Recurring team payment";
        title = `${payment.team.name} recurring payment`;
        line1 = teamContact ? `Team contact: ${teamContact}` : `Team record: ${payment.team.name}`;
        line2 = payment.notes || "Recurring Stripe invoice payment";
      }

      const referenceLine = payment.reference ? `Ref: ${payment.reference}` : null;
      const notesLine = payment.notes ? `Notes: ${payment.notes}` : null;
      const leagueId = payment.team.league?.id ?? null;

      return {
        id: payment.id,
        teamId: payment.teamId,
        leagueId,
        typeLabel,
        title,
        line1,
        line2,
        referenceLine,
        notesLine,
        methodLabel,
        amountLabel: formatMoney(payment.amountPence),
        paidAtLabel: formatDateTimeLabel(payment.paidAt),
        searchValues: [
          typeLabel,
          title,
          line1,
          line2,
          referenceLine,
          notesLine,
          methodLabel,
          payment.amountPence / 100,
          payment.paidAt,
          payment.team.name,
          payment.team.contactName,
          payment.team.contactEmail,
          payment.team.contactPhone,
          playerName,
          playerContact,
          fixtureLabel,
          payment.charge?.title,
          payment.charge?.description,
        ],
      };
    })
    .filter((detail) =>
      (!selectedLeagueId || detail.leagueId === selectedLeagueId) &&
      (!selectedTeamId || detail.teamId === selectedTeamId) &&
      matchesSearch(normalisedQuery, detail.searchValues),
    )
    .slice(0, limit)
    .map(({ searchValues: _searchValues, ...detail }) => detail);

  return NextResponse.json({ details });
}
