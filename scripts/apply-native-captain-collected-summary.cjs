const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in squad payments.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  [
    "function isCaptainCollected(note?: string | null) {",
    '  return Boolean(note?.includes("captain/organiser marked"));',
    "}",
  ].join("\n"),
  [
    "function isCaptainCollected(note?: string | null) {",
    '  const normalised = note?.toLowerCase() ?? "";',
    "  return (",
    '    normalised.includes("captain/organiser marked") ||',
    '    normalised.includes("paid captain directly: captain collected")',
    "  );",
    "}",
  ].join("\n"),
  "captain-collected note recognition",
);

replaceRequired(
  [
    "  const selectedWaivedCount = selectedFees.filter(",
    '    (fee) => fee.status === "WAIVED" && !isCaptainCollected(fee.note),',
    "  ).length;",
    "  const playerAllocationPence = selectedFees.reduce(",
  ].join("\n"),
  [
    "  const selectedWaivedCount = selectedFees.filter(",
    '    (fee) => fee.status === "WAIVED" && !isCaptainCollected(fee.note),',
    "  ).length;",
    "  const captainCollectedFees = selectedFees.filter((fee) =>",
    "    isCaptainCollected(fee.note),",
    "  );",
    "  const captainCollectedPence = captainCollectedFees.reduce(",
    "    (sum, fee) => sum + fee.amountPence,",
    "    0,",
    "  );",
    "  const captainCollectedPlayerCount = captainCollectedFees.length;",
    "  const playerAllocationPence = selectedFees.reduce(",
  ].join("\n"),
  "captain-collected totals",
);

replaceRequired(
  '    summaryText = `${formatMoney(playerAllocationPence)} has been assigned across ${selectedFees.length} player${selectedFees.length === 1 ? "" : "s"}. Players have paid ${formatMoney(collectedPence)} and ${formatMoney(playerOutstandingPence)} is still awaiting payment from players. The team balance remaining is ${formatMoney(stillToCoverPence)}.`;',
  '    summaryText = `${formatMoney(playerAllocationPence)} has been assigned across ${selectedFees.length} player${selectedFees.length === 1 ? "" : "s"}. Players have paid ${formatMoney(collectedPence)} through SIXFL and ${formatMoney(playerOutstandingPence)} is still awaiting payment from players. The team balance remaining is ${formatMoney(stillToCoverPence)}.`;',
  "native summary paid-through-SIXFL wording",
);

replaceRequired(
  [
    '        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{summaryText}</p>',
    "        {summaryNextStep ? (",
  ].join("\n"),
  [
    '        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{summaryText}</p>',
    "        {captainCollectedPence > 0 ? (",
    '          <div className="mt-3 max-w-4xl rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-50/85">',
    '            <span className="font-semibold text-cyan-50">',
    "              Paid directly to captain: {formatMoney(captainCollectedPence)} from{\" \"}",
    "              {captainCollectedPlayerCount} player",
    '              {captainCollectedPlayerCount === 1 ? "" : "s"}.",
    "            </span>{\" \"}",
    "            This is recorded separately from SIXFL player-link payments. Any amount the",
    "            captain passes on to SIXFL is reflected in the team balance shown above.",
    "          </div>",
    "        ) : null}",
    "        {summaryNextStep ? (",
  ].join("\n"),
  "native captain-collected summary panel",
);

if (
  !source.includes("captainCollectedPence") ||
  !source.includes("Paid directly to captain:") ||
  !source.includes("captain passes on to SIXFL") ||
  !source.includes("Players have paid ${formatMoney(collectedPence)} through SIXFL")
) {
  throw new Error("Native captain-collected payment summary was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Squad payments now show captain-collected player money natively in the server-rendered summary.",
);
