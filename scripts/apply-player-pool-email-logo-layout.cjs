const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "src", "lib", "email", "buildEmail.ts");
let source = fs.readFileSync(target, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Could not apply ${label}. Expected snippet was not found:\n${before}`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `export type SIXFLEmailBranding = {\n  teamName?: string | null;`,
  `export type SIXFLEmailBranding = {\n  brand?: "sixfl-tv" | "player-pool" | null;\n  teamName?: string | null;`,
  "PlayerPool email brand type",
);

source = source.replace(
  /(if \(brand === "player-pool"\) \{[\s\S]*?alt: "SIXFL Player Pool",\n\s*width:)\s*(?:300|380|420)(,)/,
  "$1 420$2",
);

replaceRequired(
  `  return { body: bodyWithoutMarkers, brand };\n}\n\nfunction getLogoDetails(brand: EmailBrand): LogoDetails {`,
  `  return { body: bodyWithoutMarkers, brand };\n}\n\nfunction resolveEmailBrand(input: {\n  bodyBrand: EmailBrand;\n  branding?: SIXFLEmailBranding;\n}): EmailBrand {\n  const explicitBrand = input.branding?.brand;\n  if (explicitBrand === "sixfl-tv" || explicitBrand === "player-pool") {\n    return explicitBrand;\n  }\n\n  if (input.bodyBrand !== "sixfl") {\n    return input.bodyBrand;\n  }\n\n  const teamName = input.branding?.teamName?.trim().toLowerCase().replace(/\\s+/g, " ");\n  const teamLogoUrl = input.branding?.teamLogoUrl?.trim().toLowerCase() || "";\n\n  if (\n    teamName === "sixfl playerpool" ||\n    teamName === "sixfl player pool" ||\n    teamLogoUrl.includes("sixfl%20player%20pool") ||\n    teamLogoUrl.includes("sixfl player pool")\n  ) {\n    return "player-pool";\n  }\n\n  return input.bodyBrand;\n}\n\nfunction getLogoDetails(brand: EmailBrand): LogoDetails {`,
  "shared PlayerPool brand resolution",
);

replaceRequired(
  `function buildBrandingBlockHtml(branding?: SIXFLEmailBranding) {\n  const teamName = branding?.teamName?.trim();`,
  `function buildBrandingBlockHtml(\n  branding?: SIXFLEmailBranding,\n  brand: EmailBrand = "sixfl",\n) {\n  if (brand === "player-pool") return "";\n\n  const teamName = branding?.teamName?.trim();`,
  "shared PlayerPool header without a duplicate branding panel",
);

replaceRequired(
  `        .sixfl-email-logo { width: 150px !important; max-width: 150px !important; }`,
  `        .sixfl-email-logo { width: 150px !important; max-width: 150px !important; }\n        .sixfl-email-logo-player-pool { width: 300px !important; max-width: 300px !important; margin: 0 auto !important; }`,
  "responsive PlayerPool logo size",
);

replaceRequired(
  `<td class="sixfl-email-logo-cell" bgcolor="${"${logoBackground}"}" style="padding:${"${logoPadding}"};background:${"${logoBackground}"};">`,
  `<td class="sixfl-email-logo-cell" bgcolor="${"${logoBackground}"}" align="${"${isPlayerPool ? \"center\" : \"left\"}"}" style="padding:${"${logoPadding}"};background:${"${logoBackground}"};text-align:${"${isPlayerPool ? \"center\" : \"left\"}"};">`,
  "centred shared PlayerPool header",
);

replaceRequired(
  `<img src="${"${logo.src}"}" alt="${"${logo.alt}"}" width="${"${logo.width}"}" class="sixfl-email-logo" style="display:block;width:${"${logo.width}"}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`,
  `<img src="${"${logo.src}"}" alt="${"${logo.alt}"}" width="${"${logo.width}"}" class="sixfl-email-logo${"${isPlayerPool ? \" sixfl-email-logo-player-pool\" : \"\"}"}" style="display:block;width:${"${logo.width}"}px;max-width:100%;height:auto;margin:${"${isPlayerPool ? \"0 auto\" : \"0\"}"};border:0;outline:none;text-decoration:none;" />`,
  "shared PlayerPool logo class",
);

replaceRequired(
  `  const brandResult = extractEmailBrand(input.body);\n  const logo = getLogoDetails(brandResult.brand);\n  const bodyHtml = buildBodyHtmlWithOptionalCta(brandResult.body, input.cta);\n  const brandingHtml = buildBrandingBlockHtml(input.branding);`,
  `  const brandResult = extractEmailBrand(input.body);\n  const brand = resolveEmailBrand({\n    bodyBrand: brandResult.brand,\n    branding: input.branding,\n  });\n  const logo = getLogoDetails(brand);\n  const bodyHtml = buildBodyHtmlWithOptionalCta(brandResult.body, input.cta);\n  const brandingHtml = buildBrandingBlockHtml(input.branding, brand);`,
  "shared PlayerPool header selection",
);

source = source
  .replaceAll(`const isSixflTv = brandResult.brand === "sixfl-tv";`, `const isSixflTv = brand === "sixfl-tv";`)
  .replaceAll(`const isPlayerPool = brandResult.brand === "player-pool";`, `const isPlayerPool = brand === "player-pool";`)
  .replaceAll(`const outerBackground = getOuterBackground(brandResult.brand);`, `const outerBackground = getOuterBackground(brand);`)
  .replaceAll(`return buildResponsiveEmailDocument(contentHtml, brandResult.brand);`, `return buildResponsiveEmailDocument(contentHtml, brand);`);

const requiredPostconditions = [
  `brand?: "sixfl-tv" | "player-pool" | null;`,
  `const brand = resolveEmailBrand({`,
  `const brandingHtml = buildBrandingBlockHtml(input.branding, brand);`,
  `width: 420,`,
  `sixfl-email-logo-player-pool`,
];

for (const expected of requiredPostconditions) {
  if (!source.includes(expected)) {
    throw new Error(`PlayerPool shared email header postcondition failed: ${expected}`);
  }
}

const obsoleteSubtitle = "Private player matching";
const playerPoolCallers = [
  path.join(process.cwd(), "src", "app", "(admin)", "admin", "player-pool", "actions.ts"),
  path.join(process.cwd(), "src", "app", "(admin)", "admin", "leads", "player-pool-actions.ts"),
  path.join(process.cwd(), "src", "app", "api", "admin", "player-prospects", "[prospectId]", "player-pool", "route.ts"),
];

for (const file of playerPoolCallers) {
  if (!fs.existsSync(file)) continue;
  const caller = fs.readFileSync(file, "utf8");
  if (caller.includes(obsoleteSubtitle)) {
    throw new Error(`Obsolete PlayerPool subtitle remains in ${file}`);
  }
}

fs.writeFileSync(target, source);

console.log(
  "Applied one shared PlayerPool email header: 420px centred logo, no duplicate panel and no subtitle.",
);
