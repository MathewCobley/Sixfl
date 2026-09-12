"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { recordResultOverturn, ResultOverturnError } from "@/lib/fixtures/result-overturn";

export async function overturnResultAction(form: FormData) {
  const access = await requireAdmin();
  if (!access.user || access.user.role !== "ADMIN") throw new Error("Administrator access is required.");
  const value = (key: string) => String(form.get(key) ?? "");
  const fixtureId = value("fixtureId");
  const page = `/admin/fixtures/${encodeURIComponent(fixtureId)}/result`;
  let saved;
  try {
    saved = await recordResultOverturn({
      fixtureId, actorUserId: access.user.id, requestId: value("requestId"), winnerTeamId: value("winnerTeamId"),
      reasonCode: value("reasonCode"), evidenceNote: value("evidenceNote"), rulesBasis: value("rulesBasis"),
      expectedResultUpdatedAt: value("expectedResultUpdatedAt"), expectedHomeScore: Number(value("expectedHomeScore")),
      expectedAwayScore: Number(value("expectedAwayScore")), confirmed: value("confirmed") === "yes",
    });
  } catch (error) {
    if (!(error instanceof ResultOverturnError)) console.error("[result-overturn] Save failed", error);
    const message = error instanceof ResultOverturnError ? error.message : "Unable to confirm the save. Reload this result and check its decision history before retrying.";
    redirect(`${page}?overturnError=${encodeURIComponent(message)}`);
  }
  // Pure cache invalidation, never automatic customer sends or cash movements.
  for (const route of [page, "/admin/fixtures", "/admin/results", "/admin/night-board", "/admin/ai-predictor", "/admin/ai-predictor/backtest",
    `/leagues/${saved.leagueSlug}`, `/leagues/${saved.leagueSlug}/fixtures`, `/leagues/${saved.leagueSlug}/results`]) revalidatePath(route);
  for (const id of [saved.homeTeamId, saved.awayTeamId]) {
    for (const route of [`/teams/${id}`, `/captain/team/${id}`, `/captain/team/${id}/results`, `/captain/team/${id}/fixtures`, `/player/team/${id}`, `/player/team/${id}/league-results`]) revalidatePath(route);
  }
  redirect(`${page}?overturned=1`);
}
