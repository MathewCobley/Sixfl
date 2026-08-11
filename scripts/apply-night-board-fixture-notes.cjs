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
// Night Board: add the standalone fixture-note control to every fixture card.
// The control owns its own API read/save so the core fixture editor remains
// independent and existing match-save logic is untouched.
// -----------------------------------------------------------------------------
const boardPath = "src/app/(admin)/admin/night-board/page.tsx";
let board = read(boardPath);

if (!board.includes('from "@/components/admin/night-board/NightBoardFixtureNoteControl"')) {
  board = replaceRequired(
    board,
    '} from "@/components/admin/night-board/NightBoardOperations";',
    '} from "@/components/admin/night-board/NightBoardOperations";\nimport NightBoardFixtureNoteControl from "@/components/admin/night-board/NightBoardFixtureNoteControl";',
    "Night Board fixture-note import",
  );
}

if (!board.includes("<NightBoardFixtureNoteControl fixtureId={fixture.id} />")) {
  const marker = [
    '      />',
    '',
    '      <div className="mt-3 flex flex-wrap gap-3">',
  ].join("\n");
  board = replaceRequired(
    board,
    marker,
    [
      '      />',
      '',
      '      <NightBoardFixtureNoteControl fixtureId={fixture.id} />',
      '',
      '      <div className="mt-3 flex flex-wrap gap-3">',
    ].join("\n"),
    "Night Board fixture-note control",
  );
}

write(boardPath, board);

// -----------------------------------------------------------------------------
// A5 tally sheet: load saved operational notes for the selected fixtures and
// print a concise NOTE line immediately above the AI prediction.
// -----------------------------------------------------------------------------
const tallyPath = "src/app/api/admin/night-board/pitch-tally-sheets/route.ts";
let tally = read(tallyPath);

if (!tally.includes("type NightBoardFixtureNoteRow")) {
  tally = replaceRequired(
    tally,
    'type FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];',
    'type NightBoardFixtureNoteRow = { id: string; nightBoardNote: string | null };\ntype FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];',
    "A5 fixture-note row type",
  );
}

if (!tally.includes("nightBoardNote: string | null;")) {
  tally = replaceRequired(
    tally,
    '  awayNeedsKitSizeCheck: boolean;\n  prediction:',
    '  awayNeedsKitSizeCheck: boolean;\n  nightBoardNote: string | null;\n  prediction:',
    "A5 printable fixture note field",
  );
}

if (!tally.includes("nightBoardNoteByFixtureId")) {
  tally = replaceRequired(
    tally,
    '  const fixtureIds = fixtures.map((fixture) => fixture.id);\n  const leagueIds = Array.from(new Set(fixtures.map((fixture) => fixture.leagueId)));',
    [
      '  const fixtureIds = fixtures.map((fixture) => fixture.id);',
      '  const fixtureNoteRows = fixtureIds.length',
      '    ? await prisma',
      '        .$queryRaw<NightBoardFixtureNoteRow[]>(Prisma.sql`',
      '          SELECT "id", "nightBoardNote"',
      '          FROM "Fixture"',
      '          WHERE "id" IN (${Prisma.join(fixtureIds)})',
      '        `)',
      '        .catch(() => [] as NightBoardFixtureNoteRow[])',
      '    : [];',
      '  const nightBoardNoteByFixtureId = new Map<string, string | null>(',
      '    fixtureNoteRows.map((row) => [row.id, row.nightBoardNote]),',
      '  );',
      '  const leagueIds = Array.from(new Set(fixtures.map((fixture) => fixture.leagueId)));',
    ].join("\n"),
    "A5 fixture-note query",
  );
}

if (!tally.includes("nightBoardNote: nightBoardNoteByFixtureId.get(fixture.id) ?? null,")) {
  tally = replaceRequired(
    tally,
    '    awayNeedsKitSizeCheck: kitSizeTryOnTeamIds.has(fixture.awayTeam.id),\n    prediction:',
    '    awayNeedsKitSizeCheck: kitSizeTryOnTeamIds.has(fixture.awayTeam.id),\n    nightBoardNote: nightBoardNoteByFixtureId.get(fixture.id) ?? null,\n    prediction:',
    "A5 printable fixture note value",
  );
}

if (!tally.includes('`NOTE: ${fixture.nightBoardNote}`')) {
  tally = replaceRequired(
    tally,
    '  const aiY = y + Math.min(height - 7, 151);',
    [
      '  const hasFixtureNote = Boolean(cleanText(fixture.nightBoardNote));',
      '  if (hasFixtureNote) {',
      '    write(ctx, fit(ctx, `NOTE: ${fixture.nightBoardNote}`, width - 20), x + 10, y + 147, {',
      '      font: font(6.3, true),',
      '      fill: "#9a3412",',
      '    });',
      '  }',
      '',
      '  const aiY = y + Math.min(height - 6, hasFixtureNote ? 158 : 151);',
    ].join("\n"),
    "A5 fixture-note drawing",
  );
}

write(tallyPath, tally);

if (
  !board.includes("<NightBoardFixtureNoteControl fixtureId={fixture.id} />") ||
  !tally.includes("nightBoardNoteByFixtureId") ||
  !tally.includes('`NOTE: ${fixture.nightBoardNote}`')
) {
  throw new Error("Night Board fixture notes were not applied correctly.");
}

console.log(
  "Night Board fixture cards now have saved notes and the A5 tally sheet prints each note.",
);