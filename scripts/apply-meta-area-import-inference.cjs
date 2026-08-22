const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, ...relativePath.split("/")), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

const actionsPath = "src/app/(admin)/admin/leads/import/actions.ts";
let actions = read(actionsPath);

// Meta exports should identify the recruitment area from campaign, form, ad or
// ad-set naming. Rawdon is the immediate use case, but this is deliberately kept
// generic for the other SIXFL recruitment areas too.
if (!actions.includes("const META_MARKETING_AREAS = [")) {
  const before = `function inferMetaArea(row: Record<string, string>) {\n  const adName = getFirstNonEmpty(row, [\"adName\", \"ad_name\"]);\n  const adSetName = getFirstNonEmpty(row, [\"adsetName\", \"adset_name\"]);\n\n  for (const candidate of [adName, adSetName]) {\n    if (!candidate) continue;\n    const parts = candidate\n      .split(/\\s+[–—-]\\s+/)\n      .map((part) => part.trim())\n      .filter(Boolean);\n\n    if (parts.length >= 2 && /^heartlands$/i.test(parts[0])) {\n      return parts[1];\n    }\n  }\n\n  return \"\";\n}`;

  const after = `const META_MARKETING_AREAS = [\n  \"Rawdon\",\n  \"Thirsk\",\n  \"Catterick\",\n  \"Richmond\",\n  \"Wetherby\",\n  \"Northallerton\",\n  \"Harrogate\",\n  \"Ripon\",\n  \"York\",\n  \"Leeds\",\n] as const;\n\nfunction inferMetaArea(row: Record<string, string>) {\n  const campaignName = getFirstNonEmpty(row, [\"campaignName\", \"campaign_name\"]);\n  const formName = getFirstNonEmpty(row, [\"formName\", \"form_name\"]);\n  const adName = getFirstNonEmpty(row, [\"adName\", \"ad_name\"]);\n  const adSetName = getFirstNonEmpty(row, [\"adsetName\", \"adset_name\"]);\n  const candidates = [campaignName, formName, adName, adSetName].filter(Boolean);\n  const haystack = candidates.join(\" | \").toLowerCase();\n\n  for (const area of META_MARKETING_AREAS) {\n    const escaped = area.toLowerCase().replace(/[.*+?^\\${}()|[\\]\\\\]/g, \"\\\\$&\");\n    if (new RegExp(\`(^|[^a-z0-9])\\${escaped}([^a-z0-9]|$)\`, \"i\").test(haystack)) {\n      return area;\n    }\n  }\n\n  // Keep compatibility with the original Heartlands – <area> – ... naming\n  // convention even if a future area has not yet been added above.\n  for (const candidate of candidates) {\n    const parts = candidate\n      .split(/\\s+[–—-]\\s+/)\n      .map((part) => part.trim())\n      .filter(Boolean);\n\n    if (parts.length >= 2 && /^heartlands$/i.test(parts[0])) {\n      return parts[1];\n    }\n  }\n\n  return \"\";\n}`;

  actions = replaceRequired(actions, before, after, "Meta area inference");
}

// If the Meta naming gives us an area, link the imported lead to the current
// active league for that area when there is one unambiguous match. This avoids
// hard-coding a Rawdon slug and continues to work if a season/slug changes.
if (!actions.includes("const currentLeagueCandidates = await prisma.league.findMany")) {
  const before = `  const inferredLeagueIdBySlug = new Map(\n    inferredLeagues.map((league) => [league.slug, league.id]),\n  );\n\n  const parsedRows = rows.map((row, index) => {`;

  const after = `  const inferredLeagueIdBySlug = new Map(\n    inferredLeagues.map((league) => [league.slug, league.id]),\n  );\n\n  const currentLeagueCandidates = await prisma.league.findMany({\n    where: {\n      isActive: true,\n      OR: [\n        { competitionId: null },\n        { currentForCompetitions: { some: { isActive: true } } },\n      ],\n    },\n    select: {\n      id: true,\n      area: true,\n      name: true,\n      slug: true,\n      venueName: true,\n    },\n  });\n\n  function inferLeagueIdFromArea(area: string) {\n    const normalizedArea = area.trim().toLowerCase();\n    if (!normalizedArea) return null;\n\n    const exactMatches = currentLeagueCandidates.filter(\n      (league) => league.area?.trim().toLowerCase() === normalizedArea,\n    );\n    if (exactMatches.length === 1) return exactMatches[0].id;\n    if (exactMatches.length > 1) return null;\n\n    const fuzzyMatches = currentLeagueCandidates.filter((league) =>\n      [league.area, league.name, league.slug, league.venueName].some((value) =>\n        value?.trim().toLowerCase().includes(normalizedArea),\n      ),\n    );\n\n    return fuzzyMatches.length === 1 ? fuzzyMatches[0].id : null;\n  }\n\n  const parsedRows = rows.map((row, index) => {`;

  actions = replaceRequired(actions, before, after, "current league area lookup");
}

actions = replaceRequired(
  actions,
  `    const leagueId = inferredLeagueSlug\n      ? inferredLeagueIdBySlug.get(inferredLeagueSlug) ?? null\n      : null;`,
  `    const leagueId = inferredLeagueSlug\n      ? inferredLeagueIdBySlug.get(inferredLeagueSlug) ?? inferLeagueIdFromArea(area)\n      : inferLeagueIdFromArea(area);`,
  "area-to-league fallback",
);

write(actionsPath, actions);

const formPath = "src/components/admin/leads/ImportLeadsForm.tsx";
let form = read(formPath);
form = form.replace(
  "SIXFL will read the Meta name, blank-headed email column, phone number, Facebook/Instagram source,\n            team-vs-player answer and start timing. Existing leads are skipped automatically by email or phone.",
  "SIXFL will read the Meta name, blank-headed email column, phone number, Facebook/Instagram source,\n            team-vs-player answer, start timing and recruitment area from campaign/ad naming (including Rawdon). Where one current league matches that area, it is linked automatically. Existing leads are skipped automatically by email or phone.",
);
write(formPath, form);

console.log("Meta lead imports now infer Rawdon/other campaign areas and auto-link an unambiguous current league.");
