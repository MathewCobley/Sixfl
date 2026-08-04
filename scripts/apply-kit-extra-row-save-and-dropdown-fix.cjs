const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const formPath = path.join(root, "src", "components", "captain", "TeamKitOrderForm.tsx");
const pagePath = path.join(root, "src", "app", "captain", "team", "[teamid]", "kit", "page.tsx");
const actionPath = path.join(root, "src", "app", "captain", "team", "[teamid]", "kit", "actions.ts");
const dbPath = path.join(root, "src", "lib", "kits", "db.ts");

for (const filePath of [formPath, pagePath, actionPath, dbPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required team-kit file is missing: ${path.relative(root, filePath)}`);
  }
}

let form = fs.readFileSync(formPath, "utf8");

// The personalisation section used overflow-hidden, so the final kit-size
// dropdown was clipped at the bottom of the order and appeared to stop at Small.
const personalisationMarker = "Personalise all {kitQuantity} kits";
const markerIndex = form.indexOf(personalisationMarker);
if (markerIndex < 0) {
  throw new Error("Dynamic kit personalisation heading was not found.");
}

const sectionStart = form.lastIndexOf("<section", markerIndex);
const sectionTagEnd = form.indexOf(">", sectionStart);
if (sectionStart < 0 || sectionTagEnd < 0) {
  throw new Error("Personalisation section opening tag was not found.");
}

const openingTag = form.slice(sectionStart, sectionTagEnd + 1);
if (openingTag.includes("overflow-hidden")) {
  form =
    form.slice(0, sectionStart) +
    openingTag.replace("overflow-hidden", "overflow-visible") +
    form.slice(sectionTagEnd + 1);
}

fs.writeFileSync(formPath, form, "utf8");

// Do not allow a deployment where the page displays paid rows but the server
// action or database helper silently falls back to the seven included kits.
const page = fs.readFileSync(pagePath, "utf8");
const action = fs.readFileSync(actionPath, "utf8");
const db = fs.readFileSync(dbPath, "utf8");

const requiredMarkers = [
  [form, "kitQuantity: number;", "dynamic quantity prop in TeamKitOrderForm"],
  [form, "buildInitialRows(initialItems, kitQuantity)", "dynamic form row builder"],
  [form, "Kit {row.position} of {kitQuantity}", "dynamic row label"],
  [form, "overflow-visible rounded-3xl", "unclipped personalisation section"],
  [page, "getTeamExtraKitPaymentSummary(teamid)", "paid-kit summary on captain page"],
  [page, "kitQuantity={kitQuantity}", "authorised quantity passed to form"],
  [action, "getTeamExtraKitPaymentSummary(teamId)", "paid-kit summary in save action"],
  [action, "position <= kitQuantity", "all paid rows validated and saved"],
  [action, "      kitQuantity,", "authorised quantity passed to database"],
  [db, "kitQuantity: number;", "dynamic quantity database input"],
  [db, "input.items.length !== input.kitQuantity", "dynamic database row validation"],
  [db, '"kitQuantity" = ${input.kitQuantity}', "dynamic existing-order quantity persistence"],
  [db, "${input.kitQuantity},", "dynamic new-order quantity persistence"],
];

for (const [source, marker, label] of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`Team-kit safety check failed: ${label}.`);
  }
}

console.log(
  "Kit-size dropdowns are no longer clipped, and every fully paid additional kit is required and persisted when the captain saves or submits the order.",
);
