const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/match-fees/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in matchday squad page.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  [
    "function getFeeStatusLabel(status: PlayerMatchFeeStatus) {",
    "  switch (status) {",
    '    case "PAID":',
    '      return "Paid";',
    '    case "WAIVED":',
    '      return "Waived";',
    '    case "CANCELLED":',
    '      return "Cancelled";',
    "    default:",
    '      return "Open";',
    "  }",
    "}",
  ].join("\n"),
  [
    "function getFeeStatusLabel(status: PlayerMatchFeeStatus) {",
    "  switch (status) {",
    '    case "PAID":',
    '      return "Paid";',
    '    case "WAIVED":',
    '      return "Waived";',
    '    case "CANCELLED":',
    '      return "Cancelled";',
    "    default:",
    '      return "Open";',
    "  }",
    "}",
    "",
    "function getFeeWaiverReason(",
    "  fee: {",
    "    status: PlayerMatchFeeStatus;",
    "    amountPence: number;",
    "    note: string | null;",
    "  },",
    "  currentTeamFixtureFeePence: number | null,",
    ") {",
    '  if (fee.status !== "WAIVED") return null;',
    "",
    '  const note = fee.note?.toLowerCase() ?? "";',
    '  const paidCaptainDirectly = note.includes("paid captain directly:");',
    '  const wasZeroTeamFixture = note.includes("team fixture fee is £0.00");',
    '  const hasZeroPlayerOverride = note.includes("player match fee override: £0.00");',
    '  const hasExplicitManualWaiver = note.includes("fee waived manually by sixfl admin");',
    "",
    "  if (paidCaptainDirectly) {",
    "    return {",
    '      label: "Paid captain directly",',
    '      detail: "The captain recorded that this player paid them directly rather than using a SIXFL payment link. No individual player payment is due to SIXFL; the captain remains responsible for settling the team fixture charge.",',
    '      classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",',
    "    };",
    "  }",
    "",
    "  if (wasZeroTeamFixture && currentTeamFixtureFeePence !== 0) {",
    "    return {",
    '      label: "Review old £0 waiver",',
    '      detail: "This was waived when the team fixture fee was £0. The fixture now has a positive fee, so save the squad again before collecting payments.",',
    '      classes: "border-amber-400/25 bg-amber-500/10 text-amber-100",',
    "    };",
    "  }",
    "",
    "  if (wasZeroTeamFixture || currentTeamFixtureFeePence === 0) {",
    "    return {",
    '      label: "No fee — team fixture £0",',
    '      detail: "The team fixture fee is £0, so this selected player has no individual match fee or payment link.",',
    '      classes: "border-sky-400/25 bg-sky-500/10 text-sky-100",',
    "    };",
    "  }",
    "",
    "  if (hasZeroPlayerOverride) {",
    "    return {",
    '      label: "No fee — player override £0",',
    '      detail: "This player has an individual £0 match-fee override for this team.",',
    '      classes: "border-sky-400/25 bg-sky-500/10 text-sky-100",',
    "    };",
    "  }",
    "",
    "  if (fee.amountPence === 0) {",
    "    return {",
    '      label: "No fee due",',
    '      detail: "This selected player has a £0 fee. Check the player override or fixture settings if that was not intended.",',
    '      classes: "border-sky-400/25 bg-sky-500/10 text-sky-100",',
    "    };",
    "  }",
    "",
    "  if (hasExplicitManualWaiver) {",
    "    return {",
    '      label: "Fee waived manually",',
    '      detail: "This fee has an explicit admin-waiver audit note. No payment is currently due.",',
    '      classes: "border-violet-400/25 bg-violet-500/10 text-violet-100",',
    "    };",
    "  }",
    "",
    "  return {",
    '    label: "Waived — reason not recorded",',
    '    detail: "This fee is stored as waived, but the record does not say why or who changed it. Older/system-created waivers must not be described as a manual admin action without evidence.",',
    '    classes: "border-amber-400/25 bg-amber-500/10 text-amber-100",',
    "  };",
    "}",
  ].join("\n"),
  "fee waiver reason helper",
);

