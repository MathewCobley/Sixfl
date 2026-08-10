const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/payments/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain team payments.`);
  }
  source = source.replace(before, after);
}

if (!source.includes('from "@/lib/payments/team-autopay-snapshot"')) {
  replaceRequired(
    'import { getTeamSubscriptionSnapshot } from "@/lib/payments/team-subscriptions";',
    'import { getTeamSubscriptionSnapshot } from "@/lib/payments/team-subscriptions";\nimport {\n  getTeamAutoPaySnapshot,\n  reconcileTeamAutoPaySetup,\n} from "@/lib/payments/team-autopay-snapshot";',
    "saved-card snapshot import",
  );
}

if (!source.includes("autopay?: string")) {
  source = source.replace(
    /searchParams\?: Promise<\{([^}]*)\}>;/,
    (match, fields) => `searchParams?: Promise<{ autopay?: string;${fields} }>;`,
  );
}

if (!source.includes("await reconcileTeamAutoPaySetup(teamid)")) {
  replaceRequired(
    '  const sp = (await searchParams) ?? {};\n  await requireCaptain(teamid);',
    '  const sp = (await searchParams) ?? {};\n  await requireCaptain(teamid);\n\n  if (sp.autopay === "success") {\n    await reconcileTeamAutoPaySetup(teamid);\n  }',
    "saved-card return reconciliation",
  );
}

if (!source.includes("const [team, subscription, autoPay, ledger]")) {
  replaceRequired(
    '  const [team, subscription, ledger] = await Promise.all([',
    '  const [team, subscription, autoPay, ledger] = await Promise.all([',
    "saved-card snapshot promise tuple",
  );
  replaceRequired(
    '    getTeamSubscriptionSnapshot(teamid),\n    getTeamPaymentLedger(teamid),',
    '    getTeamSubscriptionSnapshot(teamid),\n    getTeamAutoPaySnapshot(teamid),\n    getTeamPaymentLedger(teamid),',
    "saved-card snapshot load",
  );
}

source = source
  .replace(
    '      return "Automatic payment setup started. Stripe will confirm it here once the payment is complete.";',
    '      return "Saved card setup returned from Stripe.";',
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
  );

const oldPageState = [
  '  const subscriptionMessage = getSubscriptionMessage(sp.autopay ?? sp.subscription);',
  '  const creditMessage = getCreditMessage(sp.credit, sp.amount);',
  '  const canOpenPortal = Boolean(subscription?.stripeCustomerId);',
  '  const subscriptionIsManaged = isManagedByStripe(subscription?.subscriptionStatus ?? null);',
].join("\n");
const legacyPageState = [
  '  const subscriptionMessage = getSubscriptionMessage(sp.subscription);',
  '  const creditMessage = getCreditMessage(sp.credit, sp.amount);',
  '  const canOpenPortal = Boolean(subscription?.stripeCustomerId);',
  '  const subscriptionIsManaged = isManagedByStripe(subscription?.subscriptionStatus ?? null);',
].join("\n");
const newPageState = [
  '  const hasSavedCard = Boolean(',
  '    autoPay?.autoPayEnabled && autoPay.stripeDefaultPaymentMethodId,',
  '  );',
  '  const hasStripeCustomer = Boolean(autoPay?.stripeCustomerId);',
  '  const subscriptionMessage =',
  '    sp.autopay === "success"',
  '      ? hasSavedCard',
  '        ? "Saved card setup complete. Your card is ready for matchday team payments."',
  '        : "Stripe returned you to SIXFL, but a saved card has not been confirmed yet. Use Continue saved card setup below to finish."',
  '      : getSubscriptionMessage(sp.autopay ?? sp.subscription);',
  '  const creditMessage = getCreditMessage(sp.credit, sp.amount);',
  '  const canOpenPortal = hasSavedCard;',
].join("\n");

if (!source.includes("const hasSavedCard = Boolean(")) {
  if (source.includes(oldPageState)) {
    source = source.replace(oldPageState, newPageState);
  } else if (source.includes(legacyPageState)) {
    source = source.replace(legacyPageState, newPageState);
  } else {
    throw new Error("Expected saved-card page state was not found in captain team payments.");
  }
}

source = source
  .replace(
    '                {formatSubscriptionStatus(subscription?.subscriptionStatus ?? null)}',
    '                {hasSavedCard ? "Saved card ready" : hasStripeCustomer ? "Card setup incomplete" : "Not set up"}',
  )
  .replace(
    '                  getSubscriptionTone(subscription?.subscriptionStatus ?? null),',
    '                  hasSavedCard\n                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"\n                    : hasStripeCustomer\n                      ? "border-amber-400/25 bg-amber-500/10 text-amber-100"\n                      : "border-white/10 bg-white/[0.05] text-white/60",',
  )
  .replace(
    '                {canOpenPortal ? "Stripe account linked" : "Not set up"}',
    '                {hasSavedCard ? "Saved card ready" : hasStripeCustomer ? "Card setup incomplete" : "Not set up"}',
  )
  .replace(
    '                  canOpenPortal\n                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"\n                    : "border-white/10 bg-white/[0.05] text-white/60",',
    '                  hasSavedCard\n                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"\n                    : hasStripeCustomer\n                      ? "border-amber-400/25 bg-amber-500/10 text-amber-100"\n                      : "border-white/10 bg-white/[0.05] text-white/60",',
  )
  .replace(
    '{subscriptionIsManaged ? "Replace automatic payment" : "Set up automatic payments"}',
    '{hasSavedCard ? "Replace saved card" : hasStripeCustomer ? "Continue saved card setup" : "Set up saved card"}',
  )
  .replace(
    '{canOpenPortal ? "Replace saved card" : "Set up saved card"}',
    '{hasSavedCard ? "Replace saved card" : hasStripeCustomer ? "Continue saved card setup" : "Set up saved card"}',
  )
  .replace('                  Manage in Stripe', '                  Manage saved card');

if (!source.includes("Card setup incomplete")) {
  const statusBlockMarker = '            <div className="mt-4 flex flex-wrap gap-2">';
  const statusNotice = [
    '            {hasStripeCustomer && !hasSavedCard ? (',
    '              <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">',
    '                Stripe has created the team payment account, but no card is saved yet. Continue the saved-card setup to enter and confirm the card details.',
    '              </div>',
    '            ) : null}',
    '',
    statusBlockMarker,
  ].join("\n");
  replaceRequired(statusBlockMarker, statusNotice, "saved-card incomplete setup notice");
}

// A Stripe customer on its own is not a saved card. The management portal is
// only useful after a payment method has actually been stored and autopay is enabled.
source = source.replace(
  '            {canOpenPortal ? (',
  '            {hasSavedCard ? (',
);

if (
  !source.includes("Saved card matchday payments") ||
  !source.includes("autopay?: string") ||
  !source.includes("reconcileTeamAutoPaySetup(teamid)") ||
  !source.includes("getTeamAutoPaySnapshot(teamid)") ||
  !source.includes("Card setup incomplete") ||
  !source.includes("Continue saved card setup") ||
  !source.includes('const canOpenPortal = hasSavedCard;') ||
  source.includes('canOpenPortal ? "Stripe account linked"') ||
  source.includes("Set up automatic payments")
) {
  throw new Error("Native saved-card payment state was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Team payments now distinguish a Stripe customer from a completed saved-card setup and reconcile Stripe setup on return.",
);
