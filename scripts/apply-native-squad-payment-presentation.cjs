const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

const pagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
let page = read(pagePath);

const fixtureIdentityImport =
  'import SquadPaymentFixtureIdentity from "@/components/captain/SquadPaymentFixtureIdentity";';
if (!page.includes(fixtureIdentityImport)) {
  page = replaceRequired(
    page,
    'import Link from "next/link";\nimport { notFound } from "next/navigation";',
    `import Link from "next/link";\nimport { notFound } from "next/navigation";\n\n${fixtureIdentityImport}`,
    "native fixture identity import",
  );
}

page = page.replace(
  'homeTeam: { select: { id: true, name: true } },',
  'homeTeam: { select: { id: true, name: true, logoUrl: true } },',
);
page = page.replace(
  'awayTeam: { select: { id: true, name: true } },',
  'awayTeam: { select: { id: true, name: true, logoUrl: true } },',
);

const summaryStateAnchor =
  '  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;\n  const savedMessage = messageForSaved(sp.saved);';
if (!page.includes("const selectedFixtureIsCancelled")) {
  page = replaceRequired(
    page,
    summaryStateAnchor,
    [
      '  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;',
      '  const selectedFixtureIsCancelled = selectedEntry?.displayStatus === "VOID";',
      '  const savedMessage = messageForSaved(sp.saved);',
    ].join("\n"),
    "native squad payment summary state",
  );
}

page = replaceRequired(
  page,
  [
    '  const summaryTone: Tone = !selectedEntry',
    '    ? "white"',
    '    : stillToCoverPence <= 0',
    '      ? "emerald"',
    '      : hasPlayerCollection',
    '        ? "amber"',
    '        : "white";',
  ].join("\n"),
  [
    '  const summaryTone: Tone = !selectedEntry',
    '    ? "white"',
    '    : selectedFixtureIsCancelled',
    '      ? "red"',
    '      : stillToCoverPence <= 0 && playerOutstandingPence > 0',
    '        ? "amber"',
    '        : stillToCoverPence <= 0',
    '          ? "emerald"',
    '          : hasPlayerCollection',
    '            ? "amber"',
    '            : "white";',
  ].join("\n"),
  "native squad payment summary tone",
);

page = replaceRequired(
  page,
  [
    '  if (selectedEntry && stillToCoverPence <= 0) {',
    '    summaryTitle = "This fixture fee is fully covered.";',
    '    summaryText = `${formatMoney(selectedEntry.amountPence)} has been covered: ${formatMoney(directPaidPence)} paid directly by the team and ${formatMoney(collectedPence)} paid by players.`;',
    '  } else if (selectedEntry && !hasPlayerCollection) {',
  ].join("\n"),
  [
    '  if (selectedEntry && selectedFixtureIsCancelled) {',
    '    summaryTitle = "This fixture was cancelled — no fee is due.";',
    '    summaryText = "The team charge is void and no player collection is required for this fixture.";',
    '  } else if (selectedEntry && stillToCoverPence <= 0 && playerOutstandingPence > 0) {',
    '    summaryTitle = `Fixture fee covered — ${formatMoney(playerOutstandingPence)} still to collect from players.`;',
    '    summaryText = `${formatMoney(selectedEntry.amountPence)} is already covered for SIXFL. The remaining open player requests can still be paid; completed excess is added to the team credit pot.`;',
    '    summaryNextStep = "The open payment links remain valid for the players shown as awaiting payment below.";',
    '  } else if (selectedEntry && stillToCoverPence <= 0) {',
    '    summaryTitle = "This fixture fee is fully covered.";',
    '    summaryText = `${formatMoney(selectedEntry.amountPence)} has been covered: ${formatMoney(directPaidPence)} paid directly by the team and ${formatMoney(collectedPence)} paid by players.`;',
    '  } else if (selectedEntry && !hasPlayerCollection) {',
  ].join("\n"),
  "native squad payment summary copy",
);

