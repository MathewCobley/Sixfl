const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/night-board/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found on the Night Board.`);
  }
  source = source.replace(before, after);
}

if (!source.includes('from "@/components/admin/night-board/LastMinuteReplacementControl"')) {
  replaceRequired(
    'import AdminCard from "@/components/admin/AdminCard";\n',
    'import AdminCard from "@/components/admin/AdminCard";\nimport LastMinuteReplacementControl from "@/components/admin/night-board/LastMinuteReplacementControl";\n',
    "last-minute replacement component import",
  );
}

if (!source.includes('from "@/lib/fixtures/last-minute-replacement"')) {
  replaceRequired(
    'import { toLondonTimeInputValue } from "@/lib/datetime/london";\n',
    'import { toLondonTimeInputValue } from "@/lib/datetime/london";\nimport { ensureLastMinuteReplacementTemplates } from "@/lib/fixtures/last-minute-replacement";\n',
    "last-minute replacement template import",
  );
}

replaceRequired(
  '  await requireAdmin();\n  const params = searchParams ? await searchParams : {};',
  '  await requireAdmin();\n  await ensureLastMinuteReplacementTemplates();\n  const params = searchParams ? await searchParams : {};',
  "last-minute replacement template setup",
);

const oldTeamNames = [
  '        <div>',
  '          <div className="font-semibold">{fixture.homeTeam.name}</div>',
  '          <div className="text-white/45">v</div>',
  '          <div className="font-semibold">{fixture.awayTeam.name}</div>',
  '        </div>',
].join("\n");

const newTeamNames = [
  '        <div className="space-y-1">',
  '          <div>',
  '            <div className="font-semibold">{fixture.homeTeam.name}</div>',
  '            {fixture.status === FixtureStatus.SCHEDULED ? (',
  '              <LastMinuteReplacementControl',
  '                fixtureId={fixture.id}',
  '                droppedTeamId={fixture.homeTeam.id}',
  '                teamName={fixture.homeTeam.name}',
  '              />',
  '            ) : null}',
  '          </div>',
  '          <div className="text-white/45">v</div>',
  '          <div>',
  '            <div className="font-semibold">{fixture.awayTeam.name}</div>',
  '            {fixture.status === FixtureStatus.SCHEDULED ? (',
  '              <LastMinuteReplacementControl',
  '                fixtureId={fixture.id}',
  '                droppedTeamId={fixture.awayTeam.id}',
  '                teamName={fixture.awayTeam.name}',
  '              />',
  '            ) : null}',
  '          </div>',
  '        </div>',
].join("\n");
replaceRequired(oldTeamNames, newTeamNames, "fixture team replacement controls");

if (
  !source.includes("LastMinuteReplacementControl") ||
  !source.includes("ensureLastMinuteReplacementTemplates") ||
  !source.includes('teamName={fixture.homeTeam.name}') ||
  !source.includes('teamName={fixture.awayTeam.name}')
) {
  throw new Error("Last-minute replacement feature was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Night Board teams now have a last-minute replacement checkbox that alerts eligible league teams by email and SMS.",
);
