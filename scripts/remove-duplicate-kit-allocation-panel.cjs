const fs = require("node:fs");
const path = require("node:path");

const formPath = path.join(
  process.cwd(),
  "src",
  "components",
  "captain",
  "TeamKitOrderForm.tsx",
);

if (!fs.existsSync(formPath)) {
  console.log("Team kit order form not present; skipping duplicate allocation cleanup.");
  process.exit(0);
}

let source = fs.readFileSync(formPath, "utf8");

function removeSectionContaining(marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return;

  const sectionStart = source.lastIndexOf("<section", markerIndex);
  const sectionEnd = source.indexOf("</section>", markerIndex);
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error(`Could not locate the section containing ${marker}.`);
  }

  source =
    source.slice(0, sectionStart) +
    source.slice(sectionEnd + "</section>".length);
}

// The included-kit allocation is already shown prominently at the top of the
// kit page. The second summary just above the submit buttons is repetitive.
removeSectionContaining("Free kit allocation");
removeSectionContaining("7 complete kits included");

source = source
  .replaceAll("Submit free kit order", "Submit kit order")
  .replaceAll("Submit paid kit order", "Submit kit order")
  .replaceAll("Submit all seven kits", "Submit kit order")
  .replaceAll("Submit all nine kits", "Submit kit order")
  .replace(
    '{includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
    '"Submit kit order"',
  );

if (source.includes("Free kit allocation")) {
  throw new Error("The duplicate kit allocation panel is still present.");
}
if (!source.includes("Submit kit order")) {
  throw new Error("The simplified kit-order submit label was not applied.");
}

fs.writeFileSync(formPath, source, "utf8");
console.log("Removed the duplicate kit allocation panel and simplified the submit label.");
