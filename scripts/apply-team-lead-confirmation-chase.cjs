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

const quickSendBlock = `                              <LeadConfirmationQuickSendButton
                                leadId={lead.id}
                                canSend={canSendConfirmation}
                                alreadySent={Boolean(confirmation?.sentAt)}
                              />`;
const chaseBlock = `${quickSendBlock}
                              {confirmation?.status === "PENDING" && confirmation.sentAt ? (
                                <LeadConfirmationChaseButton
                                  leadId={lead.id}
                                  canChase={canSendConfirmation}
                                />
                              ) : null}`;

if (!source.includes("<LeadConfirmationChaseButton")) {
  if (!source.includes(quickSendBlock)) {
    throw new Error("Lead confirmation quick-send button block was not found.");
  }
  source = source.replace(quickSendBlock, chaseBlock);
}

source = source.replace(
  'label: `Sent ${formatDateTime(row.sentAt)}`',
  'label: `Link sent ${formatDateTime(row.sentAt)}`',
);

if (
  !source.includes(chaseImport) ||
  !source.includes("<LeadConfirmationChaseButton") ||
  !source.includes('confirmation?.status === "PENDING"')
) {
  throw new Error("Team lead confirmation chase UI was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Pending team leads now have a dedicated chase-form email button on Admin Leads.",
);
