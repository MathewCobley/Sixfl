// ========================================
// File: src/app/(admin)/admin/fixtures/update-fixture-action.ts
// ========================================

"use server";

import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";
import { updateFixtureFromEditPageAction } from "./[id]/edit/actions";
import { updateFixtureAction as updateFixtureLegacyAction } from "./actions-legacy";

export async function updateFixtureAction(formData: FormData) {
  const homeTeamId = String(formData.get("homeTeamId") ?? "").trim();
  const awayTeamId = String(formData.get("awayTeamId") ?? "").trim();

  const placeholderIds = await getFixturePlaceholderTeamIds(
    [homeTeamId, awayTeamId].filter(Boolean),
  );

  if (placeholderIds.size > 0) {
    await updateFixtureFromEditPageAction(formData);
    return;
  }

  await updateFixtureLegacyAction(formData);
}
