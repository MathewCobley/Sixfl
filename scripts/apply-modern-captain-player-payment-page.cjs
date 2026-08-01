const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${pagePath}`);
  }
  source = source.replace(before, after);
}

if (!source.includes("What is happening with this fixture?")) {
  console.log("Modern squad-payment page not present; compatibility patch skipped.");
  process.exit(0);
}

replaceOnce(
  [
    "function messageForSaved(saved?: string) {",
    '  return saved === "collection_created"',
    '    ? "Player collection saved. Payment requests and statuses are shown below."',
    "    : null;",
    "}",
  ].join("\n"),
  [
    "function messageForSaved(saved?: string) {",
    '  if (saved === "collection_created") {',
    '    return "Player collection saved. Payment requests and statuses are shown below.";',
    "  }",
    '  if (saved === "collection_closed") {',
    '    return "Unpaid player links were closed and can no longer be used.";',
    "  }",
    "  return null;",
    "}",
  ].join("\n"),
  "modern collection saved messages",
);

replaceOnce(
  [
    '  if (error === "fixture_not_found") {',
    '    return "That fixture could not be found for this team.";',
    "  }",
    "  return null;",
  ].join("\n"),
  [
    '  if (error === "fixture_not_found") {',
    '    return "That fixture could not be found for this team.";',
    "  }",
    '  if (error === "fixture_not_payable") {',
    '    return "Payment links cannot be created for an unpublished, postponed or cancelled fixture.";',
    "  }",
    '  if (error === "no_team_fee") {',
    '    return "SIXFL has not set a positive fee for this team on the selected fixture, so player payment links cannot be created.";',
    "  }",
    '  if (error === "no_team_charge") {',
    '    return "The fixture does not have an active team charge. SIXFL needs to review the fixture before player links can be created.";',
    "  }",
    "  return null;",
  ].join("\n"),
  "modern collection error messages",
);

replaceOnce(
  [
    "  const playerAllocationPence = selectedFees.reduce(",
    "    (sum, fee) => sum + fee.amountPence,",
    "    0,",
    "  );",
    "  const hasPlayerCollection = selectedFees.length > 0;",
    "  const selectedTeamFeePence =",
    "    selectedEntry?.amountPence ?? selectedFixture?.matchFeePence ?? 4000;",
    "  const directPaidPence = selectedEntry?.directPaidPence ?? 0;",
    "  const collectedPence = selectedEntry?.playerPaidPence ?? 0;",
    "  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;",
    "  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;",
  ].join("\n"),
  [
    "  const playerAllocationPence = selectedFees.reduce(",
    "    (sum, fee) => sum + fee.amountPence,",
    "    0,",
    "  );",
    "  const hasPlayerCollection = selectedFees.length > 0;",
    "  const selectedFixtureTeamFeePence = selectedFixture",
    "    ? relatedTeamIds.includes(selectedFixture.homeTeamId)",
    "      ? selectedFixture.homeMatchFeePence ?? selectedFixture.matchFeePence",
    "      : relatedTeamIds.includes(selectedFixture.awayTeamId)",
    "        ? selectedFixture.awayMatchFeePence ?? selectedFixture.matchFeePence",
    "        : selectedFixture.matchFeePence",
    "    : null;",
    "  const selectedTeamFeePence =",
    "    selectedEntry?.amountPence ??",
    "    selectedFixtureTeamFeePence ??",
    "    (selectedFixture ? 4000 : 0);",
    "  const directPaidPence = selectedEntry?.directPaidPence ?? 0;",
    "  const playerPaidWithoutLedgerPence = selectedFees",
    '    .filter((fee) => fee.status === "PAID")',
    "    .reduce((sum, fee) => sum + fee.amountPence, 0);",
    "  const playerOpenWithoutLedgerPence = selectedFees",
    '    .filter((fee) => fee.status === "OPEN")',
    "    .reduce((sum, fee) => sum + fee.amountPence, 0);",
    "  const collectedPence =",
    "    selectedEntry?.playerPaidPence ?? playerPaidWithoutLedgerPence;",
    "  const playerOutstandingPence =",
    "    selectedEntry?.playerOpenPence ?? playerOpenWithoutLedgerPence;",
    "  const stillToCoverPence =",
    "    selectedEntry?.outstandingPence ??",
    "    Math.max(selectedTeamFeePence - collectedPence, 0);",
  ].join("\n"),
  "modern team-specific fixture fee totals",
);

replaceOnce(
  [
    '          <p className="mt-1 text-sm text-white/55">',
    "            Select the players who should contribute, set their amount and choose how each",
    "            payment will be handled. Saving this form creates or updates the player payment",
    "            rows; it does not mark the team fee as paid.",
    "          </p>",
  ].join("\n"),
  [
    '          <p className="mt-1 text-sm text-white/55">',
    "            Select the players who should contribute, set their amount and choose how each",
    "            payment will be handled. Saving this form creates or updates the player payment",
    "            rows; it does not mark the team fee as paid. If completed player payments exceed",
    "            a positive fixture fee, the excess is added to the team credit pot.",
    "          </p>",
  ].join("\n"),
  "modern team-credit explanation",
);

replaceOnce(
  [
    "      {selectedFees.length > 0 ? (",
    '        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">',
  ].join("\n"),
  [
    "      {selectedFixture && currentCollectionCanBeClosed ? (",
    '        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">',
    '          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">',
    "            <div>",
    '              <h2 className="text-lg font-semibold text-amber-50">Close the current unpaid collection</h2>',
    '              <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-100/70">',
    "                This cancels every unpaid or no-link row for this fixture, invalidates its",
    "                player payment links and preserves any payment already completed.",
    "              </p>",
    "            </div>",
    "            <form action={closeCaptainSquadPaymentCollectionAction}>",
    '              <input type="hidden" name="teamId" value={team.id} />',
    '              <input type="hidden" name="fixtureId" value={selectedFixture.id} />',
    '              <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-200/30 bg-amber-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-200">',
    "                Close unpaid links",
    "              </button>",
    "            </form>",
    "          </div>",
    "        </section>",
    "      ) : null}",
    "",
    "      {selectedFees.length > 0 ? (",
    '        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">',
  ].join("\n"),
  "modern close-collection controls",
);

if (
  !source.includes("selectedFixtureTeamFeePence") ||
  !source.includes("Close unpaid links") ||
  !source.includes("team credit pot")
) {
  throw new Error("Modern squad-payment compatibility patch did not complete.");
}

fs.writeFileSync(absolutePath, source, "utf8");
console.log(
  "Applied team-specific fees, safety messages and close controls to the modern squad-payment page.",
);
