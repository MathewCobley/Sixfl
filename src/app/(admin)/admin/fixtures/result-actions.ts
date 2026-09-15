"use server";

import { prisma } from "@/lib/prisma";
import { submitResultAction as legacySubmitResultAction } from "./actions-legacy";

function readScore(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").trim());
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isDefaultWin(homeScore: number, awayScore: number) {
  return (
    (homeScore === 3 && awayScore === 0) ||
    (homeScore === 0 && awayScore === 3)
  );
}

/**
 * Existing played results must not be silently converted into an awarded 3–0.
 * A competition decision has its own immutable workflow which preserves the
 * on-pitch score for captains, audit and predictor history.
 */
export async function submitResultAction(formData: FormData) {
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const nextHomeScore = readScore(formData, "homeScore");
  const nextAwayScore = readScore(formData, "awayScore");

  if (fixtureId && nextHomeScore !== null && nextAwayScore !== null) {
    const existing = await prisma.matchResult.findUnique({
      where: { fixtureId },
      select: {
        homeScore: true,
        awayScore: true,
        overturn: { select: { id: true } },
      },
    });

    const changed =
      existing &&
      (existing.homeScore !== nextHomeScore || existing.awayScore !== nextAwayScore);

    if (
      existing &&
      !existing.overturn &&
      changed &&
      isDefaultWin(nextHomeScore, nextAwayScore)
    ) {
      throw new Error(
        "Do not replace a played result with a 3–0 here. Use ‘Overturn result — competition decision’ so the original on-pitch score is preserved and shown alongside the awarded result.",
      );
    }
  }

  return legacySubmitResultAction(formData);
}
