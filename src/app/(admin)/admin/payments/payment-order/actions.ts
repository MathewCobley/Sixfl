"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { reconcileTeamPaymentOrderCheckouts } from "@/lib/payments/team-payment-order-checkouts";

export async function savePaymentOrderException(form: FormData) {
  const { user } = await requireAdmin();
  if (!user?.id) throw new Error("A signed-in administrator is required.");
  const chargeId = String(form.get("chargeId") ?? "").trim();
  const action = String(form.get("action") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const days = Number(form.get("days") ?? 7);
  if (!["HOLD", "ALLOW_PAYMENT", "RESET"].includes(action) || reason.length < 5 || reason.length > 1000
    || !Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error("Choose an action, enter a reason of 5–1000 characters and an expiry of 1–30 days.");
  }
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: chargeId }, select: { id: true, teamId: true, team: { select: { teamMode: true } } },
  });
  if (!charge || charge.team.teamMode !== "STANDARD") throw new Error("Select a standard-team charge.");
  const expiresAt = action === "RESET" ? null : new Date(Date.now() + days * 86400000);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`team-payment-order:${charge.teamId}`}))::text`);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TeamPaymentOrderException" ("teamId", "chargeId", "action", "reason", "createdByUserId", "createdByLabel", "expiresAt")
      VALUES (${charge.teamId}, ${charge.id}, ${action}, ${reason}, ${user.id}, ${user.name || user.email || user.id}, ${expiresAt})
    `);
  });
  revalidatePath("/admin/payments/payment-order");
  revalidatePath(`/captain/team/${charge.teamId}/payments`);
  revalidatePath("/pay/charge/[token]", "page");
  redirect(`/admin/payments/payment-order?teamId=${encodeURIComponent(charge.teamId)}&saved=1`);
}

export async function runPaymentOrderCheckoutCleanup() {
  const { user } = await requireAdmin();
  if (!user?.id) throw new Error("A signed-in administrator is required.");
  await reconcileTeamPaymentOrderCheckouts();
  revalidatePath("/admin/payments/payment-order");
  redirect("/admin/payments/payment-order?checked=1");
}
