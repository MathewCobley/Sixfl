const fs = require("node:fs");
const path = require("node:path");

require("./apply-team-lead-confirmation-chase.cjs");

const root = process.cwd();
const actionsPath = path.join(
  root,
  "src/app/(admin)/admin/player-pool/actions.ts",
);

let source = fs.readFileSync(actionsPath, "utf8");

const anchor = [
  "  await logNotificationDispatchToThread({ dispatch, recipient });",
  "",
  '  revalidatePath("/admin/player-pool");',
].join("\n");

const replacement = [
  "  await logNotificationDispatchToThread({ dispatch, recipient });",
  "",
  "  const closedAt = new Date();",
  "  await prisma.interestLead.update({",
  "    where: { id: lead.id },",
  "    data: {",
  '      status: "CLOSED",',
  "      contactedAt: lead.contactedAt ?? closedAt,",
  "      convertedAt: lead.convertedAt ?? closedAt,",
  "      closedAt: lead.closedAt ?? closedAt,",
  "    },",
  "  });",
  "",
  '  revalidatePath("/admin/leads");',
  "  revalidatePath(`/admin/leads/${lead.id}`);",
  '  revalidatePath("/admin/player-pool");',
].join("\n");

if (!source.includes(replacement)) {
  if (!source.includes(anchor)) {
    throw new Error(
      "Could not find the PlayerPool invitation completion point in actions.ts.",
    );
  }
  source = source.replace(anchor, replacement);
  fs.writeFileSync(actionsPath, source, "utf8");
}

if (
  !source.includes('status: "CLOSED"') ||
  !source.includes('revalidatePath("/admin/leads")') ||
  !source.includes("revalidatePath(`/admin/leads/${lead.id}`)")
) {
  throw new Error("PlayerPool lead closure patch was not applied correctly.");
}

console.log(
  "Player leads now close automatically after their PlayerPool profile invitation is queued.",
);
