const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

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

// -----------------------------------------------------------------------------
// Admin UI: show the size-confirmation control on every order card, including
// DRAFT orders. The control reads its own persisted state, so the core kit-order
// projection does not need another build-time rewrite.
// -----------------------------------------------------------------------------
const adminPagePath = "src/app/(admin)/admin/kits/page.tsx";
let adminPage = read(adminPagePath);

if (!adminPage.includes('from "@/components/admin/kits/KitSizeConfirmationControl"')) {
  adminPage = replaceRequired(
    adminPage,
    'import KitDesignUploader from "@/components/admin/kits/KitDesignUploader";',
    'import KitDesignUploader from "@/components/admin/kits/KitDesignUploader";\nimport KitSizeConfirmationControl from "@/components/admin/kits/KitSizeConfirmationControl";',
    "kit size confirmation component import",
  );
}

if (!adminPage.includes('case "order_sizes_saved":')) {
  adminPage = replaceRequired(
    adminPage,
    '    case "order_notes_saved":\n      return `${team}\'s admin notes were saved.`;',
    '    case "order_sizes_saved":\n      return `${team}\'s shirt sizes confirmation was saved.`;\n    case "order_notes_saved":\n      return `${team}\'s admin notes were saved.`;',
    "kit sizes saved notice",
  );
}

if (!adminPage.includes("<KitSizeConfirmationControl")) {
  const asideOpen =
    '                    <aside className="border-t border-white/10 bg-black/20 p-5 sm:p-6 xl:border-l xl:border-t-0">';
  if (!adminPage.includes(asideOpen)) {
    throw new Error("Expected kit order workflow sidebar was not found.");
  }
  adminPage = adminPage.replace(
    asideOpen,
    [
      asideOpen,
      '                      <KitSizeConfirmationControl',
      '                        orderId={order.id}',
      '                        teamName={order.teamName}',
      '                      />',
      '',
    ].join("\n"),
  );
}

write(adminPagePath, adminPage);

// -----------------------------------------------------------------------------
// A5 pitch tally sheet: flag teams with an active kit order whose shirt sizes
// have not yet been confirmed. Active process = DRAFT/SUBMITTED/APPROVED/ORDERED.
// -----------------------------------------------------------------------------
const tallyPath = "src/app/api/admin/night-board/pitch-tally-sheets/route.ts";
let tally = read(tallyPath);

tally = replaceRequired(
  tally,
  'type ShinPadWarningCountRow = { teamId: string; warningCount: number };\ntype FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];',
  'type ShinPadWarningCountRow = { teamId: string; warningCount: number };\ntype KitSizeTryOnRow = { teamId: string };\ntype FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];',
  "tally kit size row type",
);

tally = replaceRequired(
  tally,
  '  homeShinPadWarningCount: number;\n  awayShinPadWarningCount: number;\n  prediction:',
  '  homeShinPadWarningCount: number;\n  awayShinPadWarningCount: number;\n  homeNeedsKitSizeCheck: boolean;\n  awayNeedsKitSizeCheck: boolean;\n  prediction:',
  "tally printable kit size flags",
);

tally = replaceRequired(
  tally,
  '    warningCount: number;\n    x: number;',
  '    warningCount: number;\n    needsKitSizeCheck: boolean;\n    x: number;',
  "team tally row kit size input",
);

if (!tally.includes('write(ctx, "TRY SHIRT SIZE"')) {
  const postWarningAnchor = [
    '  write(',
    '    ctx,',
    '    `PREVIOUS RECORDED: ${input.warningCount}`,',
    '    warningTextX,',
    '    warningBoxY + 10.5,',
    '    {',
    '      font: font(4.6, true),',
    '      fill: warningStage.fill,',
    '    },',
    '  );',
  ].join("\n");

  if (!tally.includes(postWarningAnchor)) {
    throw new Error("Expected escalated shin-pad warning block was not found on the A5 tally sheet.");
  }

  tally = tally.replace(
    postWarningAnchor,
    [
      postWarningAnchor,
      '',
      '  if (input.needsKitSizeCheck) {',
      '    write(ctx, "TRY SHIRT SIZE", input.x + 23, input.y + 37, {',
      '      font: font(5.2, true),',
      '      fill: "#b45309",',
      '    });',
      '  }',
    ].join("\n"),
  );
}

