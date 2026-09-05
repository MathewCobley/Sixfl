from pathlib import Path
files = {}
def read(name):
    if name not in files:
        text = Path(name).read_text()
        snapshot = Path('.payment-order-review/native') / name
        if snapshot.exists():
            assert snapshot.read_text() == text, 'Source changed since review: ' + name
        files[name] = text
    return files[name]
def put(name, before, after, count=1):
    text = read(name)
    assert text.count(before) == count, f'{name}: expected {count} copies of {before[:100]!r}, found {text.count(before)}'
    files[name] = text.replace(before, after)
def imports(name, text):
    put(name, 'import { prisma } from "@/lib/prisma";', text + '\nimport { prisma } from "@/lib/prisma";')

captain = 'src/app/captain/team/[teamid]/payments/page.tsx'
imports(captain, 'import { TeamPaymentOrderNotice } from "@/components/payments/TeamPaymentOrderNotice";\nimport { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";')
put(captain, '  const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds);', '  const paymentOrder = await getTeamPaymentOrder(teamid, ledger);\n  const olderTeamBalancePence = paymentOrder.overdue.reduce((sum, entry) => sum + entry.outstandingPence, 0);\n  const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds);')
put(captain, '  let result: Awaited<ReturnType<typeof applyAvailableTeamCreditToCharge>>;', '  const order = await getTeamPaymentOrder(teamId, ledger);\n  if (!order.decision(chargeId).allowed) {\n    redirect(`/captain/team/${teamId}/payments?credit=oldest_first`);\n  }\n\n  let result: Awaited<ReturnType<typeof applyAvailableTeamCreditToCharge>>;')
put(captain, '    case "none":\n      return "No available team credit could be used against that charge.";', '    case "oldest_first":\n      return "Please clear the earlier team balance first. Unallocated team credit follows the same oldest-first order.";\n    case "none":\n      return "No available team credit could be used against that charge.";')
old_actions = '''              const canPayOnline =
                Boolean(entry.paymentToken) &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                entry.outstandingPence > 0;
              const canUseCredit =
                creditBalancePence > 0 &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                entry.outstandingPence > 0;'''
new_actions = '''              const paymentDecision = paymentOrder.decision(entry.chargeId);
              const creditAvailableForChargePence = paymentDecision.allowed
                ? Math.min(creditBalancePence, entry.outstandingPence) : 0;
              const payableAfterCreditPence = Math.max(entry.outstandingPence - creditAvailableForChargePence, 0);
              const canPayOnline = paymentDecision.allowed &&
                Boolean(entry.paymentToken) &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                payableAfterCreditPence > 0;
              const canUseCredit = paymentDecision.allowed &&
                creditAvailableForChargePence > 0 &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                entry.outstandingPence > 0;'''
put(captain, old_actions, new_actions)
put(captain, '                    <div className="flex flex-col gap-3 lg:items-end">', '                    <div className="flex flex-col gap-3 lg:items-end">\n                      <TeamPaymentOrderNotice decision={paymentDecision} />')
put(captain, '                        ) : entry.displayStatus !== "PAID" &&', '                        ) : paymentDecision.allowed && entry.displayStatus !== "PAID" &&')
put(captain, '    <div className="space-y-8">', '''    <div className="space-y-8">
      {paymentOrder.enabled ? (
        <section data-team-payment-order="oldest-first" className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
          <h2 className="font-semibold">{olderTeamBalancePence > 0 ? `Older team balance outstanding: ${formatMoney(olderTeamBalancePence)}` : "Team payments: oldest outstanding charge first"}</h2>
          <p className="mt-2">Direct team payments and unallocated team credit must clear the oldest eligible charge before a newer one. Paying this week's fixture through squad contributions does not clear an older team debt. Held charges remain owed unless separately waived.</p>
          <p className="mt-2">Individual squad payments and player money passed on by the captain remain attached to their original fixture. A newer saved-card matchday payment is paused while an earlier team balance blocks it; arrears are not added to an automatic debit.</p>
          {paymentOrder.next?.paymentToken ? <Link href={`/pay/charge/${paymentOrder.next.paymentToken}`} className="mt-3 inline-flex rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-black">Pay next outstanding {formatMoney(paymentOrder.next.outstandingPence)}</Link> : null}
        </section>
      ) : null}''')

