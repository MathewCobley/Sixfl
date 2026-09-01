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
const loginPage = read("src/app/(public)/login/page.tsx");
const checkEmailPage = read("src/app/(public)/login/check-email/page.tsx");
const middleware = read("src/middleware.ts");
const activityService = read("src/lib/auth/sign-in-link-activity.ts");
const returnService = read("src/lib/auth/authenticated-return-visits.ts");
const returnTracker = read("src/components/auth/AuthenticatedReturnVisitTracker.tsx");
const providers = read("src/app/providers.tsx");
const returnRoute = read("src/app/api/auth/return-visit/route.ts");
const report = read("src/app/(admin)/admin/sign-in-activity/page.tsx");
const diagnosis = read("src/app/(admin)/admin/sign-in-activity/returning/page.tsx");
const signInLayout = read("src/app/(admin)/admin/sign-in-activity/layout.tsx");
const sidebar = read("src/components/admin/AdminSidebar.tsx");
const migration = read(
  "prisma/migrations/20260828233000_add_sign_in_link_activity/migration.sql",
);
const returnMigration = read(
  "prisma/migrations/20260830154000_add_authenticated_return_visits/migration.sql",
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
  auth,
  'const CANONICAL_SITE_URL = "https://sixfl.co.uk";',
  "Magic-link generation must use the apex SIXFL host.",
);
expect(
  auth,
  "const canonicalUrl = canonicaliseSIXFLUrl(url);",
  "NextAuth-generated magic links must be canonicalised before they are emailed.",
);
expect(
  auth,
  "magicLinkUrl: canonicalUrl,",
  "Sign-in diagnostics must record the same canonical URL that was emailed.",
);
expect(
  auth,
  "async redirect({ url, baseUrl }) {",
  "Post-login redirects must remain on the canonical SIXFL host.",
);

expect(
  loginPage,
  "useSession",
  "The login page must check whether this browser is already signed in.",
);
expect(
  loginPage,
  'status === "authenticated"',
  "An existing browser session must bypass the magic-link form.",
);
expect(
  loginPage,
  "You’re already signed in",
  "Logged-in users must be told they do not need another email link.",
);
expect(
  loginPage,
  "Open my SIXFL account",
  "Logged-in users must have a direct route to their existing dashboard.",
);
expect(
  loginPage,
  'signOut({ callbackUrl: "/login" })',
  "The login page must still allow an intentional account change.",
);
expect(
  checkEmailPage,
  "same normal browser",
  "The check-email page must explain that the same browser retains the session.",
);
expect(
  checkEmailPage,
  "Open in browser",
  "Users must be warned about email-app mini-browsers.",
);

expect(
  middleware,
  'const CANONICAL_HOST = "sixfl.co.uk";',
  "Browser traffic must have one canonical SIXFL host.",
);
expect(
  middleware,
  'const LEGACY_WWW_HOST = "www.sixfl.co.uk";',
  "The legacy www host must be recognised explicitly.",
);
expect(
  middleware,
  'request.method !== "GET" && request.method !== "HEAD"',
  "Canonical redirects must not interfere with POST webhooks or form submissions.",
);
expect(
  middleware,
  "NextResponse.redirect(url, 308)",
  "Legacy www visits must permanently preserve their path and query on the apex host.",
);
expect(
  middleware,
  'matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]',
  "The canonical-host safeguard must cover login, callback and dashboard routes.",
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
  'INTERVAL \'90 days\'',
  "The report must calculate a 90-day view for occasional repeat sign-ins.",
);
expect(
  report,
  "FREQUENT_LINK_THRESHOLD = 3",
  "Frequent sign-in link users must be flagged consistently.",
);
expect(
  report,
  "REPEAT_SUCCESSFUL_USE_THRESHOLD = 2",
  "Two successful magic-link sign-ins in 90 days must trigger the repeat-login diagnosis.",
);
expect(
  report,
  'AS "used90"',
  "The report must count successful magic-link uses over 90 days.",
);
expect(
  report,
  "view=repeat",
  "Admins must be able to filter specifically to repeat 90-day sign-ins.",
);
expect(
  report,
  "Repeat sign-ins · 90 days",
  "The slow recurring session-loss signal must be visible in the report.",
);
expect(
  report,
  'FROM "Session"',
  "The report must show currently valid sessions for diagnosis.",
);

expect(
  returnMigration,
  'CREATE TABLE IF NOT EXISTS "AuthenticatedReturnVisit"',
  "Authenticated returning visits must have durable storage.",
);
expect(
  returnService,
  "INTERVAL '20 minutes'",
  "A fresh magic-link login must not be misclassified as a returning session visit.",
);
expect(
  returnService,
  "INTERVAL '12 hours'",
  "Returning-session activity must be throttled to avoid recording page churn as separate visits.",
);
expect(
  returnTracker,
  'fetch("/api/auth/return-visit"',
  "The browser must report a restored authenticated session.",
);
expect(
  providers,
  "<AuthenticatedReturnVisitTracker />",
  "The global SessionProvider must activate returning-session tracking.",
);
expect(
  returnRoute,
  "recordAuthenticatedReturnVisit",
  "The return-visit endpoint must resolve the authenticated user server-side before recording.",
);
expect(
  diagnosis,
  "Session return diagnosis",
  "Admin must have a dedicated session-return diagnosis report.",
);
expect(
  diagnosis,
  'FROM "AuthenticatedReturnVisit"',
  "The diagnosis must compare actual existing-session returns with magic-link usage.",
);
expect(
  diagnosis,
  "Needs watching",
  "Repeat magic-link users without return-session evidence must be surfaced for review.",
);
expect(
  signInLayout,
  'href="/admin/sign-in-activity/returning"',
  "The session-return diagnosis must be discoverable from the sign-in activity report.",
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
