import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
let passed = 0;

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expectText(area, relativePath, source, needle, description) {
  if (!source.includes(needle)) {
    failures.push(`[${area}] ${description} (${relativePath})`);
    return;
  }
  passed += 1;
}

function expectRegex(area, relativePath, source, regex, description) {
  if (!regex.test(source)) {
    failures.push(`[${area}] ${description} (${relativePath})`);
    return;
  }
  passed += 1;
}

const kitPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const kitFormPath = "src/components/captain/TeamKitOrderForm.tsx";
const legacyKitActionPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const nativeKitActionPath = "src/app/captain/team/[teamid]/kit/save-v2.ts";
const kitAssignmentPatchPath = "scripts/apply-kit-player-assignments.cjs";

const kitPage = read(kitPagePath);
const kitForm = read(kitFormPath);
const legacyKitAction = read(legacyKitActionPath);
const nativeKitAction = read(nativeKitActionPath);
const kitAssignmentPatch = read(kitAssignmentPatchPath);

// Contract: a design submitted by another team in the same league is reserved.
expectText(
  "kits",
  kitPagePath,
  kitPage,
  "const takenDesignIds = new Set",
  "captain kit page must load reserved design ids",
);
expectRegex(
  "kits",
  kitPagePath,
  kitPage,
  /orders\."status"::text NOT IN \('DRAFT', 'CANCELLED'\)/,
  "draft and cancelled kit orders must not reserve designs",
);
expectText(
  "kits",
  kitPagePath,
  kitPage,
  "taken: takenDesignIds.has(design.id) && design.id !== selectedDesignId",
  "kit catalogue must tell the form which designs are taken",
);

// Contract: reserved designs remain visible but are unmistakably unavailable.
expectText(
  "kits",
  kitFormPath,
  kitForm,
  "taken: boolean;",
  "kit form design model must include taken state",
);
expectText(
  "kits",
  kitFormPath,
  kitForm,
  "const unavailable = design.taken && !selected;",
  "kit form must calculate unavailable designs",
);
expectText(
  "kits",
  kitFormPath,
  kitForm,
  "disabled={unavailable}",
  "taken designs must be disabled",
);
expectText(
  "kits",
  kitFormPath,
  kitForm,
  "aria-disabled={unavailable}",
  "taken designs must expose disabled state accessibly",
);
expectRegex(
  "kits",
  kitFormPath,
  kitForm,
  /opacity-35[^\n]*grayscale|grayscale[^\n]*opacity-35/,
  "taken designs must remain visibly greyed out",
);
expectRegex(
  "kits",
  kitFormPath,
  kitForm,
  />Taken<\/div>/,
  "taken designs must be labelled Taken",
);

// Contract: stale/manual submissions are rejected server-side too.
expectText(
  "kits",
  legacyKitActionPath,
  legacyKitAction,
  "designConflict",
  "legacy kit save action must check for design conflicts",
);
expectText(
  "kits",
  legacyKitActionPath,
  legacyKitAction,
  'error: "design_taken"',
  "legacy kit save action must return design_taken on conflict",
);
expectText(
  "kits",
  nativeKitActionPath,
  nativeKitAction,
  "KIT_DESIGN_TAKEN",
  "native V2 kit save action must reject a taken design",
);
expectText(
  "kits",
  nativeKitActionPath,
  nativeKitAction,
  'error instanceof Error && error.message === "KIT_DESIGN_TAKEN"',
  "native V2 kit save action must map conflicts to design_taken",
);
expectRegex(
  "kits",
  nativeKitActionPath,
  nativeKitAction,
  /other_order\."status"::text NOT IN \('DRAFT', 'CANCELLED'\)/,
  "native V2 conflict guard must ignore only draft and cancelled orders",
);
expectRegex(
  "kits",
  nativeKitActionPath,
  nativeKitAction,
  /FOR UPDATE OF league/,
  "native V2 submissions must serialize design reservation per league",
);

// Contract: source-preparation order must not erase the reservation UI.
expectText(
  "kits",
  kitAssignmentPatchPath,
  kitAssignmentPatch,
  'require("./apply-league-kit-design-lock.cjs");',
  "kit player-assignment preparation must re-apply league design locking",
);

if (failures.length) {
  console.error("\nSIXFL CRITICAL FEATURE CONTRACTS FAILED\n");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  console.error(
    "\nDo not merge this change. Restore the existing behaviour or deliberately update the contract with an approved product change.\n",
  );
  process.exit(1);
}

console.log(`SIXFL critical feature contracts passed (${passed} assertions).`);
console.log("Protected area: team kit design reservation and grey-out behaviour.");
