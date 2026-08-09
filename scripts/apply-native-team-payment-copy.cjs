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

replaceRequired(
  'import { getTeamSubscriptionSnapshot } from "@/lib/payments/team-subscriptions";',
  'import { getTeamAutoPaySnapshot } from "@/lib/payments/team-autopay-snapshot";',
  "saved-card snapshot import",
);

if (source.includes("function formatSubscriptionStatus(")) {
  source = source.replace(
    /function formatSubscriptionStatus\([\s\S]*?\n}\n\nfunction formatUkDate/,
    [
      'function formatAutoPayStatus(autoPay: Awaited<ReturnType<typeof getTeamAutoPaySnapshot>>) {',
      '  if (autoPay?.autoPayEnabled && autoPay.stripeDefaultPaymentMethodId) return "Saved card ready";',
      '  if (autoPay?.stripeCustomerId) return "Setup incomplete";',
      '  return "Not set up";',
      '}',
      '',
      'function getAutoPayTone(autoPay: Awaited<ReturnType<typeof getTeamAutoPaySnapshot>>) {',
      '  if (autoPay?.autoPayEnabled && autoPay.stripeDefaultPaymentMethodId) {',
      '    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";',
      '  }',
      '  if (autoPay?.stripeCustomerId) {',
      '    return "border-amber-400/25 bg-amber-500/10 text-amber-100";',
      '  }',
      '  return "border-white/10 bg-white/[0.05] text-white/60";',
      '}',
      '',
      'function formatUkDate',
    ].join("\n"),
  );
}

if (source.includes("function getSubscriptionMessage(")) {
  source = source.replace(
    /function getSubscriptionMessage\([\s\S]*?\n}\n\nfunction getCreditMessage/,
    [
      'function getAutoPayMessage(state?: string) {',
      '  switch (state) {',
      '    case "success":',
      '      return "Saved card setup complete. SIXFL will only use it for one-off matchday team fees on the actual fixture day.";',
      '    case "cancelled":',
      '      return "Saved card setup was cancelled. No automatic matchday card payment has been enabled.";',
      '    case "missing_team":',
      '      return "Saved card setup could not start because this team could not be found.";',
      '    case "missing_customer":',
      '      return "A Stripe customer has not been created for this team yet.";',
      '    default:',
      '      return null;',
      '  }',
      '}',
      '',
      'function getCreditMessage',
    ].join("\n"),
  );
}

replaceRequired(
  '  searchParams?: Promise<{ subscription?: string; credit?: string; amount?: string }>;',
  '  searchParams?: Promise<{ autopay?: string; subscription?: string; credit?: string; amount?: string }>;',
  "saved-card search params",
);

replaceRequired(
  [
    '  const [team, subscription, ledger] = await Promise.all([',
    '    prisma.team.findUnique({',
    '      where: { id: teamid },',
    '      select: { id: true, name: true, teamMode: true },',
    '    }),',
    '    getTeamSubscriptionSnapshot(teamid),',
    '    getTeamPaymentLedger(teamid),',
    '  ]);',
  ].join("\n"),
  [
    '  const [team, autoPay, ledger] = await Promise.all([',
    '    prisma.team.findUnique({',
    '      where: { id: teamid },',
    '      select: { id: true, name: true, teamMode: true },',
    '    }),',
    '    getTeamAutoPaySnapshot(teamid),',
    '    getTeamPaymentLedger(teamid),',
    '  ]);',
  ].join("\n"),
  "saved-card snapshot load",
);

