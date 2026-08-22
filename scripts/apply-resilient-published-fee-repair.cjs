const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const file = "src/app/(admin)/admin/fixtures/publish-actions.ts";
const absolute = path.join(root, ...file.split("/"));
let source = fs.readFileSync(absolute, "utf8");

const startMarker = "export async function repairPublishedLeagueFixtureFeesAction(formData: FormData) {";
const start = source.indexOf(startMarker);
if (start < 0) {
  throw new Error("Published fee repair action was not found after TBC safety patch.");
}

const safeAction = `export async function repairPublishedLeagueFixtureFeesAction(formData: FormData) {
  await requireAdmin();

  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const divisionId = parseOptionalString(formData.get("divisionId"));

  await assertDivisionBelongsToLeague({ leagueId, divisionId });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, slug: true, season: true },
  });

  if (!league) {
    redirect(buildAdminFixturesHref({
      publish: "error",
      leagueId,
      divisionId,
      publishError: "fee_repair_league_missing",
    }));
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      leagueId,
      publishedAt: { not: null },
      status: "SCHEDULED",
      ...(divisionId ? { divisionId } : {}),
    },
    orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
    select: {
      id: true,
      kickoffAt: true,
      matchFeePence: true,
      homeMatchFeePence: true,
      awayMatchFeePence: true,
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
    },
  });

  const teamIds = unique(
    fixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]),
  );
  const placeholderTeamIds = await getFixturePlaceholderTeamIds(teamIds);

  let repairedFixtures = 0;
  let failedFixtures = 0;
  let activeCharges = 0;
  let paymentMessagesQueued = 0;
  let paymentMessagesSkipped = 0;
  let paymentMessageFailures = 0;

  for (const fixture of fixtures) {
    const homeMatchFeePence = placeholderTeamIds.has(fixture.homeTeam.id)
      ? null
      : fixture.homeMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;
    const awayMatchFeePence = placeholderTeamIds.has(fixture.awayTeam.id)
      ? null
      : fixture.awayMatchFeePence ?? fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;

    try {
      const chargeResult = await syncFixtureMatchFeeCharges({
        fixtureId: fixture.id,
        leagueId: league.id,
        leagueName: league.name,
        leagueSeason: league.season,
        kickoffAt: fixture.kickoffAt,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeMatchFeePence,
        awayMatchFeePence,
      });

      repairedFixtures += 1;
      activeCharges += chargeResult.activeCharges.length;

      if (chargeResult.activeCharges.length > 0) {
        try {
          const messageResult = await queueFixtureMatchFeeEmails({
            fixtureId: fixture.id,
            leagueId: league.id,
            leagueName: league.name,
            leagueSeason: league.season,
            kickoffAt: fixture.kickoffAt,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            homeMatchFeePence,
            awayMatchFeePence,
            charges: chargeResult.activeCharges,
          });

          paymentMessagesQueued += messageResult.queued;
          paymentMessagesSkipped += messageResult.skipped;
        } catch (error) {
          paymentMessageFailures += 1;
          console.error("Published fixture fee repair could not queue payment messages", {
            fixtureId: fixture.id,
            error,
          });
        }
      }
    } catch (error) {
      failedFixtures += 1;
      console.error("Published fixture fee repair failed for fixture", {
        fixtureId: fixture.id,
        homeTeamId: fixture.homeTeam.id,
        awayTeamId: fixture.awayTeam.id,
        homeIsPlaceholder: placeholderTeamIds.has(fixture.homeTeam.id),
        awayIsPlaceholder: placeholderTeamIds.has(fixture.awayTeam.id),
        error,
      });
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/night-board");
  revalidatePath(\`/admin/leagues/\${leagueId}\`);
  revalidatePath(\`/admin/leagues/\${leagueId}/fixtures\`);
  if (league.slug) {
    revalidatePath(\`/leagues/\${league.slug}\`);
    revalidatePath(\`/leagues/\${league.slug}/fixtures\`);
  }

  const params = new URLSearchParams();
  params.set("leagueId", leagueId);
  if (divisionId) params.set("divisionId", divisionId);
  params.set("feeRepair", failedFixtures > 0 ? "partial" : "success");
  params.set("feeRepairFixtures", String(fixtures.length));
  params.set("feeRepairRepaired", String(repairedFixtures));
  params.set("feeRepairFailed", String(failedFixtures));
  params.set("feeRepairCharges", String(activeCharges));
  params.set("feeRepairQueued", String(paymentMessagesQueued));
  params.set("feeRepairSkipped", String(paymentMessagesSkipped));
  params.set("feeRepairMessageFailures", String(paymentMessageFailures));
  redirect(\`/admin/fixtures?\${params.toString()}\`);
}
`;

source = source.slice(0, start) + safeAction;
fs.writeFileSync(absolute, source, "utf8");

const pageFile = "src/app/(admin)/admin/fixtures/page.tsx";
const pageAbsolute = path.join(root, ...pageFile.split("/"));
let page = fs.readFileSync(pageAbsolute, "utf8");

page = page.replace(
  'getSearchParamValue(resolvedSearchParams.feeRepair) === "success"',
  '["success", "partial"].includes(getSearchParamValue(resolvedSearchParams.feeRepair) ?? "")',
);

if (!page.includes("feeRepairNotice.failed")) {
  page = page.replace(
    `          queued: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairQueued) ?? 0,\n          ),`,
    `          queued: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairQueued) ?? 0,\n          ),\n          failed: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairFailed) ?? 0,\n          ),\n          messageFailures: Number(\n            getSearchParamValue(resolvedSearchParams.feeRepairMessageFailures) ?? 0,\n          ),`,
  );

  page = page.replace(
    `Checked published fixture fees for {feeRepairNotice.fixtures} scheduled fixture{feeRepairNotice.fixtures === 1 ? "" : "s"}. {feeRepairNotice.charges} active team charge{feeRepairNotice.charges === 1 ? "" : "s"} now reconciled; {feeRepairNotice.queued} payment message{feeRepairNotice.queued === 1 ? "" : "s"} queued.`,
    `Checked published fixture fees for {feeRepairNotice.fixtures} scheduled fixture{feeRepairNotice.fixtures === 1 ? "" : "s"}. {feeRepairNotice.charges} active team charge{feeRepairNotice.charges === 1 ? "" : "s"} now reconciled; {feeRepairNotice.queued} payment message{feeRepairNotice.queued === 1 ? "" : "s"} queued.{feeRepairNotice.failed > 0 ? \` \${feeRepairNotice.failed} fixture\${feeRepairNotice.failed === 1 ? "" : "s"} could not be repaired and have been logged without stopping the others.\` : ""}{feeRepairNotice.messageFailures > 0 ? \` \${feeRepairNotice.messageFailures} payment-message batch\${feeRepairNotice.messageFailures === 1 ? "" : "es"} could not be queued; the fee charges themselves were still retained.\` : ""}`,
  );
}

fs.writeFileSync(pageAbsolute, page, "utf8");
console.log("Published fixture fee repair now continues past individual fee or messaging errors instead of crashing the admin page.");
