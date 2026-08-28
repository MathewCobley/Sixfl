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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function expect(source, marker, message) {
  assert(source.includes(marker), message);
}

function expectOrder(source, markers, message) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker, previousIndex + 1);
    if (index === -1 || index <= previousIndex) {
      failures.push(message);
      return;
    }
    previousIndex = index;
  }
}

const auth = read("src/auth.ts");
const activityService = read("src/lib/auth/sign-in-link-activity.ts");
const report = read("src/app/(admin)/admin/sign-in-activity/page.tsx");
const sidebar = read("src/components/admin/AdminSidebar.tsx");
const migration = read(
  "prisma/migrations/20260828233000_add_sign_in_link_activity/migration.sql",
);

expect(
  migration,
  'CREATE TABLE IF NOT EXISTS "SignInLinkActivity"',
  "A durable sign-in link activity table must be deployed.",
);
expect(
  migration,
  '"emailNormalized" TEXT NOT NULL',
  "Sign-in activity must be attributable by normalized email.",
);
expect(
  migration,
  '"usedAt" TIMESTAMP(3)',
  "Successful magic-link use must be distinguishable from email sends.",
);

expect(
  activityService,
  "readMagicLinkContext",
  "The activity service must strip the magic link down to safe diagnostic context.",
);
expect(
  activityService,
  'parsed.searchParams.get("callbackUrl")',
  "The report must retain the destination without persisting the sign-in token.",
);
expect(
  activityService,
  "markLatestSignInLinkUsed",
  "Successful sign-ins must mark the latest outstanding link as used.",
);
assert(
  activityService.includes('"callbackUrl"') &&
    !activityService.includes('"token" TEXT'),
  "The tracking table must not store the magic-link security token.",
);

expectOrder(
  auth,
  [
    "const activityId = await startSignInLinkActivity({",
    "const result = await resend.emails.send({",
    "await markSignInLinkSent({",
  ],
  "Each permitted sign-in email must be recorded before send and marked sent after provider acceptance.",
);
expect(
  auth,
  "await markSignInLinkFailed({ activityId, error });",
  "Failed sign-in email sends must be recorded.",
);
expect(
  auth,
  "markLatestSignInLinkUsed({",
  "A successful email sign-in must update its activity record.",
);

expect(
  report,
  "Sign-in activity",
  "Admin must have a visible sign-in activity report.",
);
expect(
  report,
  'INTERVAL \'30 days\'',
  "The report must calculate the requested 30-day usage view.",
);
expect(
  report,
  "FREQUENT_LINK_THRESHOLD = 3",
  "Frequent sign-in link users must be flagged consistently.",
);
expect(
  report,
  'FROM "Session"',
  "The report must show currently valid sessions for diagnosis.",
);
expect(
  sidebar,
  'href: "/admin/sign-in-activity"',
  "The report must remain accessible under Back end functions.",
);

if (failures.length) {
  console.error("\nSIGN-IN LINK ACTIVITY CONTRACT FAILED\n");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Sign-in link activity contract passed.");
