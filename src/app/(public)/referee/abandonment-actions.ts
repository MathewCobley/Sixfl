"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReferee } from "@/lib/admin";
import { recordFixtureAbandonment } from "@/lib/fixtures/abandonment";
import {
  isFixtureConductAbandonmentReason,
  sendFixtureFormalConductNotice,
} from "@/lib/fixtures/formal-conduct-notice";
import { getRefereeNightFixtureIds, recalculateRefereeNightCashup } from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";

function required(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

async function assertNightAccess(input: {
  refereeNightId: string;
  fixtureId: string;
  user: { id: string; role: UserRole };
}) {
  const rows = await prisma.$queryRaw<Array<{ refereeId: string }>>(Prisma.sql`
    SELECT "refereeId"
    FROM "RefereeNight"
    WHERE "id" = ${input.refereeNightId}
    LIMIT 1
  `);
  const night = rows[0];
  if (!night) throw new Error("Referee night not found.");

  if (input.user.role !== UserRole.ADMIN && night.refereeId !== input.user.id) {
    throw new Error("You are not allowed to update this referee night.");
  }

  const fixtureIds = await getRefereeNightFixtureIds(input.refereeNightId);
  if (!fixtureIds.includes(input.fixtureId)) {
    throw new Error("Fixture is not part of this referee night.");
  }
}

export async function recordNightFixtureAbandonmentAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = required(formData, "refereeNightId", "Referee night");
  const fixtureId = required(formData, "fixtureId", "Fixture");
  const reason = required(formData, "reason", "Abandonment reason");
  const responsibleTeamId = String(formData.get("responsibleTeamId") ?? "").trim() || null;
  const details = String(formData.get("details") ?? "").trim() || null;
  const confirmed = String(formData.get("confirmAbandonment") ?? "") === "yes";

  if (!confirmed) {
    throw new Error("Confirm that the referee abandoned the match before applying the abandonment decision.");
  }

  await assertNightAccess({ refereeNightId, fixtureId, user });

  await recordFixtureAbandonment({
    fixtureId,
    refereeNightId,
    reason,
    responsibleTeamId,
    details,
    recordedByUserId: user.id,
  });

  if (responsibleTeamId && isFixtureConductAbandonmentReason(reason)) {
    try {
      await sendFixtureFormalConductNotice({
        fixtureId,
        createdByUserId: user.id,
      });
    } catch (error) {
      console.error(
        "Abandonment was saved but the separate formal conduct notice could not be sent",
        error,
      );
    }
  }

  await recalculateRefereeNightCashup(refereeNightId);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath(`/admin/referee-nights/${refereeNightId}`);
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/team-credits");

  redirect(`/referee/night/${refereeNightId}?saved=abandoned`);
}
