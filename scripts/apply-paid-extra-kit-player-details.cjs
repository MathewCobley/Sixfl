const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const assignmentLibPath = "src/lib/kits/player-assignments.ts";
const publicPagePath = "src/app/(public)/kit-details/[token]/page.tsx";
const assignmentComponentPath =
  "src/components/captain/TeamKitPlayerAssignments.tsx";
const assignmentRoutePath =
  "src/app/api/captain/team/[teamid]/kit-player-assignments/route.ts";
const captainPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";

function absolute(filePath) {
  return path.join(root, filePath);
}

function read(filePath) {
  return fs.readFileSync(absolute(filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(absolute(filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

function ensureComponentProp(source, componentMarker, before, after, label) {
  const markerIndex = source.indexOf(componentMarker);
  if (markerIndex < 0) {
    throw new Error(`Expected ${label} component was not found.`);
  }

  const componentEnd = source.indexOf("/>", markerIndex);
  if (componentEnd < 0) {
    throw new Error(`Expected end of ${label} component was not found.`);
  }

  const componentBlock = source.slice(markerIndex, componentEnd);
  if (componentBlock.includes(after.trim())) return source;

  const targetIndex = source.indexOf(before, markerIndex);
  if (targetIndex < 0 || targetIndex > componentEnd) {
    throw new Error(`Expected ${label} prop source was not found.`);
  }

  return (
    source.slice(0, targetIndex) +
    after +
    source.slice(targetIndex + before.length)
  );
}

// The captain order page can reopen a submitted/approved order when an extra kit
// is paid for, but the secure player form previously saw only the old order
// status and rejected the new slot as locked. Give the assignment one shared,
// payment-aware edit decision.
let assignmentLib = read(assignmentLibPath);

if (!assignmentLib.includes('from "@/lib/kits/extra-kit-quantity"')) {
  assignmentLib = replaceRequired(
    assignmentLib,
    'import { isTeamKitSize, type TeamKitSize } from "@/lib/kits/constants";',
    [
      'import { isTeamKitSize, type TeamKitSize } from "@/lib/kits/constants";',
      'import { getTeamExtraKitPaymentSummary } from "@/lib/kits/extra-kit-quantity";',
    ].join("\n"),
    "extra-kit payment summary import",
  );
}

if (!assignmentLib.includes("  orderKitQuantity: number | null;")) {
  assignmentLib = replaceRequired(
    assignmentLib,
    "  orderStatus: string | null;\n};",
    [
      "  orderStatus: string | null;",
      "  orderKitQuantity: number | null;",
      "  canEdit: boolean;",
      "};",
    ].join("\n"),
    "public assignment edit-state fields",
  );
}

assignmentLib = replaceRequired(
  assignmentLib,
  '    Array<Omit<PublicKitAssignment, "kitSize"> & { kitSize: string | null }>',
  '    Array<Omit<PublicKitAssignment, "kitSize" | "canEdit"> & { kitSize: string | null }>',
  "public assignment query result type",
);

assignmentLib = replaceRequired(
  assignmentLib,
  '      kit_order."status" AS "orderStatus"',
  [
    '      kit_order."status" AS "orderStatus",',
    '      kit_order."kitQuantity" AS "orderKitQuantity"',
  ].join("\n"),
  "public assignment order quantity",
);

assignmentLib = replaceRequired(
  assignmentLib,
  [
    "  const row = rows[0];",
    "  return row ? { ...row, kitSize: mapKitSize(row.kitSize) } : null;",
  ].join("\n"),
  [
    "  const row = rows[0];",
    "  if (!row) return null;",
    "",
    "  const paymentSummary = await getTeamExtraKitPaymentSummary(row.teamId);",
    "  const canEdit =",
    "    !row.orderStatus ||",
    '    row.orderStatus === "DRAFT" ||',
    "    ((row.orderStatus === \"SUBMITTED\" ||",
    '      row.orderStatus === "APPROVED") &&',
    "      row.position > (row.orderKitQuantity ?? 0) &&",
    "      row.position <= paymentSummary.totalKitQuantity);",
    "",
    "  return {",
    "    ...row,",
    "    kitSize: mapKitSize(row.kitSize),",
    "    canEdit,",
    "  };",
  ].join("\n"),
  "payment-aware public assignment edit state",
);

assignmentLib = replaceRequired(
  assignmentLib,
  '  if (assignment.orderStatus && assignment.orderStatus !== "DRAFT") {',
  "  if (!assignment.canEdit) {",
  "payment-aware assignment save guard",
);

write(assignmentLibPath, assignmentLib);

// Show the secure form for a newly paid slot even though the earlier order is
// still SUBMITTED/APPROVED, and explain why that one slot is available.
let publicPage = read(publicPagePath);

publicPage = replaceRequired(
  publicPage,
  [
    "  const locked = Boolean(",
    '    assignment.orderStatus && assignment.orderStatus !== "DRAFT",',
    "  );",
  ].join("\n"),
  [
    "  const locked = !assignment.canEdit;",
    "  const isNewPaidExtraKit = Boolean(",
    "    assignment.canEdit &&",
    "      assignment.orderStatus &&",
    '      assignment.orderStatus !== "DRAFT",',
    "  );",
  ].join("\n"),
  "public assignment payment-aware lock",
);

if (!publicPage.includes("Additional paid kit unlocked")) {
  publicPage = replaceRequired(
    publicPage,
    [
      "        {completed ? (",
      '          <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-emerald-50">',
    ].join("\n"),
    [
      "        {isNewPaidExtraKit ? (",
      '          <section className="rounded-3xl border border-sky-400/25 bg-sky-500/10 p-6 text-sky-50">',
      '            <h2 className="text-xl font-semibold">Additional paid kit unlocked</h2>',
      '            <p className="mt-2 text-sm leading-6 text-sky-100/75">',
      "              This kit was paid for after the team&apos;s earlier order was submitted. Complete the details here and the captain can then resubmit the expanded order.",
      "            </p>",
      "          </section>",
      "        ) : null}",
      "",
      "        {completed ? (",
      '          <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-6 text-emerald-50">',
    ].join("\n"),
    "new paid extra-kit explanation",
  );
}

write(publicPagePath, publicPage);

// During an expansion, old positions belong to the already submitted order.
// Keep those assignment controls locked while allowing only the newly paid slots.
let assignmentComponent = read(assignmentComponentPath);

if (!assignmentComponent.includes("  lockedThroughPosition: number;")) {
  assignmentComponent = replaceRequired(
    assignmentComponent,
    "  kitQuantity: number;\n",
    "  kitQuantity: number;\n  lockedThroughPosition: number;\n",
    "assignment locked-through prop",
  );
}

if (!assignmentComponent.includes("  lockedThroughPosition,\n")) {
  assignmentComponent = replaceRequired(
    assignmentComponent,
    "  kitQuantity,\n  initialMembers,",
    "  kitQuantity,\n  lockedThroughPosition,\n  initialMembers,",
    "assignment locked-through prop destructuring",
  );
}

if (!assignmentComponent.includes("const positionLocked =")) {
  assignmentComponent = replaceRequired(
    assignmentComponent,
    "          const samePlayer = assignment?.teamMemberId === selectedMemberId;",
    [
      "          const samePlayer = assignment?.teamMemberId === selectedMemberId;",
      "          const positionLocked =",
      "            locked || position <= lockedThroughPosition;",
    ].join("\n"),
    "per-position assignment lock",
  );
}

assignmentComponent = replaceRequired(
  assignmentComponent,
  "                  disabled={locked || busyPosition === position}",
  "                  disabled={positionLocked || busyPosition === position}",
  "assignment selector lock",
);

assignmentComponent = replaceRequired(
  assignmentComponent,
  [
    "                  disabled={",
    "                    locked ||",
    "                    busyPosition === position ||",
  ].join("\n"),
  [
    "                  disabled={",
    "                    positionLocked ||",
    "                    busyPosition === position ||",
  ].join("\n"),
  "assignment send-button lock",
);

assignmentComponent = replaceRequired(
  assignmentComponent,
  "              {assignment && !locked ? (",
  "              {assignment && !positionLocked ? (",
  "assignment removal lock",
);

write(assignmentComponentPath, assignmentComponent);

// Enforce the same old-position lock on the assignment API. A stale tab or a
// crafted request must not reassign a kit that was already in the submitted order.
let assignmentRoute = read(assignmentRoutePath);

if (!assignmentRoute.includes("const positionCanBeChanged =")) {
  assignmentRoute = replaceRequired(
    assignmentRoute,
    [
      "  if (!action || !position) {",
      '    return jsonError("Choose a valid kit slot.");',
      "  }",
      "",
      '  if (action === "clear") {',
    ].join("\n"),
    [
      "  if (!action || !position) {",
      '    return jsonError("Choose a valid kit slot.");',
      "  }",
      "",
      "  const orderRows = await prisma.$queryRaw<",
      "    Array<{ status: string; kitQuantity: number }>",
      "  >(Prisma.sql`",
      "    SELECT",
      '      "status"::text AS "status",',
      '      "kitQuantity"',
      '    FROM "TeamKitOrder"',
      '    WHERE "teamId" = ${teamid}',
      "    LIMIT 1",
      "  `);",
      "  const order = orderRows[0] ?? null;",
      "  const positionCanBeChanged =",
      "    !order ||",
      '    order.status === "DRAFT" ||',
      "    ((order.status === \"SUBMITTED\" || order.status === \"APPROVED\") &&",
      "      position > order.kitQuantity &&",
      "      position <= paymentSummary.totalKitQuantity);",
      "",
      "  if (!positionCanBeChanged) {",
      "    return jsonError(",
      '      "This kit slot is already included in the submitted order and cannot be reassigned.",',
      "      409,",
      "    );",
      "  }",
      "",
      '  if (action === "clear") {',
    ].join("\n"),
    "server-side assignment position lock",
  );
}

write(assignmentRoutePath, assignmentRoute);

// Pass the original submitted quantity to the assignment component. When the
// page is reopened for paid extras, only positions above this value are editable.
let captainPage = read(captainPagePath);

captainPage = ensureComponentProp(
  captainPage,
  "<TeamKitPlayerAssignments",
  "          locked={locked}\n",
  [
    "          lockedThroughPosition={",
    "            canExpandSubmittedOrder ? order?.kitQuantity ?? 0 : 0",
    "          }",
    "          locked={locked}",
    "",
  ].join("\n"),
  "TeamKitPlayerAssignments locked-through position",
);

write(captainPagePath, captainPage);

const finalAssignmentLib = read(assignmentLibPath);
const finalPublicPage = read(publicPagePath);
const finalComponent = read(assignmentComponentPath);
const finalRoute = read(assignmentRoutePath);
const finalCaptainPage = read(captainPagePath);

if (
  !finalAssignmentLib.includes("paymentSummary.totalKitQuantity") ||
  !finalAssignmentLib.includes("if (!assignment.canEdit)") ||
  !finalPublicPage.includes("const locked = !assignment.canEdit") ||
  !finalPublicPage.includes("Additional paid kit unlocked") ||
  !finalComponent.includes("lockedThroughPosition: number") ||
  !finalComponent.includes("const positionLocked =") ||
  !finalRoute.includes("const positionCanBeChanged =") ||
  !finalCaptainPage.includes("lockedThroughPosition={")
) {
  throw new Error(
    "Paid extra-kit player details and per-position assignment locks were not applied correctly.",
  );
}

console.log(
  "Newly paid extra-kit slots can be completed after an earlier submission, while confirmed positions remain locked.",
);
