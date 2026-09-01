const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "lib",
  "fixtures",
  "night-board-change-notifications.ts",
);

if (!fs.existsSync(filePath)) {
  throw new Error("Night Board notification source not found for multi-captain patch.");
}

let source = fs.readFileSync(filePath, "utf8");
let changed = false;

const importAnchor = 'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";';
const importLine = 'import { upsertAdditionalCaptainOperationalRecipients } from "@/lib/notifications/team-operational-recipients";';
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error("Multi-captain notification import anchor not found.");
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
  changed = true;
}

const marker = "      const additionalCaptainRecipients = await upsertAdditionalCaptainOperationalRecipients({";
if (!source.includes(marker)) {
  const closingAnchor = `      );\n    }\n  }\n\n  const kickoffChanged =`;
  if (!source.includes(closingAnchor)) {
    throw new Error("Multi-captain notification team-loop anchor not found.");
  }

  const addition = `      );\n\n      const additionalCaptainRecipients = await upsertAdditionalCaptainOperationalRecipients({\n        teamId,\n        excludeEmail: recipient.email,\n        excludePhone: recipient.phone,\n      });\n\n      for (const captainRecipient of additionalCaptainRecipients) {\n        recordOutcome(\n          team,\n          NotificationChannel.EMAIL,\n          await queueOnce({\n            recipientId: captainRecipient.id,\n            channel: NotificationChannel.EMAIL,\n            audience: NotificationAudience.TEAM,\n            subject: emailCopy.subject,\n            body: emailCopy.body,\n            sourceType,\n            sourceId,\n            metadata: { ...metadata, operationalCaptainCopy: true },\n            emailBranding: {\n              teamName: currentTeam.name,\n              teamLogoUrl: currentTeam.logoUrl,\n              leagueName: brandingLeague,\n            },\n            emailCta: { label: emailCopy.ctaLabel, url: dashboardUrl },\n            createdByUserId: input.createdByUserId,\n          }),\n        );\n\n        recordOutcome(\n          team,\n          NotificationChannel.SMS,\n          await queueOnce({\n            recipientId: captainRecipient.id,\n            channel: NotificationChannel.SMS,\n            audience: NotificationAudience.TEAM,\n            body: teamSmsCopy({\n              status: input.after.status,\n              homeTeamName: input.homeTeam.name,\n              awayTeamName: input.awayTeam.name,\n              after: input.after,\n              dashboardUrl,\n            }),\n            sourceType,\n            sourceId,\n            metadata: { ...metadata, operationalCaptainCopy: true },\n            createdByUserId: input.createdByUserId,\n          }),\n        );\n      }\n    }\n  }\n\n  const kickoffChanged =`;

  source = source.replace(closingAnchor, addition);
  changed = true;
}

if (!source.includes(importLine) || !source.includes(marker)) {
  throw new Error("Multi-captain operational notification patch did not apply completely.");
}

if (changed) {
  fs.writeFileSync(filePath, source, "utf8");
  console.log("Important Night Board fixture updates now fan out to all captains.");
} else {
  console.log("Multi-captain operational notifications already applied.");
}
