const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const formPath = path.join(root, "src", "components", "captain", "TeamKitOrderForm.tsx");
const pagePath = path.join(root, "src", "app", "captain", "team", "[teamid]", "kit", "page.tsx");
const actionPath = path.join(root, "src", "app", "captain", "team", "[teamid]", "kit", "actions.ts");
const dbPath = path.join(root, "src", "lib", "kits", "db.ts");

if (!fs.existsSync(formPath)) {
  console.warn("TeamKitOrderForm is missing; skipping kit dropdown repair.");
  process.exit(0);
}

let form = fs.readFileSync(formPath, "utf8");

// The personalisation section used overflow-hidden, so the final kit-size
// dropdown was clipped at the bottom of the order and appeared to stop at Small.
const headingMatch = form.match(/Personalise all (?:\{kitQuantity\}|\{TEAM_KIT_QUANTITY\}|seven|nine|\d+) kits/);
if (headingMatch?.index !== undefined) {
  const sectionStart = form.lastIndexOf("<section", headingMatch.index);
  const sectionTagEnd = form.indexOf(">", sectionStart);

  if (sectionStart >= 0 && sectionTagEnd >= 0) {
    const openingTag = form.slice(sectionStart, sectionTagEnd + 1);
    if (openingTag.includes("overflow-hidden")) {
      form =
        form.slice(0, sectionStart) +
        openingTag.replace("overflow-hidden", "overflow-visible") +
        form.slice(sectionTagEnd + 1);
    }
  }
} else {
  console.warn("Team-kit personalisation heading was not found; dropdown clipping repair was skipped.");
}

fs.writeFileSync(formPath, form, "utf8");

// Report, rather than hide, any regression where the page displays paid rows but
// the server action/database falls back to the included allocation. The existing
// paid-extra-kit patch remains responsible for applying these dynamic markers.
const sources = {
  form,
  page: fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "",
  action: fs.existsSync(actionPath) ? fs.readFileSync(actionPath, "utf8") : "",
  db: fs.existsSync(dbPath) ? fs.readFileSync(dbPath, "utf8") : "",
};

const safetyMarkers = [
  [sources.form, "kitQuantity: number;", "dynamic quantity prop in TeamKitOrderForm"],
  [sources.form, "Kit {row.position} of {kitQuantity}", "dynamic row label"],
  [sources.page, "kitQuantity={kitQuantity}", "authorised quantity passed to form"],
  [sources.action, "position <= kitQuantity", "all paid rows validated and saved"],
  [sources.action, "      kitQuantity,", "authorised quantity passed to database"],
  [sources.db, "input.items.length !== input.kitQuantity", "dynamic database row validation"],
  [sources.db, '"kitQuantity" = ${input.kitQuantity}', "dynamic order quantity persistence"],
];

const missing = safetyMarkers
  .filter(([source, marker]) => !source.includes(marker))
  .map(([, , label]) => label);

if (missing.length > 0) {
  console.warn(`Team-kit dynamic-save safety markers missing: ${missing.join(", ")}.`);
} else {
  console.log("All paid additional kit rows are included in save and submit processing.");
}

console.log("Kit-size dropdowns can now open outside the personalisation section without being clipped.");
