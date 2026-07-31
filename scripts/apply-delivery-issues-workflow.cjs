const fs = require("node:fs");
const path = require("node:path");

function patchFile(filePath, replacements, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`${label} patch skipped: file not found.`);
    return;
  }

  let source = fs.readFileSync(filePath, "utf8");
  let changed = false;

  for (const [before, after] of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      console.warn(`${label} patch pattern not found.`);
      continue;
    }
    source = source.replace(before, after);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
    console.log(`Applied ${label} patch.`);
  } else {
    console.log(`${label} patch already applied or source changed.`);
  }
}

const webhookPath = path.join(process.cwd(), "src", "lib", "notifications", "webhooks.ts");
patchFile(
  webhookPath,
  [[
`    case "email.bounced":
      return {
        attemptStatus: NotificationAttemptStatus.FAILED,
        providerStatus: "BOUNCED",
        resultStatus: "failed",
        dispatchStatus: NotificationDispatchStatus.FAILED,
        isFailure: true,
        suppressRecipient: false,
      };`,
`    case "email.bounced":
      return {
        attemptStatus: NotificationAttemptStatus.FAILED,
        providerStatus: "BOUNCED",
        resultStatus: "failed",
        dispatchStatus: NotificationDispatchStatus.FAILED,
        isFailure: true,
        // A hard bounce means the address should not be retried until an admin
        // or captain has corrected and verified it.
        suppressRecipient: true,
      };`,
  ]],
  "hard-bounce suppression",
);

const sidebarPath = path.join(process.cwd(), "src", "components", "admin", "AdminSidebar.tsx");
patchFile(
  sidebarPath,
  [[
`      {
        name: "Queue",
        href: "/admin/queue",
        icon: Cog6ToothIcon,
        description: "Dispatches",
      },`,
`      {
        name: "Queue",
        href: "/admin/queue",
        icon: Cog6ToothIcon,
        description: "Dispatches",
      },
      {
        name: "Delivery issues",
        href: "/admin/delivery-issues",
        icon: ExclamationTriangleIcon,
        description: "Bounces",
      },`,
  ]],
  "delivery issues navigation",
);