public = 'src/app/pay/charge/[token]/page.tsx'
imports(public, 'import { TeamPaymentOrderNotice } from "@/components/payments/TeamPaymentOrderNotice";\nimport { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";')
put(public, 'export default async function PayChargePage({\n  params,', 'export default async function PayChargePage({\n  params,\n  searchParams,')
put(public, '  params: Promise<{ token: string }>;\n}) {', '  params: Promise<{ token: string }>;\n  searchParams?: Promise<{ pending?: string }>;\n}) {')
put(public, '  const { token } = await params;', '  const { token } = await params;\n  const paymentPending = (await searchParams)?.pending === "1";')
put(public, '      id: true,\n      title: true,', '      id: true,\n      teamId: true,\n      title: true,')
put(public, '''  const paidTotalPence = getChargePaidTotal(charge.transactions);
  const outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    paidTotalPence,
  );''', '''  const paymentOrder = await getTeamPaymentOrder(charge.teamId);
  const paymentDecision = paymentOrder.decision(charge.id);
  const ledgerEntry = paymentOrder.ledger.entries.find(entry => entry.chargeId === charge.id);
  const paidTotalPence = ledgerEntry ? Math.max(ledgerEntry.amountPence - ledgerEntry.outstandingPence, 0) : getChargePaidTotal(charge.transactions);
  const outstandingPence = ledgerEntry?.outstandingPence ?? getChargeOutstandingPence(charge.amountPence, paidTotalPence);''')
put(public, '  const canPay =\n    charge.status', '  const canPay = paymentDecision.allowed && !paymentPending &&\n    charge.status')
put(public, '                Paid {formatMoney(paidTotalPence)} of {formatMoney(charge.amountPence)}', '                Settled {formatMoney(paidTotalPence)} of {formatMoney(ledgerEntry?.amountPence ?? charge.amountPence)}')
put(public, '            {canPay ? (', '''            {paymentPending && outstandingPence > 0 ? (
              <p role="status" className="rounded-xl bg-amber-500/10 p-4 text-amber-100">Stripe has already completed a payment and SIXFL is waiting for its confirmation. Please refresh shortly rather than paying again.</p>
            ) : !paymentDecision.allowed && paymentDecision.code !== "SETTLED" ? (
              <TeamPaymentOrderNotice decision={paymentDecision} />
            ) : canPay ? (''')

checkout = 'src/app/pay/charge/[token]/start/route.ts'
imports(checkout, 'import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";\nimport { reusableTeamChargeCheckout } from "@/lib/payments/team-payment-order-checkouts";')
anchor = '''  if (!charge) {
    return NextResponse.redirect(new URL("/", `${getPublicSiteUrl()}/`), 303);
  }'''
put(checkout, anchor, anchor + '''

  const initialPaymentOrder = await getTeamPaymentOrder(charge.teamId);
  if (!initialPaymentOrder.decision(charge.id).allowed) {
    return NextResponse.redirect(new URL(`/pay/charge/${encodeURIComponent(token)}`, `${getPublicSiteUrl()}/`), 303);
  }''')
