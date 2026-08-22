const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/leads/page.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

const quickSendImport =
  'import LeadConfirmationQuickSendButton from "@/components/admin/leads/LeadConfirmationQuickSendButton";';
const chaseImport =
  'import LeadConfirmationChaseButton from "@/components/admin/leads/LeadConfirmationChaseButton";';

if (!source.includes(chaseImport)) {
  if (!source.includes(quickSendImport)) {
    throw new Error("Lead confirmation quick-send import was not found.");
  }
  source = source.replace(quickSendImport, `${quickSendImport}\n${chaseImport}`);
}

const confirmationMapBlock = `  const confirmationByLeadId = new Map(\n    confirmationRows.map((row) => [row.leadId, row]),\n  );`;
const chaseHistoryBlock = `${confirmationMapBlock}\n\n  const confirmationChaseRows = leads.length\n    ? await prisma.notificationDispatch.findMany({\n        where: {\n          sourceType: \"LEAD_TEAM_CONFIRMATION_CHASE\",\n          sourceId: { in: leads.map((lead) => lead.id) },\n        },\n        orderBy: { createdAt: \"desc\" },\n        select: { sourceId: true, createdAt: true },\n      })\n    : [];\n  const latestChaseByLeadId = new Map<string, Date>();\n  for (const row of confirmationChaseRows) {\n    if (row.sourceId && !latestChaseByLeadId.has(row.sourceId)) {\n      latestChaseByLeadId.set(row.sourceId, row.createdAt);\n    }\n  }`;

if (!source.includes("const latestChaseByLeadId = new Map<string, Date>();")) {
  if (!source.includes(confirmationMapBlock)) {
    throw new Error("Lead confirmation map block was not found.");
  }
  source = source.replace(confirmationMapBlock, chaseHistoryBlock);
}

const rowMetaBlock = `                  const confirmation = confirmationByLeadId.get(lead.id) ?? null;\n                  const confirmationMeta = getConfirmationMeta(confirmation);`;
const rowMetaWithChase = `${rowMetaBlock}\n                  const latestChasedAt = latestChaseByLeadId.get(lead.id) ?? null;`;
if (!source.includes("const latestChasedAt = latestChaseByLeadId.get(lead.id) ?? null;")) {
  if (!source.includes(rowMetaBlock)) {
    throw new Error("Lead confirmation row metadata block was not found.");
  }
  source = source.replace(rowMetaBlock, rowMetaWithChase);
}

const quickSendBlock = `                              <LeadConfirmationQuickSendButton\n                                leadId={lead.id}\n                                canSend={canSendConfirmation}\n                                alreadySent={Boolean(confirmation?.sentAt)}\n                              />`;
const chaseOnlyBlock = `${quickSendBlock}\n                              {confirmation?.status === \"PENDING\" && confirmation.sentAt ? (\n                                <LeadConfirmationChaseButton\n                                  leadId={lead.id}\n                                  canChase={canSendConfirmation}\n                                />\n                              ) : null}`;
const chaseWithTimestampBlock = `${quickSendBlock}\n                              {confirmation?.status === \"PENDING\" && confirmation.sentAt ? (\n                                <>\n                                  <LeadConfirmationChaseButton\n                                    leadId={lead.id}\n                                    canChase={canSendConfirmation}\n                                  />\n                                  {latestChasedAt ? (\n                                    <div className=\"max-w-[150px] text-right text-[11px] leading-4 text-amber-200/75\">\n                                      Chased {formatDateTime(latestChasedAt)}\n                                    </div>\n                                  ) : null}\n                                </>\n                              ) : null}`;

if (!source.includes("Chased {formatDateTime(latestChasedAt)}")) {
  if (source.includes(chaseOnlyBlock)) {
    source = source.replace(chaseOnlyBlock, chaseWithTimestampBlock);
  } else if (source.includes(quickSendBlock)) {
    source = source.replace(quickSendBlock, chaseWithTimestampBlock);
  } else {
    throw new Error("Lead confirmation chase button block was not found.");
  }
}

source = source.replace(
  'label: `Sent ${formatDateTime(row.sentAt)}`',
  'label: `Link sent ${formatDateTime(row.sentAt)}`',
);

if (
  !source.includes(chaseImport) ||
  !source.includes("<LeadConfirmationChaseButton") ||
  !source.includes('confirmation?.status === "PENDING"') ||
  !source.includes("const latestChaseByLeadId = new Map<string, Date>();") ||
  !source.includes("Chased {formatDateTime(latestChasedAt)}")
) {
  throw new Error("Team lead confirmation chase UI was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Pending team leads now show a chase-form button and the latest chase timestamp on Admin Leads.",
);
