const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

source = source
  .replace(
    '  searchParams?: Promise<{ subscription?: string; credit?: string; amount?: string }>;',
    '  searchParams?: Promise<{ autopay?: string; subscription?: string; credit?: string; amount?: string }>;',
  )
  .replace(
    '  const subscriptionMessage = getSubscriptionMessage(sp.subscription);',
    '  const subscriptionMessage = getSubscriptionMessage(sp.autopay ?? sp.subscription);',
  )
  .replace(
    '      return "Automatic payment setup started. Stripe will confirm it here once the payment is complete.";',
    '      return "Saved card setup complete. SIXFL will only use it for one-off matchday team fees on the actual fixture day.";',
  )
  .replace(
    '      return "Automatic payment setup was cancelled.";',
    '      return "Saved card setup was cancelled. No automatic matchday card payment has been enabled.";',
  )
  .replace(
    '      return "Automatic payments are already active or being managed by Stripe.";',
    '      return "A saved Stripe payment method is already linked to this team.";',
  )
  .replace(
    '      return "Automatic payments are not configured yet. Ask an admin to add the Stripe subscription price ID.";',
    '      return "Saved-card matchday payments are not configured for this team yet.";',
  )
  .replace(
    '      return "Automatic payments can be set up once this team has a published upcoming match-fee fixture.";',
    '      return "A saved card can be set up once this team has a published upcoming match-fee fixture.";',
  )
  .replace('              Automatic payments', '              Saved card payments')
  .replace('              Recurring team payments', '              Saved card matchday payments')
  .replace(
    '              Set up a recurring Stripe payment for your team. Successful renewal payments will be recorded automatically in the SIXFL payment history.',
    '              Save a team card securely with Stripe. SIXFL only takes a one-off outstanding match fee on the actual fixture day. Player payments and team credit reduce that amount first, and postponed or cancelled fixtures are not charged.',
  )
  .replace(
    '                {formatSubscriptionStatus(subscription?.subscriptionStatus ?? null)}',
    '                {canOpenPortal ? "Stripe account linked" : "Not set up"}',
  )
  .replace(
    '                  getSubscriptionTone(subscription?.subscriptionStatus ?? null),',
    '                  canOpenPortal\n                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"\n                    : "border-white/10 bg-white/[0.05] text-white/60",',
  )
  .replace(
    '{subscriptionIsManaged ? "Replace automatic payment" : "Set up automatic payments"}',
    '{canOpenPortal ? "Replace saved card" : "Set up saved card"}',
  )
  .replace('                  Manage in Stripe', '                  Manage saved card');

if (
  !source.includes("Saved card matchday payments") ||
  !source.includes("sp.autopay ?? sp.subscription") ||
  source.includes("Recurring team payments") ||
  source.includes("Set up automatic payments")
) {
  throw new Error("Native saved-card payment copy was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Team payments now render saved-card wording natively; no payment copy is rewritten in the browser DOM.",
);