s = read(checkout)
a = s.index('  const canReuseExistingSession =')
b = s.index('  const session = await stripe.checkout.sessions.create({', a)
files[checkout] = s[:a] + '''  // Re-read the actual ledger after credit/player settlement and before using
  // a cached URL or opening Stripe. Old email links cannot bypass this guard.
  const finalPaymentOrder = await getTeamPaymentOrder(charge.teamId);
  const finalPaymentDecision = finalPaymentOrder.decision(charge.id);
  if (!finalPaymentDecision.allowed) {
    return NextResponse.redirect(new URL(`/pay/charge/${encodeURIComponent(token)}`, `${getPublicSiteUrl()}/`), 303);
  }
  const verifiedOutstandingPence = Math.min(outstandingPence,
    finalPaymentOrder.ledger.entries.find(entry => entry.chargeId === charge.id)?.outstandingPence ?? 0);
  if (verifiedOutstandingPence <= 0) {
    return NextResponse.redirect(new URL(`/pay/charge/${encodeURIComponent(token)}`, `${getPublicSiteUrl()}/`), 303);
  }
  const stripe = getStripeServerClient();
  const reusable = await reusableTeamChargeCheckout({
    sessionId: charge.lastStripeCheckoutSessionId,
    chargeId: charge.id, amountPence: verifiedOutstandingPence, stripe,
  });
  if (reusable.paymentPending) {
    return NextResponse.redirect(new URL(`/pay/charge/${encodeURIComponent(token)}?pending=1`, `${getPublicSiteUrl()}/`), 303);
  }
  if (reusable.url) return NextResponse.redirect(reusable.url, 303);

''' + s[b:]
put(checkout, 'unit_amount: outstandingPence,', 'unit_amount: verifiedOutstandingPence,')
put(checkout, 'lastStripeCheckoutAmountPence: outstandingPence,', 'lastStripeCheckoutAmountPence: verifiedOutstandingPence,')
put(checkout, '    metadata: {\n      chargeId:', '    metadata: {\n      type: "team_charge",\n      paymentOrderPolicy: "oldest-first-v1",\n      chargeId:')
put(checkout, '      metadata: {\n        chargeId:', '      metadata: {\n        type: "team_charge",\n        paymentOrderPolicy: "oldest-first-v1",\n        chargeId:')

autopay = 'src/lib/payments/team-autopay.ts'
imports(autopay, 'import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";\nimport { paymentOrderMessage } from "@/lib/payments/team-payment-order-policy";')
anchor = '''      await db.$executeRaw(Prisma.sql`
        UPDATE "Team"
        SET "autoPayLastAttemptAt" = NOW()'''
put(autopay, anchor, '''      // The saved-card mandate remains matchday-only and amount-capped. Do not
      // redirect a current-match debit onto historic arrears or increase it.
      const paymentOrder = await getTeamPaymentOrder(row.teamId);
      const paymentDecision = paymentOrder.decision(row.chargeId);
      if (!paymentDecision.allowed) {
        const message = `Saved-card payment paused. ${paymentOrderMessage(paymentDecision)}`;
        await db.$executeRaw(Prisma.sql`
          UPDATE "Team" SET "autoPayLastFailureAt" = NOW(), "autoPayLastFailureReason" = ${message}
          WHERE "id" = ${row.teamId}
        `);
        results.push({ chargeId: row.chargeId, teamId: row.teamId, status: "skipped", amountPence: 0, message });
        continue;
      }
      const collectionPence = Math.min(outstandingPence,
        paymentOrder.ledger.entries.find(entry => entry.chargeId === row.chargeId)?.outstandingPence ?? 0);
      if (collectionPence <= 0) {
        results.push({ chargeId: row.chargeId, teamId: row.teamId, status: "skipped", amountPence: 0, message: "Charge is already settled." });
        continue;
      }

''' + anchor)
put(autopay, '          amount: outstandingPence,', '          amount: collectionPence,')
put(autopay, 'await recordSuccessfulAutoPay({ row, amountPence: outstandingPence, paymentIntent, db });', 'await recordSuccessfulAutoPay({ row, amountPence: collectionPence, paymentIntent, db });')
put(autopay, '          amountPence: outstandingPence,', '          amountPence: collectionPence,', 2)

credits = 'src/lib/payments/team-credits.ts'
imports(credits, 'import { assertTeamChargePaymentOrder } from "@/lib/payments/team-payment-order";')
put(credits, '  return prisma.$transaction(async (tx) => {\n    const current =', '''  return prisma.$transaction(async (tx) => {
    for (const teamId of [...teamIds].sort()) {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`team-credit:${teamId}`}))::text`);
    }
    const current =''')
put(credits, '    const creditLedger = await getTeamCreditLedger(creditEligibleTeamIds, tx);', '    await assertTeamChargePaymentOrder(current.charge.id);\n    const creditLedger = await getTeamCreditLedger(creditEligibleTeamIds, tx);')

