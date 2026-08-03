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

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in Nights Fixtures route.`);
  }
  source = source.replace(before, after);
}

// Load badge images once per generated sheet. Relative uploads are resolved from
// public/, while absolute/data URLs are passed directly to node-canvas.
if (!source.includes("async function loadTeamBadges")) {
  const helperAnchor = "function uniqueLabel(values: Array<string | null | undefined>, fallback: string) {";
  if (!source.includes(helperAnchor)) {
    throw new Error("Expected Nights Fixtures helper anchor was not found.");
  }

  const helpers = [
    "function resolveTeamBadgeSource(value: string | null | undefined) {",
    "  const clean = value?.trim();",
    "  if (!clean) return null;",
    "  if (/^(https?:|data:)/i.test(clean)) return clean;",
    "  return path.join(process.cwd(), \"public\", clean.replace(/^\\/+/, \"\"));",
    "}",
    "",
    "async function loadTeamBadges(fixtures: PrintableFixture[]) {",
    "  const badgeByTeamId = new Map<string, Image>();",
    "  const teams = new Map<string, string>();",
    "",
    "  for (const fixture of fixtures) {",
    "    if (fixture.homeTeam.logoUrl) teams.set(fixture.homeTeam.id, fixture.homeTeam.logoUrl);",
    "    if (fixture.awayTeam.logoUrl) teams.set(fixture.awayTeam.id, fixture.awayTeam.logoUrl);",
    "  }",
    "",
    "  await Promise.all(",
    "    Array.from(teams, async ([teamId, logoUrl]) => {",
    "      const source = resolveTeamBadgeSource(logoUrl);",
    "      if (!source) return;",
    "      try {",
    "        badgeByTeamId.set(teamId, await loadImage(source));",
    "      } catch (error) {",
    "        console.error(`Could not load team badge ${teamId} for Nights Fixtures PDF.`, error);",
    "      }",
    "    }),",
    "  );",
    "",
    "  return badgeByTeamId;",
    "}",
    "",
    "function drawTeamBadge(",
    "  ctx: CanvasRenderingContext2D,",
    "  badge: Image | null,",
    "  x: number,",
    "  y: number,",
    "  size: number,",
    ") {",
    "  if (!badge) return;",
    "",
    "  roundedRect(ctx, x, y, size, size, 5);",
    "  ctx.fillStyle = \"#ffffff\";",
    "  ctx.fill();",
    "  ctx.strokeStyle = LINE;",
    "  ctx.lineWidth = 0.6;",
    "  ctx.stroke();",
    "",
    "  const padding = 2;",
    "  const available = size - padding * 2;",
    "  const ratio = Math.min(available / badge.width, available / badge.height);",
    "  const width = badge.width * ratio;",
    "  const height = badge.height * ratio;",
    "  ctx.drawImage(",
    "    badge,",
    "    x + (size - width) / 2,",
    "    y + (size - height) / 2,",
    "    width,",
    "    height,",
    "  );",
    "}",
    "",
  ].join("\n");

  source = source.replace(helperAnchor, `${helpers}${helperAnchor}`);
}

replaceOnce(
  [
    "  width: number,",
    "  height: number,",
    "  predictorLogo: Image | null,",
    ") {",
  ].join("\n"),
  [
    "  width: number,",
    "  height: number,",
    "  predictorLogo: Image | null,",
    "  teamBadges: Map<string, Image>,",
    ") {",
  ].join("\n"),
  "fixture-row team badge parameter",
);

const oldTeamRows = [
  "  const teamsX = x + timeWidth + 12;",
  "  const teamsWidth = width - timeWidth - predictorWidth - 30;",
  "  write(ctx, fit(ctx, fixture.homeTeam.name, teamsWidth), teamsX, y + height / 2 - 7, {",
  "    font: font(11, true),",
  "  });",
  "  write(ctx, \"vs\", teamsX, y + height / 2 + 7, {",
  "    font: font(7.5, true),",
  "    fill: TEAL,",
  "  });",
  "  write(ctx, fit(ctx, fixture.awayTeam.name, teamsWidth), teamsX + 18, y + height / 2 + 7, {",
  "    font: font(11, true),",
  "  });",
].join("\n");

const newTeamRows = [
  "  const teamsX = x + timeWidth + 10;",
  "  const teamsWidth = width - timeWidth - predictorWidth - 26;",
  "  const badgeSize = Math.min(22, Math.max(17, Math.floor((height - 8) / 2)));",
  "  const homeBadgeY = y + height / 2 - badgeSize - 2;",
  "  const awayBadgeY = y + height / 2 + 2;",
  "",
  "  drawTeamBadge(",
  "    ctx,",
  "    teamBadges.get(fixture.homeTeam.id) ?? null,",
  "    teamsX,",
  "    homeBadgeY,",
  "    badgeSize,",
  "  );",
  "  drawTeamBadge(",
  "    ctx,",
  "    teamBadges.get(fixture.awayTeam.id) ?? null,",
  "    teamsX,",
  "    awayBadgeY,",
  "    badgeSize,",
  "  );",
  "",
  "  const teamTextX = teamsX + badgeSize + 7;",
  "  const teamTextWidth = Math.max(55, teamsWidth - badgeSize - 7);",
  "  write(ctx, fit(ctx, fixture.homeTeam.name, teamTextWidth), teamTextX, y + height / 2 - 7, {",
  "    font: font(10.5, true),",
  "  });",
  "  write(ctx, \"vs\", teamTextX, y + height / 2 + 7, {",
  "    font: font(7, true),",
  "    fill: TEAL,",
  "  });",
  "  write(ctx, fit(ctx, fixture.awayTeam.name, Math.max(40, teamTextWidth - 18)), teamTextX + 18, y + height / 2 + 7, {",
  "    font: font(10.5, true),",
  "  });",
].join("\n");

replaceOnce(oldTeamRows, newTeamRows, "team-name rows");

replaceOnce(
  [
    "  height: number,",
    "  pitch: 1 | 2,",
    "  predictorLogo: Image | null,",
    ") {",
  ].join("\n"),
  [
    "  height: number,",
    "  pitch: 1 | 2,",
    "  predictorLogo: Image | null,",
    "  teamBadges: Map<string, Image>,",
    ") {",
  ].join("\n"),
  "pitch-column team badge parameter",
);

replaceOnce(
  [
    "      rowHeight,",
    "      predictorLogo,",
    "    );",
  ].join("\n"),
  [
    "      rowHeight,",
    "      predictorLogo,",
    "      teamBadges,",
    "    );",
  ].join("\n"),
  "fixture-row team badge call",
);

replaceOnce(
  [
    "  logo: Image | null,",
    "  predictorLogo: Image | null,",
    ") {",
  ].join("\n"),
  [
    "  logo: Image | null,",
    "  predictorLogo: Image | null,",
    "  teamBadges: Map<string, Image>,",
    ") {",
  ].join("\n"),
  "raster-page team badge parameter",
);

source = source.replace(
  /drawPitchColumn\(([\s\S]*?),\n\s*predictorLogo,\n\s*\);/g,
  (match) => match.includes("teamBadges") ? match : match.replace("    predictorLogo,\n  );", "    predictorLogo,\n    teamBadges,\n  );"),
);

if (!source.includes("const teamBadges = await loadTeamBadges(fixtures);")) {
  const createPdfAnchor = "  const pitch1All = fixtures.filter((fixture) => pitchNumber(fixture.pitch) === 1);";
  if (!source.includes(createPdfAnchor)) {
    throw new Error("Expected Nights Fixtures PDF badge-loading anchor was not found.");
  }
  source = source.replace(
    createPdfAnchor,
    `  const teamBadges = await loadTeamBadges(fixtures);\n\n${createPdfAnchor}`,
  );
}

replaceOnce(
  [
    "      logo,",
    "      predictorLogo,",
    "    );",
  ].join("\n"),
  [
    "      logo,",
    "      predictorLogo,",
    "      teamBadges,",
    "    );",
  ].join("\n"),
  "raster-page team badge call",
);

source = source.replace(
  '      homeTeam: { select: { id: true, name: true } },',
  '      homeTeam: { select: { id: true, name: true, logoUrl: true } },',
);
source = source.replace(
  '      awayTeam: { select: { id: true, name: true } },',
  '      awayTeam: { select: { id: true, name: true, logoUrl: true } },',
);

if (
  !source.includes("async function loadTeamBadges") ||
  !source.includes("teamBadges.get(fixture.homeTeam.id)") ||
  !source.includes("teamBadges.get(fixture.awayTeam.id)") ||
  !source.includes("logoUrl: true") ||
  !source.includes("const teamBadges = await loadTeamBadges(fixtures);")
) {
  throw new Error("Nights Fixtures team badges were not applied correctly.");
}

fs.writeFileSync(routePath, source, "utf8");
console.log("Nights Fixtures now prints each available home and away team badge beside the team name.");