replaceRequired(
  [
    '      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 text-sm text-sky-50/80">',
    '        <p className="font-semibold text-white">How availability and fees work together</p>',
    '        <p className="mt-2 leading-6">',
    "          Unavailable does not silently alter money. Remove the player from this matchday squad to cancel an unpaid fee. If they have already paid, SIXFL will ask for confirmation, retain the payment for audit and create player credit.",
    "        </p>",
    "      </section>",
  ].join("\n"),
  [
    '      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 text-sm text-sky-50/80">',
    '        <p className="font-semibold text-white">How availability and fees work together</p>',
    '        <p className="mt-2 leading-6">',
    "          Unavailable does not silently alter money. Remove the player from this matchday squad to cancel an unpaid fee. If they have already paid, SIXFL will ask for confirmation, retain the payment for audit and create player credit.",
    "        </p>",
    "      </section>",
    "",
    "      {waivedCount > 0 ? (",
    '        <section className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.07] p-5 text-sm text-violet-50/80">',
    '          <p className="font-semibold text-white">Why some players show no fee due</p>',
    '          <p className="mt-2 leading-6">',
    "            Waived is the underlying no-player-link status used for several different reasons, including a player paying the captain directly. Each row below shows the recorded reason rather than treating every waived record as an admin waiver.",
    "          </p>",
    "        </section>",
    "      ) : null}",
  ].join("\n"),
  "waived fee explanation",
);

replaceRequired(
  [
    "                        const unavailableWarning =",
    '                          availability?.response === "UNAVAILABLE" && existingFee',
    "                            ? getUnavailableFeeWarning({",
    "                                status: existingFee.status,",
    "                                amountPence: existingFee.amountPence,",
    "                              })",
    "                            : null;",
  ].join("\n"),
  [
    "                        const unavailableWarning =",
    '                          availability?.response === "UNAVAILABLE" && existingFee',
    "                            ? getUnavailableFeeWarning({",
    "                                status: existingFee.status,",
    "                                amountPence: existingFee.amountPence,",
    "                              })",
    "                            : null;",
    "                        const waiverReason = existingFee",
    "                          ? getFeeWaiverReason(",
    "                              existingFee,",
    "                              selectedTeamFixtureFeePence,",
    "                            )",
    "                          : null;",
  ].join("\n"),
  "member waiver reason",
);

replaceRequired(
  [
    "                                {existingFee ? (",
    "                                  <span",
    "                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getFeeStatusClasses(",
    "                                      existingFee.status,",
    "                                    )}`}",
    "                                  >",
    "                                    Fee {getFeeStatusLabel(existingFee.status)}",
    "                                  </span>",
    "                                ) : null}",
  ].join("\n"),
  [
    "                                {existingFee ? (",
    "                                  <span",
    "                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${",
    "                                      waiverReason?.classes ??",
    "                                      getFeeStatusClasses(existingFee.status)",
    "                                    }`}",
    "                                  >",
    "                                    {waiverReason?.label ??",
    "                                      `Fee ${getFeeStatusLabel(existingFee.status)}`}",
    "                                  </span>",
    "                                ) : null}",
  ].join("\n"),
  "member waiver badge",
);

replaceRequired(
  [
    "                              {unavailableWarning ? (",
    '                                <span className="mt-2 block rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">',
    "                                  {unavailableWarning}",
    "                                </span>",
    "                              ) : null}",
  ].join("\n"),
  [
    "                              {waiverReason ? (",
    '                                <span className={`mt-2 block rounded-xl border px-3 py-2 text-xs leading-5 ${waiverReason.classes}`}>',
    "                                  {waiverReason.detail}",
    "                                </span>",
    "                              ) : null}",
    "                              {unavailableWarning ? (",
    '                                <span className="mt-2 block rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">',
    "                                  {unavailableWarning}",
    "                                </span>",
    "                              ) : null}",
  ].join("\n"),
  "member waiver detail",
);

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes("getFeeWaiverReason") ||
  !source.includes("Why some players show no fee due") ||
  !source.includes("Paid captain directly") ||
  !source.includes("Review old £0 waiver") ||
  !source.includes("No fee — player override £0") ||
  !source.includes("Waived — reason not recorded")
) {
  throw new Error("Matchday fee waiver reasons were not applied correctly.");
}

console.log(
  "Matchday squad rows now distinguish captain-collected fees from true waivers and other no-player-link reasons.",
);
