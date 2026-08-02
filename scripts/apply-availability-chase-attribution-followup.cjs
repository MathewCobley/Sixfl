const fs = require("node:fs");
const path = require("node:path");

const filePath = path.resolve(
  __dirname,
  "../src/lib/communications/log-dispatch.ts",
);

let source = fs.readFileSync(filePath, "utf8");
const legacyCall =
  "participantRole: getParticipantRole(dispatch.createdByUserId ?? null),";
const correctedCall = "participantRole: getParticipantRole(dispatch),";

if (source.includes(legacyCall)) {
  source = source.split(legacyCall).join(correctedCall);
  fs.writeFileSync(filePath, source, "utf8");
}

if (fs.readFileSync(filePath, "utf8").includes(legacyCall)) {
  throw new Error("A legacy availability chase participant-role call remains.");
}

console.log(
  "All notification timeline entries now use dispatch metadata for captain/admin attribution.",
);