replaceRequired(
  [
    '  const subscriptionMessage = getSubscriptionMessage(sp.subscription);',
    '  const creditMessage = getCreditMessage(sp.credit, sp.amount);',
    '  const canOpenPortal = Boolean(subscription?.stripeCustomerId);',
    '  const subscriptionIsManaged = isManagedByStripe(subscription?.subscriptionStatus ?? null);',
  ].join("\n"),
  [
    '  const autoPayMessage = getAutoPayMessage(sp.autopay ?? sp.subscription);',
    '  const creditMessage = getCreditMessage(sp.credit, sp.amount);',
    '  const canOpenPortal = Boolean(autoPay?.stripeCustomerId);',
    '  const hasSavedCard = Boolean(',
    '    autoPay?.autoPayEnabled && autoPay.stripeDefaultPaymentMethodId,',
    '  );',
  ].join("\n"),
  "saved-card page state",
);

replaceRequired(
  [
    '      {subscriptionMessage ? (',
    '        <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm text-white/70">',
    '          {subscriptionMessage}',
    '        </div>',
    '      ) : null}',
  ].join("\n"),
  [
    '      {autoPayMessage ? (',
    '        <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm text-white/70">',
    '          {autoPayMessage}',
    '        </div>',
    '      ) : null}',
  ].join("\n"),
  "saved-card feedback message",
);

source = source
  .replace('              Automatic payments', '              Saved card payments')
  .replace('              Recurring team payments', '              Saved card matchday payments')
  .replace(
    '              Set up a recurring Stripe payment for your team. Successful renewal payments will be recorded automatically in the SIXFL payment history.',
    '              Save a team card securely with Stripe. SIXFL will only take a one-off outstanding match fee on the actual fixture day. Player payments and team credit reduce that amount first, and postponed or cancelled fixtures are not charged.',
  )
  .replace(
    '                  getSubscriptionTone(subscription?.subscriptionStatus ?? null),',
    '                  getAutoPayTone(autoPay),',
  )
  .replace(
    '                {formatSubscriptionStatus(subscription?.subscriptionStatus ?? null)}',
    '                {formatAutoPayStatus(autoPay)}',
  )
  .replace(
    '{subscriptionIsManaged ? "Replace automatic payment" : "Set up automatic payments"}',
    '{hasSavedCard ? "Replace saved card" : "Set up saved card"}',
  )
  .replace('                  Manage in Stripe', '                  Manage saved card');

const legacyStatusBlocks = /\n\s*\{subscription\?\.subscriptionCurrentPeriodEnd \? \([\s\S]*?\) : null\}\n\n\s*\{subscription\?\.subscriptionLastPaymentAt \? \([\s\S]*?\) : null\}\n\n\s*\{subscription\?\.subscriptionLastPaymentFailedAt \? \([\s\S]*?\) : null\}/;
if (legacyStatusBlocks.test(source)) {
  source = source.replace(
    legacyStatusBlocks,
    [
      '',
      '              {autoPay?.autoPayMandateAcceptedAt ? (',
      '                <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">',
      '                  Saved {formatUkDate(autoPay.autoPayMandateAcceptedAt)}',
      '                </span>',
      '              ) : null}',
      '',
      '              {autoPay?.autoPayLastAttemptAt ? (',
      '                <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">',
      '                  Last matchday attempt {formatUkDate(autoPay.autoPayLastAttemptAt)}',
      '                </span>',
      '              ) : null}',
      '',
      '              {autoPay?.autoPayLastFailureAt ? (',
      '                <span className="inline-flex rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100">',
      '                  Last failed {formatUkDate(autoPay.autoPayLastFailureAt)}',
      '                </span>',
      '              ) : null}',
    ].join("\n"),
  );
}

if (
  !source.includes("Saved card matchday payments") ||
  !source.includes("getTeamAutoPaySnapshot(teamid)") ||
  !source.includes("getAutoPayStatus") && !source.includes("formatAutoPayStatus") ||
  source.includes("Recurring team payments") ||
  source.includes("subscription?.subscriptionCurrentPeriodEnd") ||
  source.includes("subscriptionIsManaged")
) {
  throw new Error("Native saved-card team payment presentation was not applied correctly.");
}

fs.writeFileSync(pagePath, source, "utf8");
console.log(
  "Team payments now render saved-card matchday wording and status natively in React without a DOM copy bridge.",
);
