const fs = require("node:fs");
const path = require("node:path");

const servicePath = path.join(
  process.cwd(),
  "src",
  "lib",
  "fixtures",
  "abandonment.ts",
);

let source = fs.readFileSync(servicePath, "utf8");
source = source.replaceAll(
  "updatedResponsibleCharge.paymentToken",
  "finalResponsibleCharge.paymentToken",
);
fs.writeFileSync(servicePath, source, "utf8");

console.log("Fixture abandonment payment-link narrowing is build-safe.");
