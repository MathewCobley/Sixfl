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
  let markerIndex = source.lastIndexOf(marker);

  while (markerIndex >= 0) {
    const sectionStart = source.lastIndexOf("<section", markerIndex);
    const sectionEnd = source.indexOf("</section>", markerIndex);

    if (sectionStart < 0 || sectionEnd < 0) {
      console.warn(`Could not locate the optional section containing ${marker}; leaving the form unchanged.`);
      return;
    }

    source =
      source.slice(0, sectionStart) +
      source.slice(sectionEnd + "</section>".length);
    markerIndex = source.lastIndexOf(marker);
  }
}

// The allocation is already explained in the payment panel at the top of the
// page. Remove only the repeated summary inserted near the submit controls.
removeSectionContaining("Free kit allocation");

source = source
  .replaceAll("Submit free kit order", "Submit kit order")
  .replaceAll("Submit paid kit order", "Submit kit order")
  .replaceAll("Submit all seven kits", "Submit kit order")
  .replaceAll("Submit all nine kits", "Submit kit order")
  .replaceAll("Submit £70 kit package", "Submit kit order")
  .replaceAll("Submit £90 kit package", "Submit kit order")
  .replace(
    '{includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
    'Submit kit order',
  );

fs.writeFileSync(formPath, source, "utf8");
console.log("Removed the repeated bottom kit allocation panel and simplified the submit label.");
