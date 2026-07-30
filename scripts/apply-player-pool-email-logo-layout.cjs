const fs = require("node:fs");
const path = require("node:path");

const target = path.join(process.cwd(), "src", "lib", "email", "buildEmail.ts");
let source = fs.readFileSync(target, "utf8");

const replacements = [
  [
    `      width: 300,`,
    `      width: 380,`,
  ],
  [
    `${'${teamLogoUrl ? `<tr><td style="padding:0 0 14px 0;"><img src="${escapeHtml(teamLogoUrl)}" alt="SIXFL Player Pool" width="260" style="display:block;width:260px;max-width:100%;height:auto;object-fit:contain;border:0;outline:none;text-decoration:none;" /></td></tr>` : ""}'}`,
    `${'${teamLogoUrl ? `<tr><td align="center" style="padding:0;text-align:center;"><img src="${escapeHtml(teamLogoUrl)}" alt="SIXFL Player Pool" width="360" style="display:block;width:360px;max-width:100%;height:auto;margin:0 auto;object-fit:contain;border:0;outline:none;text-decoration:none;" /></td></tr>` : ""}'}`,
  ],
  [
    `        .sixfl-email-logo { width: 150px !important; max-width: 150px !important; }`,
    `        .sixfl-email-logo { width: 150px !important; max-width: 150px !important; }\n        .sixfl-email-logo-player-pool { width: 270px !important; max-width: 270px !important; margin: 0 auto !important; }`,
  ],
  [
    `<td class="sixfl-email-logo-cell" bgcolor="${'${logoBackground}'}" style="padding:${'${logoPadding}'};background:${'${logoBackground}'};">`,
    `<td class="sixfl-email-logo-cell" bgcolor="${'${logoBackground}'}" align="${'${isPlayerPool ? "center" : "left"}'}" style="padding:${'${logoPadding}'};background:${'${logoBackground}'};text-align:${'${isPlayerPool ? "center" : "left"}'};">`,
  ],
  [
    `<img src="${'${logo.src}'}" alt="${'${logo.alt}'}" width="${'${logo.width}'}" class="sixfl-email-logo" style="display:block;width:${'${logo.width}'}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`,
    `<img src="${'${logo.src}'}" alt="${'${logo.alt}'}" width="${'${logo.width}'}" class="sixfl-email-logo${'${isPlayerPool ? " sixfl-email-logo-player-pool" : ""}'}" style="display:block;width:${'${logo.width}'}px;max-width:100%;height:auto;margin:${'${isPlayerPool ? "0 auto" : "0"}'};border:0;outline:none;text-decoration:none;" />`,
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    throw new Error(`Could not find expected PlayerPool email logo layout snippet:\n${before}`);
  }
  source = source.replace(before, after);
}

// The PlayerPool logo already explains the product. Never show a redundant
// subtitle such as “Private player matching” beneath it.
source = source.replace(
  /\n\s*\$\{leagueName \? `<tr><td style="color:#c4d4ce;font-size:14px;line-height:1\.4;letter-spacing:0\.03em;">\$\{escapeHtml\(leagueName\)\}<\/td><\/tr>` : ""\}/,
  "",
);

fs.writeFileSync(target, source);

const callerFiles = [
  path.join(process.cwd(), "src", "app", "(admin)", "admin", "player-pool", "actions.ts"),
  path.join(process.cwd(), "src", "app", "(admin)", "admin", "leads", "player-pool-actions.ts"),
  path.join(process.cwd(), "src", "app", "api", "admin", "player-prospects", "[prospectId]", "player-pool", "route.ts"),
];

for (const file of callerFiles) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, "utf8");
  const after = before.replaceAll(
    `leagueName: "Private player matching",`,
    `leagueName: null,`,
  );
  if (after !== before) fs.writeFileSync(file, after);
}

console.log("Applied PlayerPool email logo size, centring and subtitle removal.");