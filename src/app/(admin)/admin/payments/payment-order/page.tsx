import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamPaymentOrder } from "@/lib/payments/team-payment-order";
import { formatPaymentMoney, formatPaymentFixtureDate } from "@/lib/payments/team-payment-ledger";
import { paymentOrderDate, paymentOrderMessage } from "@/lib/payments/team-payment-order-policy";
import { savePaymentOrderException, runPaymentOrderCheckoutCleanup } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team payment order | SIXFL Admin" };

export default async function PaymentOrderPage({ searchParams }: {
  searchParams?: Promise<{ q?: string; teamId?: string; saved?: string; checked?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams ?? {};
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const teams = await prisma.team.findMany({
    where: { teamMode: "STANDARD", ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
    select: { id: true, name: true }, orderBy: { name: "asc" }, take: 50,
  });
  const team = sp.teamId ? await prisma.team.findUnique({
    where: { id: sp.teamId }, select: { id: true, name: true, teamMode: true },
  }) : null;
  const order = team ? await getTeamPaymentOrder(team.id) : null;
  const audit = order ? await prisma.$queryRaw<Array<{
    id: bigint; chargeId: string; action: string; reason: string; createdByLabel: string; createdAt: Date; expiresAt: Date | null;
  }>>(Prisma.sql`
    SELECT "id", "chargeId", "action", "reason", "createdByLabel", "createdAt", "expiresAt"
    FROM "TeamPaymentOrderException" WHERE "teamId" IN (${Prisma.join(order.ledger.relatedTeamIds)})
    ORDER BY "id" DESC LIMIT 50
  `) : [];
  const [maintenance] = await prisma.$queryRaw<Array<{ lastCheckedAt: Date | null; lastFailure: string | null; cursor: string | null }>>(Prisma.sql`
    SELECT "lastCheckedAt", "lastFailure", "cursor" FROM "TeamPaymentOrderMaintenance" WHERE "id" = 'open-checkouts'
  `);
  const checkoutAudit = order ? await prisma.$queryRaw<Array<{
    checkoutSessionId: string; event: string; chargeId: string; createdAt: Date;
  }>>(Prisma.sql`
    SELECT "checkoutSessionId", "event", "chargeId", "createdAt" FROM "TeamPaymentOrderCheckoutAudit"
    WHERE "teamId" IN (${Prisma.join(order.ledger.relatedTeamIds)}) ORDER BY "createdAt" DESC LIMIT 30
  `) : [];
  const field = "rounded-xl border border-white/15 bg-black px-3 py-2 text-sm text-white";
  const button = "rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black";
  return (
    <main className="space-y-6 text-white">
      <header className="space-y-2">
        <Link href="/admin/payments" className="text-sm text-emerald-300">Back to Payments</Link>
        <h1 className="text-3xl font-semibold">Team payment order</h1>
        <p className="max-w-3xl text-sm leading-6 text-white/65">Direct team payments clear the oldest outstanding charge first. Genuine squad payments remain fixture-specific. A temporary hold pauses direct collection of that charge and lets newer charges proceed. An exception permits only the selected charge to be paid out of order. Neither changes an amount, waives debt or reallocates an existing payment.</p>
      </header>
      {sp.saved ? <p role="status" className="rounded-xl bg-emerald-500/10 p-4 text-emerald-100">Exception recorded. Normal oldest-first ordering resumes automatically when it expires or is reset.</p> : null}
      <section className="rounded-2xl border border-white/10 p-5 text-sm">
        <h2 className="font-semibold">Previously opened checkout protection</h2>
        <p className="mt-2 text-white/65">Last successful page of checks: {maintenance?.lastCheckedAt ? formatPaymentFixtureDate(maintenance.lastCheckedAt) : "Not yet checked"}. {maintenance?.cursor ? "More open sessions are scheduled for the next run." : "The last pass has no remaining page."}</p>
        {maintenance?.lastFailure ? <p role="alert" className="mt-2 text-amber-200">{maintenance.lastFailure}</p> : null}
        <p className="mt-2 text-white/65">The notifications cron checks a bounded page every run. Only conflicting open direct-team checkouts are closed; player, captain-remittance and kit checkouts are excluded. A payment already completing is retained against its original charge.</p>
        <form action={runPaymentOrderCheckoutCleanup} className="mt-3"><button className={button}>Check next page now</button></form>
      </section>
      <form className="flex flex-wrap gap-3" method="get"><input name="q" defaultValue={q} placeholder="Find a standard team" aria-label="Team name" className={field}/><button className={button}>Search</button></form>
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">{teams.map(item => <Link key={item.id} href={`/admin/payments/payment-order?teamId=${encodeURIComponent(item.id)}`} className={`${field} ${team?.id === item.id ? "ring-2 ring-emerald-400" : ""}`}>{item.name}</Link>)}</div>
      {team && order ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">{team.name}</h2>
          <p className="text-sm text-white/65">{order.enabled ? `Older outstanding team balance: ${formatPaymentMoney(order.overdue.reduce((sum, item) => sum + item.outstandingPence, 0))}` : "Managed squad payments are exempt from standard-team payment ordering."}</p>
          {order.ledger.entries.filter(entry => entry.outstandingPence > 0 && entry.displayStatus !== "VOID").map(entry => {
            const decision = order.decision(entry.chargeId);
            const exception = order.exceptions.get(entry.chargeId);
            return <article key={entry.chargeId} className="rounded-2xl border border-white/10 p-5">
              <h3 className="font-semibold">{entry.title} · {formatPaymentMoney(entry.outstandingPence)} outstanding</h3>
              <p className="mt-1 text-sm text-white/60">Due {formatPaymentFixtureDate(paymentOrderDate(entry))}</p>
              <p className="mt-2 text-sm text-amber-100">{decision.allowed ? (decision.code === "OVERRIDE" ? "Payment permitted by admin exception." : "Direct payment permitted.") : paymentOrderMessage(decision)}</p>
              {exception ? <p className="mt-2 text-sm text-white/70">Active {exception.action.replaceAll("_", " ").toLowerCase()}: {exception.reason} · expires {exception.expiresAt ? formatPaymentFixtureDate(exception.expiresAt) : "—"}</p> : null}
              {order.enabled && decision.code !== "EXEMPT" && decision.code !== "UNAVAILABLE" ? <form action={savePaymentOrderException} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="chargeId" value={entry.chargeId}/>
                <label className="flex flex-col gap-1 text-xs">Action<select name="action" className={field}><option value="HOLD">Put this charge on hold</option><option value="ALLOW_PAYMENT">Allow this charge out of order</option><option value="RESET">Restore normal ordering</option></select></label>
                <label className="flex flex-col gap-1 text-xs">Expires in<select name="days" defaultValue="7" className={field}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
                <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs">Reason<input name="reason" required minLength={5} maxLength={1000} className={field}/></label>
                <button className={button}>Record exception</button>
              </form> : null}
            </article>;
          })}
          <h2 className="pt-4 text-xl font-semibold">Exception history</h2>
          {audit.length ? audit.map(item => <article key={String(item.id)} className="rounded-xl border border-white/10 p-4 text-sm"><p className="font-semibold">{order.ledger.entries.find(entry => entry.chargeId === item.chargeId)?.title ?? item.chargeId} · {item.action.replaceAll("_", " ")}</p><p className="mt-1">{item.reason}</p><p className="mt-1 text-white/55">{item.createdByLabel} · {formatPaymentFixtureDate(item.createdAt)}{item.expiresAt ? ` · expires ${formatPaymentFixtureDate(item.expiresAt)}` : ""}</p></article>) : <p className="text-sm text-white/55">No exceptions recorded.</p>}
          <h2 className="pt-4 text-xl font-semibold">Checkout protection history</h2>
          {checkoutAudit.length ? checkoutAudit.map(item => <p key={`${item.checkoutSessionId}:${item.event}`} className="rounded-xl border border-white/10 p-3 text-sm">{formatPaymentFixtureDate(item.createdAt)} · {item.event === "EXPIRED" ? "Conflicting open checkout closed" : "Payment completed during cleanup; original allocation retained"} · {order.ledger.entries.find(entry => entry.chargeId === item.chargeId)?.title ?? item.chargeId}</p>) : <p className="text-sm text-white/55">No checkout exceptions recorded for this team.</p>}
        </section>
      ) : null}
    </main>
  );
}
