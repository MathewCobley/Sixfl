const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(root, "src", "app", "captain", "team", "[teamid]", "kit", "page.tsx");
const formPath = path.join(root, "src", "components", "captain", "TeamKitOrderForm.tsx");

for (const filePath of [pagePath, formPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required native kit save file is missing: ${path.relative(root, filePath)}`);
  }
}

let page = fs.readFileSync(pagePath, "utf8");
page = page.replace(
  'import { saveTeamKitOrderAction } from "./actions";',
  'import { saveTeamKitOrderV2Action } from "./save-v2";',
);
page = page.replace(
  '    await saveTeamKitOrderAction(formData);',
  '    await saveTeamKitOrderV2Action(formData);',
);

if (
  !page.includes('import { saveTeamKitOrderV2Action } from "./save-v2";') ||
  !page.includes("await saveTeamKitOrderV2Action(formData);")
) {
  throw new Error("Captain kit page was not switched to the native V2 save action.");
}
fs.writeFileSync(pagePath, page, "utf8");

let form = fs.readFileSync(formPath, "utf8");

// Remove the duplicated allocation explanation rendered near the submit buttons.
const allocationMarker = "Free kit allocation";
const allocationIndex = form.lastIndexOf(allocationMarker);
if (allocationIndex >= 0) {
  const sectionStart = form.lastIndexOf("<section", allocationIndex);
  const sectionEnd = form.indexOf("</section>", allocationIndex);
  if (sectionStart >= 0 && sectionEnd >= 0) {
    form = form.slice(0, sectionStart) + form.slice(sectionEnd + "</section>".length);
  }
}

form = form
  .replaceAll("Submit free kit order", "Submit kit order")
  .replaceAll("Submit paid kit order", "Submit kit order")
  .replaceAll("Submit all seven kits", "Submit kit order")
  .replaceAll("Submit all nine kits", "Submit kit order")
  .replaceAll("Submit £70 kit package", "Submit kit order")
  .replaceAll("Submit £90 kit package", "Submit kit order");

if (!form.includes("Submit kit order")) {
  throw new Error("The team kit submit button wording was not normalised.");
}
if (form.lastIndexOf(allocationMarker) >= 0) {
  throw new Error("The duplicated bottom free-kit allocation panel remains.");
}

fs.writeFileSync(formPath, form, "utf8");
console.log(
  "The team kit form now uses the native V2 save action for every authorised row, has one submit label and no duplicated bottom allocation panel.",
);
