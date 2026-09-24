"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function reviewPriorityAction(form: FormData) {
  const { user, session } = await requireAdmin();
  const actor = user?.id ?? session?.user?.email ?? "development-admin";
  const teamId = String(form.get("teamId") ?? "");
  const referenceId = String(form.get("referenceId") ?? "");
  const kind = String(form.get("kind") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!teamId || !referenceId || !reason || reason.length > 1000) throw new Error("Choose a record and give a reason (up to 1,000 characters).");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`priority-review:${teamId}`}))::text`;
    if (kind === "REVOKE") {
      const changed = await tx.$executeRaw`UPDATE "SixflTvPriorityReview" SET "revokedAt"=NOW(),"revokedBy"=${actor},reason=reason || ${`\nReversed: ${reason}`} WHERE id=${referenceId} AND "teamId"=${teamId} AND "revokedAt" IS NULL`;
      if (!changed) throw new Error("This review has already been reversed or belongs to another team.");
      return;
    }
    let records: Array<{ id: string }> = [];
    let points = 0;
    if (kind === "PAYMENT_HOLD") records = await tx.$queryRaw`SELECT id FROM "PaymentCharge" WHERE id=${referenceId} AND "teamId"=${teamId} AND status::text <> 'VOID'`;
    else if (kind === "SHIN_PAD_DISMISSED") records = await tx.$queryRaw`SELECT id FROM "TeamShinPadWarning" WHERE id=${referenceId} AND "teamId"=${teamId}`;
    else if (kind === "RED_CARD") {
      points = Number(form.get("points"));
      if (![10,20].includes(points) || form.get("confirmed") !== "on") throw new Error("Confirm SIXFL has reviewed this sending-off and select its severity.");
      records = await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id=${referenceId} AND ${teamId} IN ("homeTeamId","awayTeamId") AND "kickoffAt" <= NOW() AND "kickoffAt" > NOW() - INTERVAL '28 days'`;
    } else throw new Error("Unknown review action.");
    if (!records.length) throw new Error("The record does not belong to this team or is outside the 28-day window.");
    // Keep previous decisions as an audit trail; only the latest decision is active.
    await tx.$executeRaw`UPDATE "SixflTvPriorityReview" SET "revokedAt"=NOW(),"revokedBy"=${actor} WHERE "teamId"=${teamId} AND kind=${kind} AND "referenceId"=${referenceId} AND "revokedAt" IS NULL`;
    await tx.$executeRaw(Prisma.sql`INSERT INTO "SixflTvPriorityReview" (id,"teamId",kind,"referenceId",points,reason,"createdBy") VALUES (${randomUUID()},${teamId},${kind},${referenceId},${points},${reason},${actor})`);
  });
  revalidatePath("/captain", "layout");
  revalidatePath("/admin", "layout");
  redirect(`/admin/teams/${encodeURIComponent(teamId)}/priority?saved=1`);
}