credit_policy = 'src/lib/payments/team-credit-policy.ts'
imports(credit_policy, 'import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";')
s = read(credit_policy)
a = s.index('  let amountUsedPence = 0;')
b = s.index('\n  return {\n    amountUsedPence,', a)
files[credit_policy] = s[:a] + '''  let amountUsedPence = 0;
  // This is unallocated team credit, not the players' fixture-specific money.
  // Apply it in due-date order, and report only credit applied to the caller's
  // fixture so squad collection calculations cannot attribute older settlement
  // to the current game.
  for (let step = 0; step < 20; step++) {
    const order = await getTeamPaymentOrder(input.teamId);
    const target = order.enabled ? order.next : order.ledger.entries.find(entry => entry.chargeId === input.chargeId);
    if (!target || target.outstandingPence <= 0) break;
    try {
      const result = await applyAvailableTeamCreditToCharge({
        chargeId: target.chargeId,
        teamIds: before.relatedTeamIds,
        description: target.chargeId === input.chargeId
          ? input.description?.trim() || `Existing team credit used against ${target.title}.`
          : `Unallocated team credit used against oldest outstanding charge: ${target.title}.`,
      });
      if (target.chargeId === input.chargeId) amountUsedPence += result.amountUsedPence;
      if (result.amountUsedPence <= 0 || result.remainingCreditPence <= 0 || target.chargeId === input.chargeId) break;
    } catch {
      // Fail closed: never jump over an ineligible/held charge and silently
      // consume the same credit against a newer fixture.
      break;
    }
  }
''' + s[b:]

collected_credit = 'src/app/captain/team/[teamid]/payments/use-credit-for-collected/route.ts'
imports(collected_credit, 'import { getTeamPaymentOrder, assertTeamChargePaymentOrder } from "@/lib/payments/team-payment-order";')
put(collected_credit, '  await ensureCaptainCollectedRemittanceTable();', '''  const paymentOrder = await getTeamPaymentOrder(teamid, ledger);
  if (!paymentOrder.decision(chargeId).allowed) {
    return NextResponse.redirect(paymentsUrl(teamid, { credit: "oldest_first" }), 303);
  }
  await ensureCaptainCollectedRemittanceTable();''')
put(collected_credit, '    const result = await prisma.$transaction(async (tx) => {', '''    const result = await prisma.$transaction(async (tx) => {
      for (const teamId of [...ledger.relatedTeamIds].sort()) {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`team-credit:${teamId}`}))::text`);
      }''')
put(collected_credit, '      const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds, tx);', '      await assertTeamChargePaymentOrder(charge.id);\n      const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds, tx);')

cron = 'src/app/api/cron/notifications/route.ts'
imports(cron, 'import { reconcileTeamPaymentOrderCheckouts } from "@/lib/payments/team-payment-order-checkouts";')
put(cron, '  const autoPayResults = await runCronStep(', '''  const teamPaymentOrderCheckouts = await runCronStep(
    "team-payment-order-checkouts", failures, reconcileTeamPaymentOrderCheckouts,
  );

  const autoPayResults = await runCronStep(''')
put(cron, '    generatedQueue,\n    matchdayAutoPay,', '    generatedQueue,\n    teamPaymentOrderCheckouts,\n    matchdayAutoPay,')

sidebar = 'src/components/admin/AdminSidebar.tsx'
put(sidebar, '        name: "Late fees",', '        name: "Payment order",\n        href: "/admin/payments/payment-order",\n        icon: CreditCardIcon,\n        description: "Priority/exceptions",\n      },\n      {\n        name: "Late fees",')

copy = 'scripts/apply-captain-team-credit-explanation.cjs'
put(copy, 'SIXFL uses team credit against the next fixture fee before taking another card payment.', 'SIXFL uses team credit against the oldest eligible outstanding team charge before taking another card payment.')
put(copy, 'Used against the next fixture before another payment is taken.', 'Used against the oldest eligible charge before another payment is taken.')

for name, text in files.items():
    Path(name).write_text(text)
    print('Updated native source:', name)
Path('/tmp/payment-order-changed-files.txt').write_text('\n'.join(files))
