"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { saveTeamReferralPayoutDetails } from "@/lib/team-referral-payout";

export async function saveReferralPayoutDetailsAction(formData: FormData) {
  const referralId = String(formData.get("referralId") ?? "").trim();
  const callback = referralId
    ? `/player/referrals/payout/${encodeURIComponent(referralId)}`
    : "/player/referrals";

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!user || !referralId) redirect("/player/referrals");

  const accountHolderName = String(formData.get("accountHolderName") ?? "");
  const sortCode = String(formData.get("sortCode") ?? "");
  const accountNumber = String(formData.get("accountNumber") ?? "");

  try {
    await saveTeamReferralPayoutDetails({
      referralId,
      referrerUserId: user.id,
      details: { accountHolderName, sortCode, accountNumber },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save payment details.";
    redirect(`${callback}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/player/referrals");
  revalidatePath(callback);
  revalidatePath("/admin/referrals");
  revalidatePath(`/admin/referrals/payout/${encodeURIComponent(referralId)}`);
  redirect(`${callback}?saved=1`);
}
