const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, ...file.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Publishing a week containing TBC must never try to create a payment charge
// or notification for the hidden placeholder. The real opponent still gets its
// normal team fee and notifications.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/fixtures/publish-actions.ts";
  let source = read(file);

  if (!source.includes('getFixturePlaceholderTeamIds')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";',
    );
  }

  source = replaceRequired(
    source,
    `  const teamIds = unique(unpublishedFixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]));\n  const fixturesUrl =`,
    `  const teamIds = unique(unpublishedFixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]));\n  const placeholderTeamIds = await getFixturePlaceholderTeamIds(teamIds);\n  const fixturesUrl =`,
    "week publish placeholder ids",
  );

  source = replaceRequired(
    source,
    `  for (const fixture of unpublishedFixtures) {\n    const homeMatchFeePence =\n      fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n    const awayMatchFeePence =\n      fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;`,
    `  for (const fixture of unpublishedFixtures) {\n    const homeMatchFeePence = placeholderTeamIds.has(fixture.homeTeam.id)\n      ? null\n      : fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n    const awayMatchFeePence = placeholderTeamIds.has(fixture.awayTeam.id)\n      ? null\n      : fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;`,
    "week publish TBC fee resolution",
  );

  source = replaceRequired(
    source,
    `  for (const fixture of unpublishedFixtures) {\n    for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {\n      const { recipient } = await upsertTeamNotificationRecipient(teamId);`,
    `  for (const fixture of unpublishedFixtures) {\n    for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {\n      if (placeholderTeamIds.has(teamId)) continue;\n      const { recipient } = await upsertTeamNotificationRecipient(teamId);`,
    "week publish TBC reminder skip",
  );

  if (!source.includes("export async function repairPublishedLeagueFixtureFeesAction")) {
    source += `\n\nexport async function repairPublishedLeagueFixtureFeesAction(formData: FormData) {\n  await requireAdmin();\n\n  const leagueId = parseRequiredString(formData.get(\"leagueId\"), \"League\");\n  const divisionId = parseOptionalString(formData.get(\"divisionId\"));\n\n  await assertDivisionBelongsToLeague({ leagueId, divisionId });\n\n  const league = await prisma.league.findUnique({\n    where: { id: leagueId },\n    select: { id: true, name: true, slug: true, season: true },\n  });\n\n  if (!league) throw new Error(\"League not found.\");\n\n  const fixtures = await prisma.fixture.findMany({\n    where: {\n      leagueId,\n      publishedAt: { not: null },\n      status: \"SCHEDULED\",\n      ...(divisionId ? { divisionId } : {}),\n    },\n    orderBy: [{ kickoffAt: \"asc\" }, { position: \"asc\" }],\n    select: {\n      id: true,\n      kickoffAt: true,\n      pitch: true,\n      matchFeePence: true,\n      homeMatchFeePence: true,\n      awayMatchFeePence: true,\n      homeTeam: { select: { id: true, name: true, logoUrl: true } },\n      awayTeam: { select: { id: true, name: true, logoUrl: true } },\n      venue: { select: { name: true } },\n    },\n  });\n\n  const teamIds = unique(\n    fixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]),\n  );\n  const placeholderTeamIds = await getFixturePlaceholderTeamIds(teamIds);\n\n  let activeCharges = 0;\n  let paymentMessagesQueued = 0;\n  let paymentMessagesSkipped = 0;\n\n  for (const fixture of fixtures) {\n    const homeMatchFeePence = placeholderTeamIds.has(fixture.homeTeam.id)\n      ? null\n      : fixture.homeMatchFeePence ??\n        fixture.matchFeePence ??\n        DEFAULT_MATCH_FEE_PENCE;\n    const awayMatchFeePence = placeholderTeamIds.has(fixture.awayTeam.id)\n      ? null\n      : fixture.awayMatchFeePence ??\n        fixture.matchFeePence ??\n        DEFAULT_MATCH_FEE_PENCE;\n\n    const chargeResult = await syncFixtureMatchFeeCharges({\n      fixtureId: fixture.id,\n      leagueId: league.id,\n      leagueName: league.name,\n      leagueSeason: league.season,\n      kickoffAt: fixture.kickoffAt,\n      homeTeam: fixture.homeTeam,\n      awayTeam: fixture.awayTeam,\n      homeMatchFeePence,\n      awayMatchFeePence,\n    });\n\n    activeCharges += chargeResult.activeCharges.length;\n\n    if (chargeResult.activeCharges.length > 0) {\n      const messageResult = await queueFixtureMatchFeeEmails({\n        fixtureId: fixture.id,\n        leagueId: league.id,\n        leagueName: league.name,\n        leagueSeason: league.season,\n        kickoffAt: fixture.kickoffAt,\n        homeTeam: fixture.homeTeam,\n        awayTeam: fixture.awayTeam,\n        homeMatchFeePence,\n        awayMatchFeePence,\n        charges: chargeResult.activeCharges,\n      });\n\n      paymentMessagesQueued += messageResult.queued;\n      paymentMessagesSkipped += messageResult.skipped;\n    }\n  }\n\n  revalidatePath(\"/admin/fixtures\");\n  revalidatePath(\"/admin/payments\");\n  revalidatePath(\"/admin/night-board\");\n  revalidatePath(\`/admin/leagues/\${leagueId}\`);\n  revalidatePath(\`/admin/leagues/\${leagueId}/fixtures\`);\n  if (league.slug) {\n    revalidatePath(\`/leagues/\${league.slug}\`);\n    revalidatePath(\`/leagues/\${league.slug}/fixtures\`);\n  }\n\n  const params = new URLSearchParams();\n  params.set(\"leagueId\", leagueId);\n  if (divisionId) params.set(\"divisionId\", divisionId);\n  params.set(\"feeRepair\", \"success\");\n  params.set(\"feeRepairFixtures\", String(fixtures.length));\n  params.set(\"feeRepairCharges\", String(activeCharges));\n  params.set(\"feeRepairQueued\", String(paymentMessagesQueued));\n  params.set(\"feeRepairSkipped\", String(paymentMessagesSkipped));\n  redirect(\`/admin/fixtures?\${params.toString()}\`);\n}\n`;
  }

  write(file, source);
}

