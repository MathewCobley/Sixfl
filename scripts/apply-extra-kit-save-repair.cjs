const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const actionPath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "actions.ts",
);
const pagePath = path.join(
  root,
  "src",
  "app",
  "captain",
  "team",
  "[teamid]",
  "kit",
  "page.tsx",
);

if (!fs.existsSync(actionPath) || !fs.existsSync(pagePath)) {
  throw new Error("Required captain kit files are missing.");
}

let action = fs.readFileSync(actionPath, "utf8");
let page = fs.readFileSync(pagePath, "utf8");

if (!action.includes('import { randomUUID } from "node:crypto";')) {
  const anchor = '"use server";';
  if (!action.includes(anchor)) throw new Error("Kit action header was not found.");
  action = action.replace(anchor, `${anchor}\n\nimport { randomUUID } from "node:crypto";`);
}

if (!action.includes("async function repairSavedKitRows")) {
  const marker = "export async function saveTeamKitOrderAction(formData: FormData) {";
  if (!action.includes(marker)) {
    throw new Error("saveTeamKitOrderAction was not found.");
  }

  const helper = `async function repairSavedKitRows(input: {
  teamId: string;
  kitQuantity: number;
  items: SaveTeamKitOrderItemInput[];
}) {
  const order = await getTeamKitOrder(input.teamId);
  if (!order) throw new Error("KIT_SAVE_AUDIT_NO_ORDER");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql\`
      UPDATE "TeamKitOrder"
      SET
        "kitQuantity" = \${input.kitQuantity},
        "updatedAt" = NOW()
      WHERE "id" = \${order.id}
    \`);

    await tx.$executeRaw(Prisma.sql\`
      DELETE FROM "TeamKitOrderItem"
      WHERE "orderId" = \${order.id}
    \`);

    for (const item of input.items) {
      await tx.$executeRaw(Prisma.sql\`
        INSERT INTO "TeamKitOrderItem" (
          "id",
          "orderId",
          "position",
          "backName",
          "shirtNumber",
          "kitSize",
          "sockSize",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          \${randomUUID()},
          \${order.id},
          \${item.position},
          \${item.backName},
          \${item.shirtNumber},
          \${item.kitSize}::"TeamKitSize",
          \${item.sockSize}::"TeamKitSockSize",
          NOW(),
          NOW()
        )
      \`);
    }
  });
}

function hasEverySavedKitPosition(
  order: Awaited<ReturnType<typeof getTeamKitOrder>>,
  kitQuantity: number,
) {
  if (!order || order.kitQuantity !== kitQuantity) return false;
  if (order.items.length !== kitQuantity) return false;
  const positions = new Set(order.items.map((item) => item.position));
  return Array.from({ length: kitQuantity }, (_, index) => index + 1).every(
    (position) => positions.has(position),
  );
}

`;

  action = action.replace(marker, helper + marker);
}

if (!action.includes("KIT_SAVE_REPAIR_FAILED")) {
  const syncMarker = "    await syncSelectedKitToTeam({ teamId, design });";
  if (!action.includes(syncMarker)) {
    throw new Error("Kit save synchronisation marker was not found.");
  }

  const auditBlock = `    let savedOrder = await getTeamKitOrder(teamId);
    if (!hasEverySavedKitPosition(savedOrder, kitQuantity)) {
      console.error("Team kit save omitted authorised rows; applying direct repair", {
        teamId,
        kitQuantity,
        savedKitQuantity: savedOrder?.kitQuantity ?? null,
        savedPositions: savedOrder?.items.map((item) => item.position) ?? [],
      });
      await repairSavedKitRows({ teamId, kitQuantity, items });
      savedOrder = await getTeamKitOrder(teamId);
    }

    if (!hasEverySavedKitPosition(savedOrder, kitQuantity)) {
      throw new Error("KIT_SAVE_REPAIR_FAILED");
    }

${syncMarker}`;

  action = action.replace(syncMarker, auditBlock);
}

if (!action.includes('error: "extra_kits_not_saved"')) {
  const catchMarker =
    '    redirect(buildRedirect(teamId, { error: "save_failed" }));';
  if (!action.includes(catchMarker)) {
    throw new Error("Kit save failure redirect was not found.");
  }
  action = action.replace(
    catchMarker,
    `    redirect(
      buildRedirect(teamId, {
        error:
          error instanceof Error && error.message.startsWith("KIT_SAVE_")
            ? "extra_kits_not_saved"
            : "save_failed",
      }),
    );`,
  );
}

if (!page.includes('error === "extra_kits_not_saved"')) {
  const errorAnchor =
    '  if (error === "save_failed") {';
  if (!page.includes(errorAnchor)) {
    throw new Error("Captain kit save error copy anchor was not found.");
  }
  page = page.replace(
    errorAnchor,
    `  if (error === "extra_kits_not_saved") {
    return "The paid additional kits were not saved correctly. Nothing has been submitted. Please leave the page open and contact SIXFL so we can recover the entries safely.";
  }
  if (error === "save_failed") {`,
  );
}

const checks = [
  action.includes("async function repairSavedKitRows"),
  action.includes("hasEverySavedKitPosition(savedOrder, kitQuantity)"),
  action.includes("await repairSavedKitRows({ teamId, kitQuantity, items })"),
  action.includes("KIT_SAVE_REPAIR_FAILED"),
  page.includes('error === "extra_kits_not_saved"'),
];
if (checks.some((check) => !check)) {
  throw new Error("Paid extra-kit save repair was not applied correctly.");
}

fs.writeFileSync(actionPath, action, "utf8");
fs.writeFileSync(pagePath, page, "utf8");
console.log(
  "Paid extra-kit rows are audited after every save and repaired transactionally if the normal save omits them.",
);
