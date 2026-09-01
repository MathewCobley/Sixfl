"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  formatMoney,
  getRefereeNightById,
  getRefereeNightFixtureIds,
  parseMoneyToPence,
  recalculateRefereeNightCashup,
} from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readRequired(formData: FormData, key: string, label: string) {
  const value = readString(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function revalidateRefereeNight(refereeNightId: string) {
  revalidatePath("/admin/referee-nights");
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/night-board");
  revalidatePath("/admin/fixtures");
  revalidatePath("/referee");
}

export async function updateOneOffRefereeNightFeeAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  const feePence = parseMoneyToPence(formData.get("feePounds"));
  if (feePence === null) throw new Error("Enter a valid night fee.");

  const night = await getRefereeNightById(refereeNightId);
  if (!night) throw new Error("Referee night not found.");
  if (night.status === "CANCELLED") throw new Error("A cancelled referee night cannot be charged a fee.");
  if (night.status === "SETTLED") {
    throw new Error("Reopen this referee night before changing its fee.");
  }

  const auditNote = `Admin fee correction: ${formatMoney(night.feePence)} changed to ${formatMoney(feePence)} for this night only.`;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "feePence" = ${feePence},
      "adminNotes" = concat_ws(E'\n', NULLIF("adminNotes", ''), ${auditNote}),
      "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
  `);

  await recalculateRefereeNightCashup(refereeNightId);
  revalidateRefereeNight(refereeNightId);
  redirect(`/admin/referee-nights/${refereeNightId}?feeCorrected=1`);
}

export async function cancelIncorrectRefereeNightAction(formData: FormData) {
  await requireAdmin();

  const refereeNightId = readRequired(formData, "refereeNightId", "Referee night");
  if (readString(formData, "confirmCancel") !== "yes") {
    throw new Error("Confirm that this referee did not work the night before cancelling it.");
  }

  const night = await getRefereeNightById(refereeNightId);
  if (!night) throw new Error("Referee night not found.");
  if (night.status === "CANCELLED") {
    redirect(`/admin/referee-nights/${refereeNightId}?cancelled=1`);
  }
  if (night.status === "SETTLED") {
    throw new Error("This referee night is settled. Reopen it before making a correction.");
  }

  if (
    night.cashCollectedPence > 0 ||
    night.cashPaidToRefereePence > 0 ||
    night.cashReceivedFromRefereePence > 0
  ) {
    throw new Error(
      "This referee night has cash or payment history. Reconcile that first rather than removing the night automatically.",
    );
  }

  const reason = readString(formData, "correctionReason");
  const fixtureIds = await getRefereeNightFixtureIds(refereeNightId);
  const auditNote = [
    `Admin correction: referee did not work this night. Night cancelled, fee/balance removed and fixture assignments released. Original fee ${formatMoney(night.feePence)}.`,
    reason ? `Reason: ${reason}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "RefereeNightFixture"
      WHERE "refereeNightId" = ${refereeNightId}
    `);

    if (fixtureIds.length > 0) {
      // This is an explicit admin correction, not a match-data edit. Use a narrowly
      // scoped SQL update so completed fixtures can release only this incorrect
      // referee assignment without weakening the global completed-fixture lock.
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Fixture"
        SET "refereeId" = NULL
        WHERE id IN (${Prisma.join(fixtureIds)})
          AND "refereeId" = ${night.refereeId}
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "RefereeNight"
      SET
        "status" = 'CANCELLED',
        "feePence" = 0,
        "cashCollectedPence" = 0,
        "retainedByRefereePence" = 0,
        "dueToSixflPence" = 0,
        "dueToRefereePence" = 0,
        "adminNotes" = concat_ws(E'\n', NULLIF("adminNotes", ''), ${auditNote}),
        "updatedAt" = NOW()
      WHERE id = ${refereeNightId}
    `);
  });

  revalidateRefereeNight(refereeNightId);
  redirect(`/admin/referee-nights/${refereeNightId}?cancelled=1`);
}