// ---------------------------------------------------------------------------
// The single-fixture publish endpoint needs the same TBC protection.
// ---------------------------------------------------------------------------
{
  const file = "src/app/api/admin/fixtures/publish-one/route.ts";
  let source = read(file);

  if (!source.includes('getFixturePlaceholderTeamIds')) {
    source = source.replace(
      'import { requireAdmin } from "@/lib/requireAdmin";',
      'import { requireAdmin } from "@/lib/requireAdmin";\nimport { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";',
    );
  }

  source = replaceRequired(
    source,
    `  const { fixture, league } = input;\n  const homeMatchFeePence =\n    fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n  const awayMatchFeePence =\n    fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;`,
    `  const { fixture, league } = input;\n  const placeholderTeamIds = await getFixturePlaceholderTeamIds([\n    fixture.homeTeam.id,\n    fixture.awayTeam.id,\n  ]);\n  const homeMatchFeePence = placeholderTeamIds.has(fixture.homeTeam.id)\n    ? null\n    : fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;\n  const awayMatchFeePence = placeholderTeamIds.has(fixture.awayTeam.id)\n    ? null\n    : fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;`,
    "single publish TBC fee resolution",
  );

  source = replaceRequired(
    source,
    `  for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {\n    const { recipient } = await upsertTeamNotificationRecipient(teamId);`,
    `  for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {\n    if (placeholderTeamIds.has(teamId)) continue;\n    const { recipient } = await upsertTeamNotificationRecipient(teamId);`,
    "single publish TBC reminder skip",
  );

  write(file, source);
}

