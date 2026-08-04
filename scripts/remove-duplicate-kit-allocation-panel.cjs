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

function removeConditionalAllocationSummary() {
  let markerIndex = source.lastIndexOf("Free kit allocation");

  while (markerIndex >= 0) {
    const conditionalStart = source.lastIndexOf(
      "{includedKitQuantity > 0 ? (",
      markerIndex,
    );
    const paidMarkerIndex = source.indexOf("Paid kit order", markerIndex);
    const conditionalEnd =
      paidMarkerIndex >= 0 ? source.indexOf("\n      )}", paidMarkerIndex) : -1;

    if (conditionalStart < 0 || paidMarkerIndex < 0 || conditionalEnd < 0) {
      console.warn(
        "Could not locate the complete optional kit allocation summary; leaving the form unchanged.",
      );
      return;
    }

    source =
      source.slice(0, conditionalStart) +
      source.slice(conditionalEnd + "\n      )}".length);
    markerIndex = source.lastIndexOf("Free kit allocation");
  }
}

// The allocation is already explained in the payment panel at the top of the
// page. Remove the complete conditional summary, including both branches and
// the surrounding ternary expression, so the generated JSX remains valid.
removeConditionalAllocationSummary();

source = source
  .replaceAll("Submit free kit order", "Submit kit order")
  .replaceAll("Submit paid kit order", "Submit kit order")
  .replaceAll("Submit all seven kits", "Submit kit order")
  .replaceAll("Submit all nine kits", "Submit kit order")
  .replaceAll("Submit £70 kit package", "Submit kit order")
  .replaceAll("Submit £90 kit package", "Submit kit order")
  .replace(
    '{includedKitQuantity > 0 ? "Submit free kit order" : "Submit paid kit order"}',
    "Submit kit order",
  );

if (
  source.includes("Free kit allocation") ||
  source.includes("{includedKitQuantity > 0 ? (\n\n      ) : (")
) {
  throw new Error("The duplicate kit allocation summary was not removed safely.");
}

fs.writeFileSync(formPath, source, "utf8");
console.log("Removed the repeated bottom kit allocation panel and simplified the submit label.");