page = replaceRequired(
  page,
  [
    '              const badgeLabel =',
    '                entry.outstandingPence <= 0',
    '                  ? "Fee covered"',
    '                  : hasCollection',
    '                    ? "Collection active"',
    '                    : "Collection not set up";',
    '              const badgeStatus =',
    '                entry.outstandingPence <= 0 ? "PAID" : hasCollection ? "OPEN" : "WAIVED";',
  ].join("\n"),
  [
    '              const isCancelled = entry.displayStatus === "VOID";',
    '              const badgeLabel = isCancelled',
    '                ? "Cancelled — no fee due"',
    '                : entry.outstandingPence <= 0 && entry.playerOpenPence > 0',
    '                  ? `${formatMoney(entry.playerOpenPence)} still to collect`',
    '                  : entry.outstandingPence <= 0',
    '                    ? "Fee covered"',
    '                    : hasCollection',
    '                      ? "Collection active"',
    '                      : "Collection not set up";',
    '              const badgeStatus = isCancelled',
    '                ? "CANCELLED"',
    '                : entry.outstandingPence <= 0 && entry.playerOpenPence > 0',
    '                  ? "OPEN"',
    '                  : entry.outstandingPence <= 0',
    '                    ? "PAID"',
    '                    : hasCollection',
    '                      ? "OPEN"',
    '                      : "WAIVED";',
  ].join("\n"),
  "native fixture payment badge state",
);

page = replaceRequired(
  page,
  '<div className="text-sm font-semibold">{entry.fixtureLabel}</div>',
  [
    '<div className="min-w-0 text-sm font-semibold">',
    '  <SquadPaymentFixtureIdentity',
    '    fixture={entry.fixtureId ? fixtureById.get(entry.fixtureId) ?? null : null}',
    '    fallbackLabel={entry.fixtureLabel}',
    '    compact',
    '  />',
    '</div>',
  ].join("\n"),
  "native fixture card identity",
);

page = replaceRequired(
  page,
  [
    '                <div className="text-sm font-semibold text-white">',
    '                  {fixtureTitle(selectedFixture)}',
    '                </div>',
  ].join("\n"),
  [
    '                <div className="min-w-0 text-sm font-semibold text-white">',
    '                  <SquadPaymentFixtureIdentity',
    '                    fixture={selectedFixture}',
    '                    fallbackLabel={fixtureTitle(selectedFixture)}',
    '                  />',
    '                </div>',
  ].join("\n"),
  "native selected fixture identity",
);

write(pagePath, page);

const bridgePath = "src/components/captain/TeamAutoPayCopyBridge.tsx";
let bridge = read(bridgePath);

const squadTimerBranch = [
  '    const isTeamPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/payments\\/?$/.test(pathname);',
  '    const isSquadPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/player-payments\\/?$/.test(pathname);',
  '',
  '    if (!isTeamPaymentsPage && !isSquadPaymentsPage) return;',
  '',
  '    const apply = () => {',
  '      if (isTeamPaymentsPage) {',
  '        updatePaymentCopy(params.get("autopay"));',
  '      }',
  '      if (isSquadPaymentsPage) {',
  '        updateSquadPaymentClarity(params);',
  '      }',
  '    };',
  '',
  '    if (isSquadPaymentsPage) {',
  '      const frame = window.requestAnimationFrame(apply);',
  '      const timer = window.setTimeout(apply, 250);',
  '',
  '      return () => {',
  '        window.cancelAnimationFrame(frame);',
  '        window.clearTimeout(timer);',
  '      };',
  '    }',
  '',
  '    apply();',
].join("\n");

const teamOnlyBranch = [
  '    const isTeamPaymentsPage = /^\\/captain\\/team\\/[^/]+\\/payments\\/?$/.test(pathname);',
  '',
  '    if (!isTeamPaymentsPage) return;',
  '',
  '    const apply = () => {',
  '      updatePaymentCopy(params.get("autopay"));',
  '    };',
  '',
  '    apply();',
].join("\n");

if (!bridge.includes("if (!isTeamPaymentsPage) return;")) {
  bridge = replaceRequired(
    bridge,
    squadTimerBranch,
    teamOnlyBranch,
    "remove squad payments DOM presentation",
  );
}
write(bridgePath, bridge);

if (
  !page.includes("SquadPaymentFixtureIdentity") ||
  !page.includes("Fixture fee covered —") ||
  !page.includes("Cancelled — no fee due") ||
  bridge.includes("updateSquadPaymentClarity(params)")
) {
  throw new Error("Native squad payment presentation was not applied correctly.");
}

console.log(
  "Squad payment labels, collection warnings and team badges are now rendered by React on the server; the global DOM bridge no longer touches this page.",
);
