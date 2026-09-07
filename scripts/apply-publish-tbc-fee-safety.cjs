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

// TBC charge resolution and the resilient fee-repair action are native in the
// publishing server source. This compatibility script only keeps the existing
// repair controls on the fixtures page; it must never rewrite payment rules.

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
