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

// Captains can cancel still-unpaid player payment links without touching payments
// already received. Keep this rule at the server-action level so presentation
// changes cannot accidentally re-lock the action.
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

const simplifiedLedgerApplied =
  source.includes("Player link still open — not needed") &&
  source.includes("Payment source");

if (simplifiedLedgerApplied) {
  // The simplified ledger already has the paid-fixture close-link control. Add
  // one compact cancellation control for open/part-paid fixtures only.
  if (!source.includes("Player payment links are open")) {
    const actionMarker = '                      <div className="flex flex-col gap-2 lg:items-end">';
    if (!source.includes(actionMarker)) {
      throw new Error("Expected simplified ledger action marker was not found in captain team payments.");
    }

    source = source.replace(
      actionMarker,
      [
        '                      {entry.displayStatus !== "PAID" && entry.playerOpenPence > 0 ? (',
        '                        <div className="w-full max-w-xl rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3 text-left">',
        '                          <div className="font-semibold text-amber-100">Player payment links are open</div>',
        '                          <p className="mt-1 text-xs leading-5 text-amber-50/75">',
        '                            Leave them open for players to pay, or cancel the remaining unpaid links. Payments already received are not affected.',
        '                          </p>',
        '                          <form action={closeSettledChargePlayerLinksAction} className="mt-3">',
        '                            <input type="hidden" name="teamId" value={team.id} />',
        '                            <input type="hidden" name="chargeId" value={entry.chargeId} />',
        '                            <button',
        '                              type="submit"',
        '                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25"',
        '                            >',
        '                              Cancel unpaid player {unpaidPlayers.length === 1 ? "link" : "links"}',
        '                            </button>',
        '                          </form>',
        '                        </div>',
        '                      ) : null}',
        '',
        actionMarker,
      ].join("\n"),
    );
  }
} else {
  // Compatibility with the former detailed ledger if this script is ever run
  // before the simplified ledger preparation.
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
  replaceRequired(oldOpenLinksCopy, newOpenLinksCopy, "unpaid player-link summary controls");
}

if (
  !source.includes("cancelledAt: new Date()") ||
  !source.includes("paymentToken: null") ||
  source.includes(
    '    !entry.fixtureId ||\n    entry.displayStatus !== "PAID" ||\n    entry.playerOpenPence <= 0',
  ) ||
  (simplifiedLedgerApplied && !source.includes("Player payment links are open"))
) {
  throw new Error("Captain unpaid player-link cancellation was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Captains can cancel still-unpaid player links without reintroducing the old duplicate payment-ledger controls.",
);
