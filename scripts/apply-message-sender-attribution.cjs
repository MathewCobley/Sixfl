// Compatibility entry point: attribution now lives in the owning native sources.
// Keep this read-only until the legacy prebuild invocation is removed.
const fs = require("node:fs");
for (const file of ["src/lib/messaging/service.ts", "src/app/(admin)/admin/messaging/page.tsx", "src/components/admin/messages/AdminMessagesInbox.tsx", "src/components/admin/messages/AdminMessageThread.tsx"]) {
  if (!fs.readFileSync(file, "utf8").includes("createdByUser")) throw new Error("Native message attribution missing: " + file);
}
console.log("Native message sender attribution verified (no source rewriting).");
