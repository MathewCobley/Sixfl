import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const form = read("src/components/admin/email-templates/EmailTemplateForm.tsx");
const campaignActions = read("src/app/(admin)/admin/email-templates/actions.ts");
const systemActions = read("src/app/(admin)/admin/system-email-templates/actions.ts");

expect(
  form.includes("redirectTo?: string;") &&
    form.includes("window.location.replace(redirectTo);") &&
    form.includes('redirecting={Boolean(state?.redirectTo)}'),
  "A successful email-template create must complete with a dependable client navigation.",
);
expect(
  form.includes('redirecting\n        ? "Opening template..."') &&
    form.includes("const busy = pending || redirecting;") &&
    form.includes("disabled={busy}"),
  "The create button must remain protected from duplicate submissions while the new template opens.",
);
expect(
  campaignActions.includes('message: "Template created successfully. Opening it now..."') &&
    campaignActions.includes('redirectTo: `/admin/templates/${created.id}`') &&
    !campaignActions.includes('redirect(`/admin/templates/${created.id}`)'),
  "Campaign email creation must return a completed result instead of leaving useActionState pending on a thrown redirect.",
);
expect(
  systemActions.includes('message: "System email template created successfully. Opening it now..."') &&
    systemActions.includes('redirectTo: `/admin/templates/${created.id}`') &&
    !systemActions.includes('redirect(`/admin/templates/${created.id}`)'),
  "System email creation must return a completed result instead of leaving useActionState pending on a thrown redirect.",
);

if (failures.length) {
  console.error("\nEMAIL TEMPLATE CREATE COMPLETION CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Email template create completion contract passed.");
