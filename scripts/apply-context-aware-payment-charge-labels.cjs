const fs = require("node:fs");
const path = require("node:path");

// The clear payment breakdown patch owns the payment-card markup. Apply it first
// so this follow-up can make the wording reflect the actual type of charge.
require("./apply-clear-fixture-payment-breakdown.cjs");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

if (!source.includes("const isKitCharge =")) {
  const totalAppliedBlock = `              const totalAppliedPence = Math.min(\n                entry.coveredPence,\n                entry.amountPence,\n              );`;

  const contextualBlock = `${totalAppliedBlock}\n              const isKitCharge = entry.title\n                .trim()\n                .toLowerCase()\n                .startsWith(\"additional kit contribution\");`;

  if (!source.includes(totalAppliedBlock)) {
    throw new Error("Could not find payment breakdown derived values for contextual labels.");
  }
  source = source.replace(totalAppliedBlock, contextualBlock);
}

source = source.replace(
  `                          <span className="text-sm font-semibold text-white">\n                            Fixture charge\n                          </span>`,
  `                          <span className="text-sm font-semibold text-white">\n                            {isKitCharge\n                              ? "Kit charge"\n                              : entry.fixtureId\n                                ? "Fixture charge"\n                                : "Charge"}\n                          </span>`,
);

source = source.replace(
  `                          <div className="flex items-center justify-between gap-4">\n                            <span>Player shares settled</span>\n                            <span className="font-semibold text-white">\n                              {formatMoney(playerSettledPence)}\n                            </span>\n                          </div>`,
  `                          {!isKitCharge ? (\n                            <div className="flex items-center justify-between gap-4">\n                              <span>Player shares settled</span>\n                              <span className="font-semibold text-white">\n                                {formatMoney(playerSettledPence)}\n                              </span>\n                            </div>\n                          ) : null}`,
);

source = source.replace(
  `                            <span>Team paid</span>`,
  `                            <span>{isKitCharge ? "Paid" : "Team paid"}</span>`,
);

source = source.replace(
  `                            <span>Team credit used</span>`,
  `                            <span>{isKitCharge ? "Credit used" : "Team credit used"}</span>`,
);

source = source.replace(
  `                              Total applied to fixture`,
  `                              {isKitCharge\n                                ? "Total applied to kit"\n                                : entry.fixtureId\n                                  ? "Total applied to fixture"\n                                  : "Total applied"}`,
);

source = source.replace(
  `                              Team payment and credit details`,
  `                              {isKitCharge\n                                ? "Kit payment details"\n                                : entry.fixtureId\n                                  ? "Team payment and credit details"\n                                  : "Payment details"}`,
);

source = source.replace(
  `{isTeamCredit ? "Team credit used" : "Team payment"}`,
  `{isTeamCredit\n                                          ? isKitCharge\n                                            ? "Credit used"\n                                            : "Team credit used"\n                                          : isKitCharge\n                                            ? "Kit payment"\n                                            : "Team payment"}`,
);

if (
  !source.includes('const isKitCharge = entry.title') ||
  !source.includes('? "Kit charge"') ||
  !source.includes('? "Total applied to kit"') ||
  !source.includes('? "Kit payment details"') ||
  !source.includes('? "Kit payment"')
) {
  throw new Error("Context-aware payment charge labels were not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log("Kit charges now use kit-specific wording in the captain payment ledger.");
