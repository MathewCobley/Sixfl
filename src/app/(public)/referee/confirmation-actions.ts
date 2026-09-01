"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReferee } from "@/lib/admin";
import { ensureRefereeNightConfirmationColumns } from "@/lib/referee-night-confirmations";
import { prisma } from "@/lib/prisma";

export async function respondToRefereeNightAction(formData: FormData) {
  const { user } = await requireReferee();
  await ensureRefereeNightConfirmationColumns();

  const refereeNightId = String(formData.get("refereeNightId") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim().toLowerCase();

  if (!refereeNightId || (answer !== "yes" && answer !== "no")) {
    redirect("/referee?confirmation=invalid");
  }

  const status = answer === "yes" ? "CONFIRMED" : "DECLINED";
  const now = new Date();

  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "confirmationStatus" = ${status},
      "confirmationConfirmedAt" = CASE WHEN ${status} = 'CONFIRMED' THEN ${now} ELSE "confirmationConfirmedAt" END,
      "confirmationDeclinedAt" = CASE WHEN ${status} = 'DECLINED' THEN ${now} ELSE "confirmationDeclinedAt" END,
      "confirmationResponseNote" = ${status === "CONFIRMED" ? "Referee confirmed they can attend from the referee dashboard." : "Referee said they cannot attend from the referee dashboard."},
      "confirmationTokenHash" = NULL,
      "updatedAt" = NOW()
    WHERE id = ${refereeNightId}
      AND "refereeId" = ${user.id}
      AND status <> 'CANCELLED'
      AND "nightDate" >= CURRENT_DATE
  `);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);

  if (!updated) {
    redirect("/referee?confirmation=stale");
  }

  redirect(`/referee?confirmation=${answer === "yes" ? "confirmed" : "declined"}`);
}
