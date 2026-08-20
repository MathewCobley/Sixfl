"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReferee } from "@/lib/admin";
import { sendFixtureFormalConductNotice } from "@/lib/fixtures/formal-conduct-notice";
import { getRefereeNightFixtureIds } from "@/lib/referee-nights";

function required(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export async function sendNightFixtureFormalConductNoticeAction(formData: FormData) {
  const { user } = await requireReferee();
  if (user.role !== UserRole.ADMIN) {
    throw new Error("Only SIXFL admin can send a formal conduct notice.");
  }

  const refereeNightId = required(formData, "refereeNightId", "Referee night");
  const fixtureId = required(formData, "fixtureId", "Fixture");
  const fixtureIds = await getRefereeNightFixtureIds(refereeNightId);
  if (!fixtureIds.includes(fixtureId)) {
    throw new Error("Fixture is not part of this referee night.");
  }

  let saved = "formal-conduct-failed";

  try {
    const result = await sendFixtureFormalConductNotice({
      fixtureId,
      createdByUserId: user.id,
      resend: true,
    });

    saved =
      result.status === "SENT"
        ? "formal-conduct-sent"
        : result.status === "QUEUED" || result.status === "PROCESSING"
          ? "formal-conduct-queued"
          : "formal-conduct-failed";
  } catch (error) {
    console.error("Unable to send formal conduct notice", error);
  }

  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath("/admin/messages");
  revalidatePath("/admin/teams");

  redirect(`/referee/night/${refereeNightId}?saved=${saved}`);
}
