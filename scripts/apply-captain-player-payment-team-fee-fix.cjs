const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected captain squad payment source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

const pagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const actionPath =
  "src/app/captain/team/[teamid]/player-payments/actions.ts";

replaceOnce(
  pagePath,
  [
    '  const defaultAmount = currentTeamFees.find((fee) => fee.status !== "PAID")?.amountPence ?? 400;',
    '  const selectedPaidPlayerCount = selectedFees.filter((fee) => fee.status === "PAID").length;',
    '  const selectedOpenPlayerCount = selectedFees.filter((fee) => fee.status === "OPEN").length;',
    '  const selectedWaivedCount = selectedFees.filter((fee) => fee.status === "WAIVED").length;',
    '  const playerAllocationPence = selectedFees.reduce((sum, fee) => sum + fee.amountPence, 0);',
    '  const ledgerChargePence = selectedEntry?.amountPence ?? 0;',
    '  const selectedTeamFeePence = selectedEntry?.amountPence ?? selectedFixture?.matchFeePence ?? 4000;',
    '  const collectedPence = selectedEntry?.playerPaidPence ?? 0;',
    '  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;',
    '  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;',
  ].join("\n"),
  [
    '  const defaultAmount = currentTeamFees.find((fee) => fee.status !== "PAID")?.amountPence ?? 400;',
    '  const selectedPaidPlayerCount = selectedFees.filter((fee) => fee.status === "PAID").length;',
    '  const selectedOpenPlayerCount = selectedFees.filter((fee) => fee.status === "OPEN").length;',
    '  const selectedWaivedCount = selectedFees.filter((fee) => fee.status === "WAIVED").length;',
    '  const playerAllocationPence = selectedFees.reduce((sum, fee) => sum + fee.amountPence, 0);',
    '  const selectedFixtureTeamFeePence = selectedFixture',
    '    ? relatedTeamIds.includes(selectedFixture.homeTeamId)',
    '      ? selectedFixture.homeMatchFeePence ?? selectedFixture.matchFeePence',
    '      : relatedTeamIds.includes(selectedFixture.awayTeamId)',
    '        ? selectedFixture.awayMatchFeePence ?? selectedFixture.matchFeePence',
    '        : selectedFixture.matchFeePence',
    '    : null;',
    '  const ledgerChargePence = selectedEntry?.amountPence ?? 0;',
    '  const selectedTeamFeePence =',
    '    selectedEntry?.amountPence ??',
    '    selectedFixtureTeamFeePence ??',
    '    (selectedFixture ? 4000 : 0);',
    '  const playerPaidWithoutLedgerPence = selectedFees',
    '    .filter((fee) => fee.status === "PAID")',
    '    .reduce((sum, fee) => sum + fee.amountPence, 0);',
    '  const playerOpenWithoutLedgerPence = selectedFees',
    '    .filter((fee) => fee.status === "OPEN")',
    '    .reduce((sum, fee) => sum + fee.amountPence, 0);',
    '  const collectedPence =',
    '    selectedEntry?.playerPaidPence ?? playerPaidWithoutLedgerPence;',
    '  const playerOutstandingPence =',
    '    selectedEntry?.playerOpenPence ?? playerOpenWithoutLedgerPence;',
    '  const stillToCoverPence =',
    '    selectedEntry?.outstandingPence ??',
    '    Math.max(selectedTeamFeePence - collectedPence, 0);',
    '  const chargeReferencePence = selectedEntry',
    '    ? ledgerChargePence',
    '    : selectedTeamFeePence;',
  ].join("\n"),
);

replaceOnce(
  pagePath,
  '          { label: "Your team fee", value: formatMoney(selectedTeamFeePence), text: selectedEntry ? "Open team charge in ledger." : "No open charge in ledger.", tone: selectedEntry ? "white" as Tone : "emerald" as Tone },',
  [
    '          {',
    '            label: "Your team fee",',
    '            value: formatMoney(selectedTeamFeePence),',
    '            text: selectedEntry',
    '              ? "Fixture/team charge in ledger."',
    '              : selectedFixture',
    '                ? "Fee set for your team on this fixture."',
    '                : "No fixture selected.",',
    '            tone: selectedEntry || selectedFixture ? "white" as Tone : "emerald" as Tone,',
    '          },',
  ].join("\n"),
);

replaceOnce(
  pagePath,
  '          { label: "Ledger still to cover", value: formatMoney(stillToCoverPence), text: selectedEntry ? "Team charge minus counted payments." : "No action needed.", tone: stillToCoverPence > 0 ? "red" as Tone : "emerald" as Tone },',
  [
    '          {',
    '            label: selectedEntry ? "Ledger still to cover" : "Team fee still to cover",',
    '            value: formatMoney(stillToCoverPence),',
    '            text: selectedEntry',
    '              ? "Team charge minus counted payments."',
    '              : selectedFixture',
    '                ? "Expected fee minus collected player payments."',
    '                : "No action needed.",',
    '            tone: stillToCoverPence > 0 ? "red" as Tone : "emerald" as Tone,',
    '          },',
  ].join("\n"),
);

replaceOnce(
  pagePath,
  '        <p className="mt-2 text-white/70">The ledger charge is {formatMoney(ledgerChargePence)}. Player allocation for the selected fixture is {formatMoney(playerAllocationPence)}. The ledger still to cover is {formatMoney(stillToCoverPence)}.</p>',
  '        <p className="mt-2 text-white/70">The {selectedEntry ? "ledger charge" : "team fixture fee"} is {formatMoney(chargeReferencePence)}. Player allocation for the selected fixture is {formatMoney(playerAllocationPence)}. The {selectedEntry ? "ledger" : "team fee"} still to cover is {formatMoney(stillToCoverPence)}.</p>',
);

replaceOnce(
  actionPath,
  '      select: { matchFeePence: true },',
  [
    '      select: {',
    '        homeTeamId: true,',
    '        awayTeamId: true,',
    '        matchFeePence: true,',
    '        homeMatchFeePence: true,',
    '        awayMatchFeePence: true,',
    '      },',
  ].join("\n"),
);

replaceOnce(
  actionPath,
  '  const baseTeamChargePence = fixture?.matchFeePence ?? charge.amountPence;',
  [
    '  const fixtureTeamFeePence =',
    '    fixture?.homeTeamId === input.teamId',
    '      ? fixture.homeMatchFeePence ?? fixture.matchFeePence',
    '      : fixture?.awayTeamId === input.teamId',
    '        ? fixture.awayMatchFeePence ?? fixture.matchFeePence',
    '        : fixture?.matchFeePence;',
    '  const baseTeamChargePence = fixtureTeamFeePence ?? charge.amountPence;',
  ].join("\n"),
);

console.log(
  "Applied team-specific fees and no-ledger totals to captain squad payments.",
);
