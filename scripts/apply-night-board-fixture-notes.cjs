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
// Night Board editor: admin-only operational note saved with the fixture.
// The note is deliberately labelled as an A5 note so it is clear where it goes.
// -----------------------------------------------------------------------------
const operationsPath = "src/components/admin/night-board/NightBoardOperations.tsx";
let operations = read(operationsPath);

operations = replaceRequired(
  operations,
  [
    '    venueId: string;',
    '    status: NightBoardFixtureStatus;',
  ].join("\n"),
  [
    '    venueId: string;',
    '    status: NightBoardFixtureStatus;',
    '    note: string;',
  ].join("\n"),
  "Night Board fixture note prop",
);

operations = replaceRequired(
  operations,
  '  const [status, setStatus] = useState<NightBoardFixtureStatus>(fixture.status);',
  [
    '  const [status, setStatus] = useState<NightBoardFixtureStatus>(fixture.status);',
    '  const [note, setNote] = useState(fixture.note);',
  ].join("\n"),
  "Night Board fixture note state",
);

if (!operations.includes('name="nightBoardNote"')) {
  const marker = '      <NightBoardSixflTvToggle fixtureId={fixture.id} />';
  const noteControl = [
    '      <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">',
    '        Fixture note',
    '        <span className="block text-[10px] font-normal normal-case tracking-normal text-white/40">',
    '          Prints on the A5 tally sheet',
    '        </span>',
    '        <textarea',
    '          name="nightBoardNote"',
    '          value={note}',
    '          maxLength={240}',
    '          rows={2}',
    '          disabled={locked}',
    '          onChange={(event) => setNote(event.target.value)}',
    '          placeholder="e.g. Bring spare bibs / new keeper / collect paperwork"',
    '          className="min-h-20 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-50"',
    '        />',
    '      </label>',
    '',
    marker,
  ].join("\n");
  operations = replaceRequired(
    operations,
    marker,
    noteControl,
    "Night Board fixture note textarea",
  );
}

write(operationsPath, operations);

// -----------------------------------------------------------------------------
// Night Board server page: load the note without requiring Prisma to model the
// operational-only column, then pass it into the editor.
// -----------------------------------------------------------------------------
const boardPath = "src/app/(admin)/admin/night-board/page.tsx";
let board = read(boardPath);

if (!board.includes("type NightBoardFixtureNoteRow")) {
  board = replaceRequired(
    board,
    'type RefereeProfileFeeRow = {\n  userId: string;\n  standardNightFeePence: number;\n};',
    [
      'type RefereeProfileFeeRow = {',
      '  userId: string;',
      '  standardNightFeePence: number;',
      '};',
      '',
      'type NightBoardFixtureNoteRow = {',
      '  id: string;',
      '  nightBoardNote: string | null;',
      '};',
    ].join("\n"),
    "Night Board fixture note row type",
  );
}

if (!board.includes("nightBoardNoteByFixtureId")) {
  board = replaceRequired(
    board,
    '  return prisma.fixture.findMany({\n    where: {',
    '  const fixtures = await prisma.fixture.findMany({\n    where: {',
    "Night Board fixture query assignment",
  );

  board = replaceRequired(
    board,
    [
      '      },',
      '    },',
      '  });',
      '}',
      '',
      'function buildWarnings(fixtures: FixtureForBoard[]) {',
    ].join("\n"),
    [
      '      },',
      '    },',
      '  });',
      '',
      '  if (fixtures.length === 0) return [];',
      '  const noteRows = await prisma',
      '    .$queryRaw<NightBoardFixtureNoteRow[]>(Prisma.sql`',
      '      SELECT "id", "nightBoardNote"',
      '      FROM "Fixture"',
      '      WHERE "id" IN (${Prisma.join(fixtures.map((fixture) => fixture.id))})',
      '    `)',
      '    .catch(() => [] as NightBoardFixtureNoteRow[]);',
      '  const nightBoardNoteByFixtureId = new Map(',
      '    noteRows.map((row) => [row.id, row.nightBoardNote] as const),',
      '  );',
      '',
      '  return fixtures.map((fixture) => ({',
      '    ...fixture,',
      '    nightBoardNote: nightBoardNoteByFixtureId.get(fixture.id) ?? null,',
      '  }));',
      '}',
      '',
      'function buildWarnings(fixtures: FixtureForBoard[]) {',
    ].join("\n"),
    "Night Board fixture note query return",
  );
}

board = replaceRequired(
  board,
  [
    '          venueId: fixture.venue?.id ?? fixture.venueId ?? "",',
    '          status: fixture.status,',
  ].join("\n"),
  [
    '          venueId: fixture.venue?.id ?? fixture.venueId ?? "",',
    '          status: fixture.status,',
    '          note: fixture.nightBoardNote ?? "",',
  ].join("\n"),
  "Night Board fixture note editor value",
);

write(boardPath, board);

// -----------------------------------------------------------------------------
// Night Board save route: persist the operational note in the Fixture column.
// -----------------------------------------------------------------------------
const updatePath = "src/app/api/admin/night-board/update-match/route.ts";
let update = read(updatePath);

