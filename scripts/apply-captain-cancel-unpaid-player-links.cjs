const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain team payments.`);
  }
  source = source.replace(before, after);
}

// Captains must be able to cancel still-unpaid player payment links at any point.
// Previously this action was restricted to fixtures whose team charge was already
// fully paid, which is why an open £36 fixture with £48 of unpaid links had no
// usable cancellation path.
replaceRequired(
  [
    '    !entry.fixtureId ||',
    '    entry.displayStatus !== "PAID" ||',
    '    entry.playerOpenPence <= 0',
  ].join("\n"),
  [
    '    !entry.fixtureId ||',
    '    entry.playerOpenPence <= 0',
  ].join("\n"),
  "unpaid player-link cancellation eligibility",
);

replaceRequired(
  [
    '    data: {',
    '      status: "CANCELLED",',
    '      note: "Cancelled by captain because the team fixture charge was already fully covered.",',
    '    },',
  ].join("\n"),
  [
    '    data: {',
    '      status: "CANCELLED",',
    '      cancelledAt: new Date(),',
    '      paymentUrl: null,',
    '      paymentToken: null,',
    '      note: "Cancelled by captain from team payments. Existing completed player payments were preserved.",',
    '    },',
  ].join("\n"),
  "unpaid player-link cancellation data",
);

source = source.replace(
  "Those player links could not be changed. Refresh the page and check that the charge is fully paid.",
  "Those player links could not be changed. Refresh the page and check that unpaid player links are still open for this fixture.",
);

const oldOpenLinksCopy = [
  '                            <p className="mt-1 text-xs leading-5 text-amber-50/70">',
  '                              This is not outstanding on the fixture. It would become team credit if collected.',
  '                            </p>',
].join("\n");
const newOpenLinksCopy = [
  '                            <p className="mt-1 text-xs leading-5 text-amber-50/70">',
  '                              These unpaid links are already included in the outstanding fixture balance above. Each payment will reduce that balance; only money collected after the fixture is fully covered becomes team credit.',
  '                            </p>',
  '                            <form action={closeSettledChargePlayerLinksAction} className="mt-3">',
  '                              <input type="hidden" name="teamId" value={team.id} />',
  '                              <input type="hidden" name="chargeId" value={entry.chargeId} />',
  '                              <button',
  '                                type="submit"',
  '                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25"',
  '                              >',
  '                                Cancel all unpaid player links',
  '                              </button>',
  '                            </form>',
].join("\n");
replaceRequired(
  oldOpenLinksCopy,
  newOpenLinksCopy,
  "unpaid player-link summary controls",
);

// When the fixture is already paid, the detailed warning previously contained a
// second cancellation button. Keep one clear control in the summary above.
const duplicatePaidControls = [
  '                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">',
  '                            <form action={closeSettledChargePlayerLinksAction}>',
  '                              <input type="hidden" name="teamId" value={team.id} />',
  '                              <input type="hidden" name="chargeId" value={entry.chargeId} />',
  '                              <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-200">',
  '                                Close these unpaid links',
  '                              </button>',
  '                            </form>',
  '                            <span className="text-xs text-white/55">',
  '                              Or leave them open to build team credit.',
  '                            </span>',
  '                          </div>',
].join("\n");
if (source.includes(duplicatePaidControls)) {
  source = source.replace(
    duplicatePaidControls,
    [
      '                          <p className="mt-3 text-xs text-white/55">',
      '                            Use the cancellation button in the player-links summary above if you do not want these links to remain payable.',
      '                          </p>',
    ].join("\n"),
  );
}

if (
  !source.includes("Cancel all unpaid player links") ||
  !source.includes("cancelledAt: new Date()") ||
  !source.includes("paymentToken: null") ||
  !source.includes("Each payment will reduce that balance") ||
  source.includes(
    '    !entry.fixtureId ||\n    entry.displayStatus !== "PAID" ||\n    entry.playerOpenPence <= 0',
  )
) {
  throw new Error("Captain unpaid player-link cancellation was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Captains can cancel all still-unpaid player links from the team payment ledger while preserving completed payments.",
);
