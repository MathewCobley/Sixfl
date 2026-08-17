import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  CAPTAIN_COLLECTED_NOTE_MARKERS,
  CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER,
  getCaptainCollectedRemittanceSnapshot,
  isCaptainCollectionActiveNote,
} from "@/lib/payments/captain-collected-remittance";
import { formatPaymentMoney, getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function paymentsUrl(teamId: string, values?: Record<string, string>) {
  const url = new URL(`/captain/team/${teamId}/payments`, `${getPublicSiteUrl()}/`);
  for (const [key, value] of Object.entries(values ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function actorLabel(access: Awaited<ReturnType<typeof requireCaptain>>) {
  return access.user?.name?.trim() || access.user?.email?.trim() || "captain";
}

function appendAuditNote(existingNote: string | null, auditLine: string) {
  const current = existingNote?.trim();
  return current ? `${current}\n${auditLine}` : auditLine;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await context.params;
  const access = await requireCaptain(teamid);
  const formData = await request.formData();
  const chargeId = String(formData.get("chargeId") ?? "").trim();

  if (!chargeId) {
    return NextResponse.redirect(paymentsUrl(teamid, { captainCollection: "invalid" }), 303);
  }

  const ledger = await getTeamPaymentLedger(teamid);
  const entry = ledger?.entries.find((candidate) => candidate.chargeId === chargeId) ?? null;

  if (!ledger || !entry || !entry.fixtureId || entry.displayStatus === "VOID") {
    return NextResponse.redirect(paymentsUrl(teamid, { captainCollection: "invalid" }), 303);
  }

  const snapshot = await getCaptainCollectedRemittanceSnapshot({
    chargeId: entry.chargeId,
    teamId: entry.teamId,
    fixtureId: entry.fixtureId,
  });

  if (snapshot.pendingPence > 0) {
    return NextResponse.redirect(paymentsUrl(teamid, { captainCollection: "pending" }), 303);
  }

  if (snapshot.remittedPence > 0) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { captainCollection: "already_remitted" }),
      303,
    );
  }

  if (snapshot.collectedPence <= 0 || snapshot.unremittedPence <= 0) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { captainCollection: "not_available" }),
      303,
    );
  }

  const collectedFees = await prisma.playerMatchFee.findMany({
    where: {
      teamId: entry.teamId,
      fixtureId: entry.fixtureId,
      status: "WAIVED",
      OR: CAPTAIN_COLLECTED_NOTE_MARKERS.map((marker) => ({
        note: { contains: marker, mode: "insensitive" as const },
      })),
    },
    select: { id: true, amountPence: true, note: true },
  });

  const activeFees = collectedFees.filter((fee) => isCaptainCollectionActiveNote(fee.note));
  if (activeFees.length === 0) {
    return NextResponse.redirect(
      paymentsUrl(teamid, { captainCollection: "not_available" }),
      303,
    );
  }

  const removedAt = new Date();
  const removedAtLabel = formatDateTimeInLondon(removedAt, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const actionedBy = actorLabel(access);

  await prisma.$transaction(
    activeFees.map((fee) => {
      const auditLine = `${CAPTAIN_COLLECTION_REMOVED_NOTE_MARKER}. ${formatPaymentMoney(fee.amountPence)} was removed by ${actionedBy} on ${removedAtLabel}. Captain and player resolved this privately; the SIXFL fixture balance was not reduced.`;
      return prisma.playerMatchFee.update({
        where: { id: fee.id },
        data: { note: appendAuditNote(fee.note, auditLine) },
      });
    }),
  );

  revalidatePath(`/captain/team/${teamid}/payments`);
  revalidatePath(`/captain/team/${teamid}/player-payments`);
  revalidatePath(`/captain/team/${teamid}`);

  return NextResponse.redirect(
    paymentsUrl(teamid, {
      captainCollection: "removed",
      collectionAmount: String(snapshot.unremittedPence),
    }),
    303,
  );
}
