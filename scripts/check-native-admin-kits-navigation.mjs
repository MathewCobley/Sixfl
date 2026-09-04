import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sidebarPath = "src/components/admin/AdminSidebar.tsx";
const retiredBridgePath = "src/components/admin/AdminSidebarDesktopColumnsBridge.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const sidebar = read(sidebarPath);
const retiredBridge = read(retiredBridgePath);
const failures = [];

if (!sidebar.includes('name: "Kits"')) {
  failures.push("AdminSidebar must render the Kits label natively.");
}

const kitsHref = 'href: "/admin/kits"';
const kitsHrefCount = sidebar.split(kitsHref).length - 1;
if (kitsHrefCount !== 1) {
  failures.push(
    `AdminSidebar must contain exactly one native /admin/kits link; found ${kitsHrefCount}.`,
  );
}

if (!sidebar.includes('description: "Orders"')) {
  failures.push("AdminSidebar Kits navigation must retain the Orders description.");
}

if (
  !sidebar.includes('className="grid grid-cols-3 items-start gap-2"') ||
  !sidebar.includes("navigationColumns.map")
) {
  failures.push("AdminSidebar must own its three-column layout natively.");
}

if (!retiredBridge.includes("Retired compatibility shell") || !retiredBridge.includes("return null;")) {
  failures.push("AdminSidebarDesktopColumnsBridge must remain an inert retired compatibility shell.");
}

for (const forbidden of [
  "MutationObserver",
  "document.querySelector",
  "document.createElement",
  "injectKitsNavigation",
  "data-admin-kits-nav",
  "/admin/kits",
]) {
  if (retiredBridge.includes(forbidden)) {
    failures.push(`Retired admin sidebar bridge contains forbidden DOM/navigation marker: ${forbidden}.`);
  }
}

if (failures.length) {
  console.error("\nNATIVE ADMIN KITS NAVIGATION CONTRACT FAILED\n");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Native admin Kits navigation contract passed.");