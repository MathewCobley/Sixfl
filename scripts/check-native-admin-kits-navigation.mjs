import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sidebarPath = "src/components/admin/AdminSidebar.tsx";
const retiredBridgePath = "src/components/admin/AdminSidebarDesktopColumnsBridge.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const sidebar = read(sidebarPath);
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

if (fs.existsSync(path.join(root, retiredBridgePath))) {
  failures.push(
    "AdminSidebarDesktopColumnsBridge must stay retired; Kits navigation belongs in AdminSidebar.",
  );
}

if (failures.length) {
  console.error("\nNATIVE ADMIN KITS NAVIGATION CONTRACT FAILED\n");
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log("Native admin Kits navigation contract passed.");
