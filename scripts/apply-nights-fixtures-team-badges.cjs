const fs = require("node:fs");
const path = require("node:path");

const routePath = path.join(
  process.cwd(),
  "src",
  "app",
  "api",
  "admin",
  "night-board",
  "night-fixtures",
  "route.ts",
);

if (!fs.existsSync(routePath)) {
  console.log("Nights Fixtures route not present; skipping team badge layout.");
  process.exit(0);
}

let source = fs.readFileSync(routePath, "utf8");

function addFunctionParameter(functionName, parameterLine) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${functionName}().`);

  const close = source.indexOf("\n) {", start);
  if (close < 0) throw new Error(`Could not find the end of ${functionName}() parameters.`);

  const signature = source.slice(start, close);
  if (signature.includes(parameterLine.trim())) return;

  const previousLineStart = source.lastIndexOf("\n", close - 1) + 1;
  const previousLine = source.slice(previousLineStart, close);
  const indent = previousLine.match(/^\s*/)?.[0] ?? "  ";
  source = `${source.slice(0, close)}\n${indent}${parameterLine.trim()}${source.slice(close)}`;
}

function findClosingParen(openParen) {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function addCallArgument(callName, argument, expectedCount) {
  let cursor = 0;
  let changed = 0;
  let found = 0;

  while (cursor < source.length) {
    const marker = `${callName}(`;
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;

    const prefix = source.slice(Math.max(0, start - 12), start);
    cursor = start + marker.length;
    if (prefix.endsWith("function ")) continue;

    const openParen = start + callName.length;
    const closeParen = findClosingParen(openParen);
    if (closeParen < 0) throw new Error(`Could not parse ${callName}() call.`);

    const callText = source.slice(start, closeParen);
    found += 1;
    if (!callText.includes(argument)) {
      const closeLineStart = source.lastIndexOf("\n", closeParen - 1) + 1;
      const previousLineStart = source.lastIndexOf("\n", closeLineStart - 2) + 1;
      const previousLine = source.slice(previousLineStart, closeLineStart - 1);
      const argumentIndent = previousLine.match(/^\s*/)?.[0] ?? "    ";
      source = `${source.slice(0, closeLineStart)}${argumentIndent}${argument},\n${source.slice(closeLineStart)}`;
      changed += 1;
      cursor = closeParen + argument.length + argumentIndent.length + 2;
    } else {
      cursor = closeParen + 1;
    }
  }

  if (found < expectedCount) {
    throw new Error(`Expected at least ${expectedCount} ${callName}() call(s), found ${found}.`);
  }

  return changed;
}

if (!source.includes("async function loadTeamBadges")) {
  const helperAnchor = "function uniqueLabel(values: Array<string | null | undefined>, fallback: string) {";
  if (!source.includes(helperAnchor)) {
    throw new Error("Expected Nights Fixtures helper anchor was not found.");
  }

  const helpers = `function resolveTeamBadgeSource(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  if (/^(https?:|data:)/i.test(clean)) return clean;
  return path.join(process.cwd(), "public", clean.replace(/^\\/+/, ""));
}

async function loadTeamBadges(fixtures: PrintableFixture[]) {
  const badgeByTeamId = new Map<string, Image>();
  const teams = new Map<string, string>();

  for (const fixture of fixtures) {
    if (fixture.homeTeam.logoUrl) teams.set(fixture.homeTeam.id, fixture.homeTeam.logoUrl);
    if (fixture.awayTeam.logoUrl) teams.set(fixture.awayTeam.id, fixture.awayTeam.logoUrl);
  }

  await Promise.all(
    Array.from(teams, async ([teamId, logoUrl]) => {
      const badgeSource = resolveTeamBadgeSource(logoUrl);
      if (!badgeSource) return;
      try {
        badgeByTeamId.set(teamId, await loadImage(badgeSource));
      } catch (error) {
        console.error(\`Could not load team badge \${teamId} for Nights Fixtures PDF.\`, error);
      }
    }),
  );

  return badgeByTeamId;
}

function drawTeamBadge(
  ctx: CanvasRenderingContext2D,
  badge: Image | null,
  x: number,
  y: number,
  size: number,
) {
  if (!badge) return;

  roundedRect(ctx, x, y, size, size, 5);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  const padding = 2;
  const available = size - padding * 2;
  const ratio = Math.min(available / badge.width, available / badge.height);
  const badgeWidth = badge.width * ratio;
  const badgeHeight = badge.height * ratio;
  ctx.drawImage(
    badge,
    x + (size - badgeWidth) / 2,
    y + (size - badgeHeight) / 2,
    badgeWidth,
    badgeHeight,
  );
}

`;

  source = source.replace(helperAnchor, `${helpers}${helperAnchor}`);
}

addFunctionParameter("drawFixtureRow", "teamBadges: Map<string, Image>,");
addFunctionParameter("drawPitchColumn", "teamBadges: Map<string, Image>,");
addFunctionParameter("drawRasterPage", "teamBadges: Map<string, Image>,");

const fixtureRowStart = source.indexOf("function drawFixtureRow(");
const teamsStart = source.indexOf("  const teamsX =", fixtureRowStart);
const dividerStart = source.indexOf("  const dividerX =", teamsStart);
if (fixtureRowStart < 0 || teamsStart < 0 || dividerStart < 0) {
  throw new Error("Could not locate the Nights Fixtures team-name drawing block.");
}

if (!source.slice(teamsStart, dividerStart).includes("drawTeamBadge(")) {
  const teamRows = `  const teamsX = x + timeWidth + 10;
  const teamsWidth = width - timeWidth - predictorWidth - 26;
  const badgeSize = Math.min(22, Math.max(17, Math.floor((height - 8) / 2)));
  const homeBadgeY = y + height / 2 - badgeSize - 2;
  const awayBadgeY = y + height / 2 + 2;

  drawTeamBadge(
    ctx,
    teamBadges.get(fixture.homeTeam.id) ?? null,
    teamsX,
    homeBadgeY,
    badgeSize,
  );
  drawTeamBadge(
    ctx,
    teamBadges.get(fixture.awayTeam.id) ?? null,
    teamsX,
    awayBadgeY,
    badgeSize,
  );

  const teamTextX = teamsX + badgeSize + 7;
  const teamTextWidth = Math.max(55, teamsWidth - badgeSize - 7);
  write(ctx, fit(ctx, fixture.homeTeam.name, teamTextWidth), teamTextX, y + height / 2 - 7, {
    font: font(10.5, true),
  });
  write(ctx, "vs", teamTextX, y + height / 2 + 7, {
    font: font(7, true),
    fill: TEAL,
  });
  write(
    ctx,
    fit(ctx, fixture.awayTeam.name, Math.max(40, teamTextWidth - 18)),
    teamTextX + 18,
    y + height / 2 + 7,
    { font: font(10.5, true) },
  );

`;
  source = `${source.slice(0, teamsStart)}${teamRows}${source.slice(dividerStart)}`;
}

addCallArgument("drawFixtureRow", "teamBadges", 1);
addCallArgument("drawPitchColumn", "teamBadges", 2);
addCallArgument("drawRasterPage", "teamBadges", 1);

if (!source.includes("const teamBadges = await loadTeamBadges(fixtures);")) {
  const createPdfAnchor = "  const pitch1All = fixtures.filter((fixture) => pitchNumber(fixture.pitch) === 1);";
  if (!source.includes(createPdfAnchor)) {
    throw new Error("Expected Nights Fixtures createPdf() anchor was not found.");
  }
  source = source.replace(
    createPdfAnchor,
    `  const teamBadges = await loadTeamBadges(fixtures);\n\n${createPdfAnchor}`,
  );
}

source = source.replace(
  /homeTeam: \{ select: \{ id: true, name: true(?:, logoUrl: true)? \} \}/g,
  "homeTeam: { select: { id: true, name: true, logoUrl: true } }",
);
source = source.replace(
  /awayTeam: \{ select: \{ id: true, name: true(?:, logoUrl: true)? \} \}/g,
  "awayTeam: { select: { id: true, name: true, logoUrl: true } }",
);

const required = [
  "async function loadTeamBadges",
  "teamBadges.get(fixture.homeTeam.id)",
  "teamBadges.get(fixture.awayTeam.id)",
  "const teamBadges = await loadTeamBadges(fixtures);",
  "logoUrl: true",
];
for (const marker of required) {
  if (!source.includes(marker)) {
    throw new Error(`Nights Fixtures team badge marker is missing: ${marker}`);
  }
}

fs.writeFileSync(routePath, source, "utf8");
console.log("Nights Fixtures now prints each available home and away team badge beside the team name.");
