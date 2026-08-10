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
// Kit DB projection: expose the persisted confirmation flag on every order.
// -----------------------------------------------------------------------------
const dbPath = "src/lib/kits/db.ts";
let db = read(dbPath);

db = replaceRequired(
  db,
  '  adminNotes: string | null;\n  submittedByUserId: string | null;',
  '  adminNotes: string | null;\n  sizesConfirmed: boolean;\n  submittedByUserId: string | null;',
  "kit order sizesConfirmed type",
);

db = replaceRequired(
  db,
  '    adminNotes: row.adminNotes,\n    submittedByUserId: row.submittedByUserId,',
  '    adminNotes: row.adminNotes,\n    sizesConfirmed: row.sizesConfirmed,\n    submittedByUserId: row.submittedByUserId,',
  "kit order sizesConfirmed mapping",
);

db = replaceRequired(
  db,
  '  orders."adminNotes",\n  orders."submittedByUserId",',
  '  orders."adminNotes",\n  orders."sizesConfirmed",\n  orders."submittedByUserId",',
  "kit order sizesConfirmed query column",
);

write(dbPath, db);

// -----------------------------------------------------------------------------
// Admin action: SIXFL can tick or untick the sizing confirmation independently
// of the order status. This is intentionally available for drafts too.
// -----------------------------------------------------------------------------
const actionsPath = "src/app/(admin)/admin/kits/actions.ts";
let actions = read(actionsPath);

if (!actions.includes("updateKitOrderSizesConfirmedAction")) {
  actions += `\n\nexport async function updateKitOrderSizesConfirmedAction(formData: FormData) {\n  const { user } = await requireAdmin();\n  const orderId = readString(formData, "orderId");\n  const teamName = readString(formData, "teamName") || null;\n  const sizesConfirmed = formData.get("sizesConfirmed") === "on";\n\n  if (!orderId) {\n    redirect(redirectToKits({ error: "invalid_order" }));\n  }\n\n  try {\n    const changed = await prisma.$executeRaw(Prisma.sql\`\n      UPDATE "TeamKitOrder"\n      SET\n        "sizesConfirmed" = \${sizesConfirmed},\n        "lastEditedByUserId" = \${user?.id ?? null},\n        "updatedAt" = NOW()\n      WHERE "id" = \${orderId}\n    \`);\n\n    if (!changed) throw new Error("Kit order not found.");\n  } catch (error) {\n    console.error("Kit order size confirmation update failed", error);\n    redirect(redirectToKits({ error: "save_failed", team: teamName }));\n  }\n\n  revalidatePath(KITS_PATH);\n  revalidatePath("/captain");\n  redirect(redirectToKits({ notice: "order_sizes_saved", team: teamName }));\n}\n`;
}

write(actionsPath, actions);

// -----------------------------------------------------------------------------
// Admin UI: show the checkbox on every order card, including DRAFT orders.
// -----------------------------------------------------------------------------
const adminPagePath = "src/app/(admin)/admin/kits/page.tsx";
let adminPage = read(adminPagePath);

adminPage = replaceRequired(
  adminPage,
  '  updateKitOrderNotesAction,\n  updateKitOrderStatusAction,',
  '  updateKitOrderNotesAction,\n  updateKitOrderSizesConfirmedAction,\n  updateKitOrderStatusAction,',
  "kit size confirmation action import",
);

if (!adminPage.includes('case "order_sizes_saved":')) {
  adminPage = replaceRequired(
    adminPage,
    '    case "order_notes_saved":\n      return `${team}\'s admin notes were saved.`;',
    '    case "order_sizes_saved":\n      return `${team}\'s shirt sizes confirmation was saved.`;\n    case "order_notes_saved":\n      return `${team}\'s admin notes were saved.`;',
    "kit sizes saved notice",
  );
}

if (!adminPage.includes("Save size check")) {
  adminPage = replaceRequired(
    adminPage,
    '                    <aside className="border-t border-white/10 bg-black/20 p-5 sm:p-6 xl:border-l xl:border-t-0">\n                      <div>',
    [
      '                    <aside className="border-t border-white/10 bg-black/20 p-5 sm:p-6 xl:border-l xl:border-t-0">',
      '                      <form',
      '                        action={updateKitOrderSizesConfirmedAction}',
      '                        className="rounded-2xl border border-amber-300/20 bg-amber-500/[0.07] p-4"',
      '                      >',
      '                        <input type="hidden" name="orderId" value={order.id} />',
      '                        <input type="hidden" name="teamName" value={order.teamName} />',
      '                        <label className="flex cursor-pointer items-start gap-3">',
      '                          <input',
      '                            type="checkbox"',
      '                            name="sizesConfirmed"',
      '                            defaultChecked={order.sizesConfirmed}',
      '                            className="mt-1 h-5 w-5 shrink-0 rounded border-white/20 bg-black text-emerald-400"',
      '                          />',
      '                          <span>',
      '                            <span className="block text-sm font-semibold text-white">',
      '                              Sizes confirmed',
      '                            </span>',
      '                            <span className="mt-1 block text-xs leading-5 text-white/50">',
      '                              Tick this after the team has tried on a sample shirt and confirmed its sizes.',
      '                            </span>',
      '                          </span>',
      '                        </label>',
      '                        <button',
      '                          type="submit"',
      '                          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/15"',
      '                        >',
      '                          Save size check',
      '                        </button>',
      '                      </form>',
      '',
      '                      <div className="mt-6">',
    ].join("\n"),
    "kit size confirmation admin control",
  );
}

write(adminPagePath, adminPage);

// -----------------------------------------------------------------------------
// A5 pitch tally sheet: flag any team with an active kit order whose sizes have
// not yet been confirmed. Active process = DRAFT/SUBMITTED/APPROVED/ORDERED.
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
  tally = replaceRequired(
    tally,
    [
      '  write(',
      '    ctx,',
      '    `PREVIOUS WARNINGS: ${input.warningCount}`,',
      '    warningTextX,',
      '    warningBoxY + 10.5,',
      '    {',
      '      font: font(4.6, true),',
      '      fill: input.warningCount > 0 ? "#9a3412" : "#6b7280",',
      '    },',
      '  );',
    ].join("\n"),
    [
      '  write(',
      '    ctx,',
      '    `PREVIOUS WARNINGS: ${input.warningCount}`,',
      '    warningTextX,',
      '    warningBoxY + 10.5,',
      '    {',
      '      font: font(4.6, true),',
      '      fill: input.warningCount > 0 ? "#9a3412" : "#6b7280",',
      '    },',
      '  );',
      '',
      '  if (input.needsKitSizeCheck) {',
      '    write(ctx, "TRY SHIRT SIZE", input.x + 23, input.y + 37, {',
      '      font: font(5.2, true),',
      '      fill: "#b45309",',
      '    });',
      '  }',
    ].join("\n"),
    "A5 try shirt size message",
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
      "              AND kit_order.\"status\" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'ORDERED')",
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
  !db.includes('sizesConfirmed: boolean;') ||
  !actions.includes("updateKitOrderSizesConfirmedAction") ||
  !adminPage.includes("Save size check") ||
  !tally.includes('write(ctx, "TRY SHIRT SIZE"') ||
  !tally.includes("kitSizeTryOnTeamIds")
) {
  throw new Error("Kit size confirmation workflow was not applied correctly.");
}

console.log(
  "Kit orders now track admin-confirmed shirt sizing, and A5 tally sheets flag active unconfirmed teams to try a shirt size.",
);