// ---------------------------------------------------------------------------
// Give admin a permanent, explicit repair button. This is deliberately
// idempotent and is available even when the draft count is already zero, which
// is exactly the recovery path after a publish succeeded but fee creation failed.
// ---------------------------------------------------------------------------
{
  const file = "src/app/(admin)/admin/fixtures/page.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    `import {\n  publishAndEmailLeagueFixtureWeekAction,\n  publishAndEmailLeagueFixturesAction,\n} from \"@/app/(admin)/admin/fixtures/publish-actions\";`,
    `import {\n  publishAndEmailLeagueFixtureWeekAction,\n  publishAndEmailLeagueFixturesAction,\n  repairPublishedLeagueFixtureFeesAction,\n} from \"@/app/(admin)/admin/fixtures/publish-actions\";`,
    "fixture page repair action import",
  );

  if (!source.includes("const feeRepairNotice =")) {
    const anchor = `  const publishNotice = buildPublishNotice({\n    searchParams: resolvedSearchParams,\n    leagues: leagues.map((league) => ({ id: league.id, name: league.name })),\n  });\n  const chaseNotice = buildChaseNotice(resolvedSearchParams);`;
    const replacement = `${anchor}\n  const feeRepairNotice =\n    getSearchParamValue(resolvedSearchParams.feeRepair) === \"success\"\n      ? {\n          fixtures: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairFixtures) ?? 0,\n          ),\n          charges: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairCharges) ?? 0,\n          ),\n          queued: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairQueued) ?? 0,\n          ),\n        }\n      : null;`;
    if (!source.includes(anchor)) {
      throw new Error("Fixture page fee repair notice anchor not found.");
    }
    source = source.replace(anchor, replacement);
  }

  if (!source.includes("Checked published fixture fees for")) {
    const anchor = `        {chaseNotice ? (\n          <div className=\"px-6 pt-6 md:px-8\">`;
    const replacement = `        {feeRepairNotice ? (\n          <div className=\"px-6 pt-6 md:px-8\">\n            <div className=\"rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100\">\n              Checked published fixture fees for {feeRepairNotice.fixtures} scheduled fixture{feeRepairNotice.fixtures === 1 ? \"\" : \"s\"}. {feeRepairNotice.charges} active team charge{feeRepairNotice.charges === 1 ? \"\" : \"s\"} now reconciled; {feeRepairNotice.queued} payment message{feeRepairNotice.queued === 1 ? \"\" : \"s\"} queued.\n            </div>\n          </div>\n        ) : null}\n\n${anchor}`;
    if (!source.includes(anchor)) {
      throw new Error("Fixture page fee repair notice render anchor not found.");
    }
    source = source.replace(anchor, replacement);
  }

  if (!source.includes("Check / repair scheduled match fees")) {
    const anchor = `                  <form\n                    action={publishAndEmailLeagueFixturesAction}\n                    className=\"rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4\"\n                  >`;
    const repairForm = `                  <form\n                    action={repairPublishedLeagueFixtureFeesAction}\n                    className=\"rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4\"\n                  >\n                    <input type=\"hidden\" name=\"leagueId\" value={item.league.id} />\n                    {activeDivisionId ? (\n                      <input\n                        type=\"hidden\"\n                        name=\"divisionId\"\n                        value={activeDivisionId}\n                      />\n                    ) : null}\n                    <p className=\"mb-3 text-xs leading-5 text-sky-100/80\">\n                      Checks every currently scheduled published fixture in this selected league/division. Missing team charges are recreated; TBC never receives a fee.\n                    </p>\n                    <button\n                      type=\"submit\"\n                      disabled={item.scheduled === 0}\n                      className=\"inline-flex h-12 w-full items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-300 px-5 text-sm font-semibold text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40\"\n                    >\n                      Check / repair scheduled match fees\n                    </button>\n                  </form>\n\n${anchor}`;
    if (!source.includes(anchor)) {
      throw new Error("Fixture page repair form anchor not found.");
    }
    source = source.replace(anchor, repairForm);
  }

  write(file, source);
}

console.log("Fixture publishing now skips TBC financial/comms records and can repair already-published scheduled fees.");
