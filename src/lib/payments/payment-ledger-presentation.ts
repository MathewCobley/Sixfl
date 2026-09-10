/** Presentation of the canonical ledger only. These helpers do not decide what
 * is owed, authorise a concession, change a receipt, or create team credit. */
const money = (pence: number) => new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP",
}).format(pence / 100);

export function getPlayerSettlementBreakdown(entry: {
  playerPaidPence: number;
  playerSubsidyPence: number;
}) {
  return {
    cashPence: entry.playerPaidPence,
    adjustmentPence: entry.playerSubsidyPence,
    totalPence: entry.playerPaidPence + entry.playerSubsidyPence,
    detail: `${money(entry.playerPaidPence)} received from players + ${money(entry.playerSubsidyPence)} SIXFL player adjustments`,
  };
}

export function getCurrentSettlementText(entry: {
  amountPence: number;
  coveredPence: number;
  settledPence?: number;
  outstandingPence: number;
}) {
  const recorded = entry.settledPence ?? entry.coveredPence;
  const applied = Math.min(recorded, entry.amountPence);
  const excess = Math.max(recorded - applied, 0);
  return `${money(applied)} applied to ${money(entry.amountPence)} charge; ${money(entry.outstandingPence)} outstanding.${excess > 0 ? ` ${money(excess)} settlement above this charge; adjustments are not cash or team credit.` : ""}`;
}

/** Old reconciliation wrote a settlement snapshot into a description. Strip
 * only that exact generated sentence from the display; preserve the database
 * description, arbitrary administrator notes and accounting/audit markers.
 * Current settlement must be rendered from the ledger, never this old prose. */
export function getChargeDescriptionForDisplay(description: string | null | undefined) {
  if (!description) return null;
  const cleaned = description
    .replace(/Covered by player (?:shares|payments) totalling £[0-9,]+\.\d{2}\./g, "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");
  return cleaned || null;
}
