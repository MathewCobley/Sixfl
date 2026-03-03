"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function submitScore(formData: FormData) {
  const fixtureId = String(formData.get("fixtureId") || "");
  const homeScore = Number(formData.get("homeScore"));
  const awayScore = Number(formData.get("awayScore"));

  if (!fixtureId) throw new Error("Missing fixtureId");
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    throw new Error("Scores must be numbers");
  }

  await prisma.fixture.update({
    where: { id: fixtureId },
    data: { homeScore, awayScore },
  });

  revalidatePath("/manager");
  revalidatePath(`/manager/fixtures/${fixtureId}`);

  redirect(`/manager/fixtures/${fixtureId}`);
}