tally = replaceRequired(
  tally,
  '    warningCount: fixture.homeShinPadWarningCount,\n    x: rowX,',
  '    warningCount: fixture.homeShinPadWarningCount,\n    needsKitSizeCheck: fixture.homeNeedsKitSizeCheck,\n    x: rowX,',
  "home tally kit size flag",
);

tally = replaceRequired(
  tally,
  '    warningCount: fixture.awayShinPadWarningCount,\n    x: rowX,',
  '    warningCount: fixture.awayShinPadWarningCount,\n    needsKitSizeCheck: fixture.awayNeedsKitSizeCheck,\n    x: rowX,',
  "away tally kit size flag",
);

tally = replaceRequired(
  tally,
  '  const [history, tvRows, kitColours, shinPadWarningRows] = await Promise.all([',
  '  const [history, tvRows, kitColours, shinPadWarningRows, kitSizeTryOnRows] = await Promise.all([',
  "tally kit size Promise result",
);

if (!tally.includes('FROM "TeamKitOrder" kit_order')) {
  tally = replaceRequired(
    tally,
    '      : Promise.resolve([] as ShinPadWarningCountRow[]),\n  ]);',
    [
      '      : Promise.resolve([] as ShinPadWarningCountRow[]),',
      '    teamIds.length',
      '      ? prisma',
      '          .$queryRaw<KitSizeTryOnRow[]>(Prisma.sql`',
      '            SELECT DISTINCT kit_order."teamId" AS "teamId"',
      '            FROM "TeamKitOrder" kit_order',
      '            WHERE kit_order."teamId" IN (${Prisma.join(teamIds)})',
      '              AND kit_order."sizesConfirmed" = FALSE',
      '              AND kit_order."status" IN (\'DRAFT\', \'SUBMITTED\', \'APPROVED\', \'ORDERED\')',
      '          `)',
      '          .catch(() => [] as KitSizeTryOnRow[])',
      '      : Promise.resolve([] as KitSizeTryOnRow[]),',
      '  ]);',
    ].join("\n"),
    "tally active kit size query",
  );
}

if (!tally.includes("kitSizeTryOnTeamIds")) {
  tally = replaceRequired(
    tally,
    [
      '  const warningCountByTeam = new Map(',
      '    shinPadWarningRows.map((row) => [row.teamId, row.warningCount]),',
      '  );',
      '  const printable: PrintableFixture[] = fixtures.map((fixture) => ({',
    ].join("\n"),
    [
      '  const warningCountByTeam = new Map(',
      '    shinPadWarningRows.map((row) => [row.teamId, row.warningCount]),',
      '  );',
      '  const kitSizeTryOnTeamIds = new Set(kitSizeTryOnRows.map((row) => row.teamId));',
      '  const printable: PrintableFixture[] = fixtures.map((fixture) => ({',
    ].join("\n"),
    "tally kit size team set",
  );
}

tally = replaceRequired(
  tally,
  '    homeShinPadWarningCount: warningCountByTeam.get(fixture.homeTeam.id) ?? 0,\n    awayShinPadWarningCount: warningCountByTeam.get(fixture.awayTeam.id) ?? 0,\n    prediction:',
  '    homeShinPadWarningCount: warningCountByTeam.get(fixture.homeTeam.id) ?? 0,\n    awayShinPadWarningCount: warningCountByTeam.get(fixture.awayTeam.id) ?? 0,\n    homeNeedsKitSizeCheck: kitSizeTryOnTeamIds.has(fixture.homeTeam.id),\n    awayNeedsKitSizeCheck: kitSizeTryOnTeamIds.has(fixture.awayTeam.id),\n    prediction:',
  "tally printable kit size values",
);

write(tallyPath, tally);

if (
  !adminPage.includes("<KitSizeConfirmationControl") ||
  !tally.includes('write(ctx, "TRY SHIRT SIZE"') ||
  !tally.includes("kitSizeTryOnTeamIds")
) {
  throw new Error("Kit size confirmation workflow was not applied correctly.");
}

console.log(
  "Kit orders now show a saved size-confirmation tick box, and A5 tally sheets flag active unconfirmed teams to try a shirt size.",
);