update = replaceRequired(
  update,
  '  const status = parseFixtureStatus(String(formData.get("status") ?? "").trim());',
  [
    '  const status = parseFixtureStatus(String(formData.get("status") ?? "").trim());',
    '  const nightBoardNote = String(formData.get("nightBoardNote") ?? "")',
    '    .trim()',
    '    .slice(0, 240);',
  ].join("\n"),
  "Night Board fixture note parsing",
);

if (!update.includes('SET "nightBoardNote" = ${nightBoardNote || null}')) {
  const updateBlock = [
    '  await prisma.fixture.update({',
    '    where: { id: fixture.id },',
    '    data: {',
    '      kickoffAt,',
    '      pitch: pitch || null,',
    '      venueId,',
    '      refereeId: nextRefereeId,',
    '      status,',
    '    },',
    '  });',
  ].join("\n");
  update = replaceRequired(
    update,
    updateBlock,
    [
      updateBlock,
      '',
      '  await prisma.$executeRaw(Prisma.sql`',
      '    UPDATE "Fixture"',
      '    SET "nightBoardNote" = ${nightBoardNote || null}, "updatedAt" = NOW()',
      '    WHERE "id" = ${fixture.id}',
      '  `);',
    ].join("\n"),
    "Night Board fixture note persistence",
  );
}

write(updatePath, update);

// -----------------------------------------------------------------------------
// A5 tally sheets: carry the note into each fixture and print it prominently.
// This runs after kit-size preparation, so both TRY SHIRT SIZE and fixture notes
// appear together without competing build rewrites.
// -----------------------------------------------------------------------------
const tallyPath = "src/app/api/admin/night-board/pitch-tally-sheets/route.ts";
let tally = read(tallyPath);

if (!tally.includes("type NightBoardFixtureNoteRow")) {
  tally = replaceRequired(
    tally,
    'type FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];',
    [
      'type NightBoardFixtureNoteRow = { id: string; nightBoardNote: string | null };',
      'type FixtureRow = Awaited<ReturnType<typeof getFixtures>>[number];',
    ].join("\n"),
    "A5 fixture note row type",
  );
}

if (!tally.includes("nightBoardNoteByFixtureId")) {
  tally = replaceRequired(
    tally,
    '  return prisma.fixture.findMany({\n    where: {',
    '  const fixtures = await prisma.fixture.findMany({\n    where: {',
    "A5 fixture query assignment",
  );

  tally = replaceRequired(
    tally,
    [
      '      result: { select: { homeScore: true, awayScore: true } },',
      '    },',
      '  });',
      '}',
      '',
      'export async function GET(request: Request) {',
    ].join("\n"),
    [
      '      result: { select: { homeScore: true, awayScore: true } },',
      '    },',
      '  });',
      '',
      '  if (fixtures.length === 0) return [];',
      '  const noteRows = await prisma',
      '    .$queryRaw<NightBoardFixtureNoteRow[]>(Prisma.sql`',
      '      SELECT "id", "nightBoardNote"',
      '      FROM "Fixture"',
      '      WHERE "id" IN (${Prisma.join(fixtures.map((fixture) => fixture.id))})',
      '    `)',
      '    .catch(() => [] as NightBoardFixtureNoteRow[]);',
      '  const nightBoardNoteByFixtureId = new Map(',
      '    noteRows.map((row) => [row.id, row.nightBoardNote] as const),',
      '  );',
      '',
      '  return fixtures.map((fixture) => ({',
      '    ...fixture,',
      '    nightBoardNote: nightBoardNoteByFixtureId.get(fixture.id) ?? null,',
      '  }));',
      '}',
      '',
      'export async function GET(request: Request) {',
    ].join("\n"),
    "A5 fixture note query return",
  );
}

if (!tally.includes('`NOTE: ${fixture.nightBoardNote}`')) {
  tally = replaceRequired(
    tally,
    '  const aiY = y + Math.min(height - 7, 151);',
    [
      '  const hasFixtureNote = Boolean(cleanText(fixture.nightBoardNote));',
      '  if (hasFixtureNote) {',
      '    const noteY = y + Math.min(height - 16, 147);',
      '    write(',
      '      ctx,',
      '      fit(ctx, `NOTE: ${fixture.nightBoardNote}`, width - 20),',
      '      x + 10,',
      '      noteY,',
      '      {',
      '        font: font(6.5, true),',
      '        fill: "#9a3412",',
      '      },',
      '    );',
      '  }',
      '',
      '  const aiY = y + Math.min(height - 6, hasFixtureNote ? 158 : 151);',
    ].join("\n"),
    "A5 fixture note drawing",
  );
}

write(tallyPath, tally);

if (
  !operations.includes('name="nightBoardNote"') ||
  !board.includes("nightBoardNoteByFixtureId") ||
  !update.includes('SET "nightBoardNote" = ${nightBoardNote || null}') ||
  !tally.includes('`NOTE: ${fixture.nightBoardNote}`')
) {
  throw new Error("Night Board fixture notes were not applied correctly.");
}

console.log(
  "Night Board fixtures now have operational notes that are saved with the fixture and printed on the A5 tally sheet.",
);
