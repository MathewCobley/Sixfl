import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { createPlayerRepaymentPlan, getPlayerLedgerAccount, getPlayerLedgerSummaryForUser, adjustPlayerLedgerBalance, changePlayerRepaymentPlan, pausePlayerFeeCollection, playerFeeCollectionHold, parseLedgerMoney, repaymentAmount, PlayerLedgerError } from "../src/lib/payments/player-ledger";
import { startPlayerRepaymentCheckout, settlePlayerRepaymentSession, cancelPlayerRepaymentCheckout, handlePlayerRepaymentExpiry, handlePlayerRepaymentRefund, getPlayerRepaymentTarget, allocationsOf } from "../src/lib/payments/player-repayment-checkout";
import { runPlayerRepaymentReminderJob, playerRepaymentReminderDeliveryBlock } from "../src/lib/payments/player-repayment-reminders";
import { getTeamPaymentLedger } from "../src/lib/payments/team-payment-ledger";
import { getTeamCreditLedger } from "../src/lib/payments/team-credits";
import { getCaptainCollectedRemittanceSnapshots } from "../src/lib/payments/captain-collected-remittance";
import { getPlayerFeeCashReceivedPence, getPlayerFeeSubsidyPence } from "../src/lib/payments/player-fee-coverage";
import { summariseChargesWithPlayerMatchFees } from "../src/lib/payments/charge-summary";
import PlayerRepaymentPanel from "../src/components/payments/PlayerRepaymentPanel";
import { renderToStaticMarkup } from "react-dom/server";
import { getPlayerPaymentDisplay } from "../src/lib/payments/player-payment-display";
import { getChargeStatusFromAmounts } from "../src/lib/payments/charge-status";
import { POST as stripeWebhook } from "../src/app/api/stripe/webhook/route";
import { getStripeServerClient } from "../src/lib/stripe/client";

const database=new URL(process.env.DATABASE_URL||"http://invalid");
assert.ok(process.env.SIXFL_PLAYER_LEDGER_TEST==="1"&&database.hostname==="127.0.0.1"&&database.pathname==="/sixfl_player_ledger_test","Disposable local database only");
globalThis.fetch=async()=>{throw Error("External provider/network calls are forbidden in ledger tests");};
const migration="prisma/migrations/20260908140000_player_ledger_and_repayments/migration.sql";
const migrate=(path:string)=>execFileSync("psql",[process.env.DATABASE_URL!,"-v","ON_ERROR_STOP=1","-f",path],{stdio:"pipe"});
function signedTestHeader(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}
const past=()=>new Date(Date.now()-3600_000);
let legacyId:string;
before(async()=>{
  for(const name of ["20260424162000_add_team_member_profile","20260702162500_add_team_credit_pot","20260709210000_team_credit_ledger","20260804230000_add_private_player_codes_and_temporary_match_fees","20260809002500_captain_collected_remittance_checkout","20260810183500_add_fixture_context_to_team_credit_overpayments","20260813004500_standard_credit_conversion_boundary","20260825231500_player_fee_assigned_share"])migrate(`prisma/migrations/${name}/migration.sql`);
  const old=await target(800);legacyId=old.fee.id;
  migrate(migration);
  migrate("prisma/migrations/20260909001000_player_receipt_amount_integrity/migration.sql");
});
after(async()=>{await prisma.$disconnect();});
async function target(amountPence=1200,mode:"STANDARD"|"MANAGED"="STANDARD"){
  const id=randomUUID();
  const league=await prisma.league.create({data:{name:`Ledger test ${id}`,slug:id,season:"Test"}});
  const team=await prisma.team.create({data:{name:`Ledger ${id}`,claimCode:id,leagueId:league.id,teamMode:mode,standardMatchFeePence:4000}});
  const opponent=await prisma.team.create({data:{name:`Opponent ${id}`,claimCode:`${id}-opp`,leagueId:league.id}});
  const user=await prisma.user.create({data:{name:"Test Player",email:`${id}@example.invalid`}});
  const member=await prisma.teamMember.create({data:{teamId:team.id,userId:user.id,role:"PLAYER"}});
  const fixture=await prisma.fixture.create({data:{leagueId:league.id,homeTeamId:team.id,awayTeamId:opponent.id,kickoffAt:past(),publishedAt:past(),status:"SCHEDULED"}});
  const fee=await prisma.playerMatchFee.create({data:{teamId:team.id,fixtureId:fixture.id,teamMemberId:member.id,amountPence,status:"OPEN",paymentToken:randomBytes(24).toString("hex")}});
  const charge=await prisma.paymentCharge.create({data:{teamId:team.id,fixtureId:fixture.id,leagueId:league.id,title:"Match fee",amountPence:4000,status:"OPEN",dueDate:fixture.kickoffAt}});
  return{team,opponent,user,member,fixture,fee,charge,league};
}
type Target=Awaited<ReturnType<typeof target>>;
async function extra(t:Target,amountPence=600){
 const fixture=await prisma.fixture.create({data:{leagueId:t.league.id,homeTeamId:t.team.id,awayTeamId:t.opponent.id,kickoffAt:new Date(Date.now()-1200_000),publishedAt:past(),status:"SCHEDULED"}});
 const fee=await prisma.playerMatchFee.create({data:{teamId:t.team.id,fixtureId:fixture.id,teamMemberId:t.member.id,amountPence,status:"OPEN",paymentToken:randomBytes(24).toString("hex")}});
 const charge=await prisma.paymentCharge.create({data:{teamId:t.team.id,fixtureId:fixture.id,title:"Next match",amountPence:4000,status:"OPEN"}});
 return{...t,fixture,fee,charge};
}
const plan=(t:Target,amount=800,ids=[t.fee.id])=>createPlayerRepaymentPlan({teamId:t.team.id,anchorFeeId:t.fee.id,feeIds:ids,instalmentPence:amount,firstDueAt:past(),actorUserId:t.user.id,reason:"Agreed weekly part-payments, not a discount"});
const account=(t:Target)=>getPlayerLedgerAccount(t.team.id,t.fee.id);
const state=(t:Target)=>prisma.playerFeeLedgerState.findUniqueOrThrow({where:{feeId:t.fee.id}});
const feeRow=(t:Target)=>prisma.playerMatchFee.findUniqueOrThrow({where:{id:t.fee.id}});
const req=(planId:string)=>prisma.playerRepaymentRequest.findFirstOrThrow({where:{planId},orderBy:{createdAt:"desc"}});
function fakeStripe(){
 const sessions=new Map<string,Stripe.Checkout.Session>();const keys=new Map<string,string>();const refunds=new Map<string,{id:string;amount:number;status:string}[]>();
 let creates=0,lost=false,refundCalls=0;
 const api={checkout:{sessions:{
  create:async(params:Stripe.Checkout.SessionCreateParams,options:{idempotencyKey:string})=>{
    creates++;let id=keys.get(options.idempotencyKey);
    if(!id){id=`cs_test_${randomUUID()}`;keys.set(options.idempotencyKey,id);sessions.set(id,{id,mode:"payment",currency:"gbp",payment_status:"unpaid",status:"open",url:`https://checkout.example.invalid/${id}`,amount_total:params.line_items![0].price_data!.unit_amount,metadata:params.metadata,payment_intent:`pi_${id}`,expires_at:params.expires_at} as Stripe.Checkout.Session);}
    if(lost){lost=false;throw Error("Simulated lost create response");}return sessions.get(id)!;
  },
  retrieve:async(id:string)=>{const s=sessions.get(id);if(!s)throw Error(`Unknown test checkout ${id}`);return s;},
  expire:async(id:string)=>{const s=sessions.get(id)!;s.status="expired";return s;}
 }},paymentIntents:{retrieve:async(id:string)=>{const s=[...sessions.values()].find(s=>s.payment_intent===id)!;return{id,status:s.payment_status==="paid"?"succeeded":"requires_payment_method",currency:s.currency,amount_received:s.payment_status==="paid"?s.amount_total:0};}},
 refunds:{create:async(params:{payment_intent:string;amount:number},options:{idempotencyKey:string})=>{refundCalls++;return{id:options.idempotencyKey,status:"succeeded",amount:params.amount};},list:async({charge}:{charge:string})=>({data:refunds.get(charge)||[],has_more:false})},
 charges:{retrieve:async(id:string)=>({id,payment_intent:id.replace("ch_",""),refunded:false})}} as unknown as Stripe;
 return {api,sessions,keys,refunds,get creates(){return creates},get refundCalls(){return refundCalls},loseNext(){lost=true},paid(id:string){const s=sessions.get(id)!;s.payment_status="paid";s.status="complete";return s;}};
}
async function pay(t:Target,p:Awaited<ReturnType<typeof plan>>,provider= fakeStripe()){
 await startPlayerRepaymentCheckout({planToken:p.token},provider.api);const r=await req(p.id);assert.ok(r.checkoutSessionId);
 const s=provider.paid(r.checkoutSessionId);await settlePlayerRepaymentSession(s,provider.api);return{provider,r,s};
}

test("migration imports current £8, never guesses an overwritten £12, and reruns do not add another opening charge",async()=>{
 const s=await prisma.playerFeeLedgerState.findUniqueOrThrow({where:{feeId:legacyId}});assert.equal(s.balancePence,800);
 const before=await prisma.playerLedgerEntry.count();migrate(migration);assert.equal(await prisma.playerLedgerEntry.count(),before);
});
test("ordinary fee creation, genuine edit, waiver and payment retain simple existing behavior with an immutable statement",async()=>{
 const t=await target();assert.equal((await account(t)).balancePence,1200);
 await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{amountPence:800}});assert.equal((await account(t)).balancePence,800);
 await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{status:"PAID",paidAt:new Date()}});assert.equal((await account(t)).balancePence,0);
 const entries=(await account(t)).entries;assert.deepEqual(entries.map(e=>e.amountPence),[1200,-400,-800]);
 await assert.rejects(prisma.playerLedgerEntry.delete({where:{id:entries[0].id}}),/immutable/);
 const w=await target();await prisma.playerMatchFee.update({where:{id:w.fee.id},data:{status:"WAIVED",note:"Genuine discount"}});assert.equal((await account(w)).balancePence,0);
});
test("£12 debt, request £8, confirmed payment £8 leaves £4; same payment/webhook counts once and next week settles the £4",async()=>{
 const t=await target(),p=await plan(t),provider=fakeStripe();
 await startPlayerRepaymentCheckout({planToken:p.token},provider.api);const r=await req(p.id);assert.equal(r.amountPence,800);assert.equal((await account(t)).balancePence,1200);
 const s=provider.paid(r.checkoutSessionId!);await Promise.all([settlePlayerRepaymentSession(s,provider.api),settlePlayerRepaymentSession(s,provider.api)]);
 assert.equal((await state(t)).balancePence,400);assert.equal((await state(t)).receivedPence,800);assert.equal((await feeRow(t)).status,"OPEN");
 assert.equal(await prisma.paymentTransaction.count({where:{stripeCheckoutSessionId:s.id}}),1);
 let ledger=(await getTeamPaymentLedger(t.team.id))!;assert.equal(ledger.entries[0].paidPence,800);assert.equal(ledger.entries[0].playerPaidPence,800);
 const updated=await prisma.playerRepaymentPlan.findUniqueOrThrow({where:{id:p.id}});assert.ok(updated.nextDueAt>new Date());
 await prisma.playerRepaymentPlan.update({where:{id:p.id},data:{nextDueAt:past()}});await pay(t,p,provider);
 assert.equal((await account(t)).balancePence,0);assert.equal((await feeRow(t)).status,"PAID");
 assert.equal((await state(t)).receivedPence,1200);ledger=(await getTeamPaymentLedger(t.team.id))!;assert.equal(ledger.entries[0].paidPence,1200);
 assert.equal((await prisma.playerRepaymentPlan.findUniqueOrThrow({where:{id:p.id}})).status,"COMPLETED");
});
test("multiple original charges are allocated oldest first, new matches stay outside the plan",async()=>{
 const t=await target(600),b=await extra(t,600),p=await plan(t,800,[b.fee.id,t.fee.id]);const future=await extra(t,600);
 const {r}=await pay(t,p);const parts=allocationsOf(r.allocations);assert.equal(parts[0].feeId,t.fee.id);assert.deepEqual(parts.map(a=>a.amountPence),[600,200]);
 assert.equal((await state(t)).balancePence,0);assert.equal((await state(b)).balancePence,400);assert.equal((await state(future)).balancePence,600);
 assert.equal((await account(t)).balancePence,1000);assert.equal((await getPlayerRepaymentTarget({planToken:p.token})).balancePence,400);
 assert.equal((await prisma.paymentTransaction.aggregate({where:{teamId:t.team.id},_sum:{amountPence:true}}))._sum.amountPence,800);
});
test("parallel checkout clicks reuse one saved request and one Stripe idempotency key",async()=>{
 const t=await target(),p=await plan(t),provider=fakeStripe();await Promise.all([startPlayerRepaymentCheckout({planToken:p.token},provider.api),startPlayerRepaymentCheckout({planToken:p.token},provider.api)]);
 assert.equal(provider.keys.size,1);assert.equal(await prisma.playerRepaymentRequest.count({where:{planId:p.id}}),1);assert.equal((await account(t)).balancePence,1200);
});
test("lost create response retries the same request and immutable parameters",async()=>{
 const t=await target(),p=await plan(t),provider=fakeStripe();provider.loseNext();await assert.rejects(startPlayerRepaymentCheckout({planToken:p.token},provider.api),/lost create/);
 const r=await req(p.id);await startPlayerRepaymentCheckout({planToken:p.token},provider.api);const next=await req(p.id);assert.equal(next.id,r.id);assert.deepEqual(next.stripeParams,r.stripeParams);assert.equal(provider.keys.size,1);
});
test("unpaid sessions and cancelled/expired checkouts never alter the obligation",async()=>{
 const t=await target(),p=await plan(t),provider=fakeStripe();await startPlayerRepaymentCheckout({planToken:p.token},provider.api);const r=await req(p.id);
 await settlePlayerRepaymentSession(provider.sessions.get(r.checkoutSessionId!)!,provider.api);assert.equal((await account(t)).balancePence,1200);
 await cancelPlayerRepaymentCheckout({teamId:t.team.id,requestId:r.id},provider.api);assert.equal((await account(t)).balancePence,1200);assert.equal((await req(p.id)).status,"CANCELLED");
 await startPlayerRepaymentCheckout({planToken:p.token},provider.api);const r2=await req(p.id);const s=provider.sessions.get(r2.checkoutSessionId!)!;s.status="expired";await handlePlayerRepaymentExpiry(s);assert.equal((await account(t)).balancePence,1200);
});
test("old full-size checkout is redirected to the ledger; stale excess is refunded, not silently credited as repayment",async()=>{
 const t=await target(),p=await plan(t);await pay(t,p);assert.equal((await state(t)).balancePence,400);
 const provider=fakeStripe();const s={id:`cs_legacy_${randomUUID()}`,mode:"payment",status:"complete",currency:"gbp",payment_status:"paid",amount_total:1200,payment_intent:`pi_${randomUUID()}`,metadata:{teamId:t.team.id,fixtureId:t.fixture.id,playerMatchFeeId:t.fee.id}} as unknown as Stripe.Checkout.Session;
 provider.sessions.set(s.id,s);assert.equal(await settlePlayerRepaymentSession(s,provider.api),true);assert.equal(provider.refundCalls,1);assert.equal((await state(t)).balancePence,400);
 await settlePlayerRepaymentSession(s,provider.api);assert.equal(provider.refundCalls,1);assert.equal((await state(t)).receivedPence,800);
});
test("old legitimate £12 checkout paid before any instalment settles the debt once",async()=>{
 const t=await target();await plan(t);const provider=fakeStripe();const s={id:`cs_legacy_${randomUUID()}`,mode:"payment",status:"complete",currency:"gbp",payment_status:"paid",amount_total:1200,payment_intent:`pi_${randomUUID()}`,metadata:{teamId:t.team.id,fixtureId:t.fixture.id,playerMatchFeeId:t.fee.id}} as unknown as Stripe.Checkout.Session;
 provider.sessions.set(s.id,s);await settlePlayerRepaymentSession(s,provider.api);assert.equal((await state(t)).balancePence,0);assert.equal((await state(t)).receivedPence,1200);
});
test("genuine reductions and captain receipts are explicit, idempotent and do not fabricate SIXFL cash",async()=>{
 const t=await target();await plan(t);
 const adjustment={teamId:t.team.id,feeId:t.fee.id,amountPence:200,kind:"WAIVER" as const,reason:"Agreed £2 discount",actorUserId:t.user.id,requestKey:randomUUID()};
 await adjustPlayerLedgerBalance(adjustment);await adjustPlayerLedgerBalance(adjustment);assert.equal((await state(t)).balancePence,1000);
 const receipt={...adjustment,amountPence:800,kind:"CAPTAIN_RECEIPT" as const,reason:"Captain received cash from player",requestKey:randomUUID()};await adjustPlayerLedgerBalance(receipt);
 assert.equal((await state(t)).balancePence,200);assert.equal((await state(t)).captainReceivedPence,800);assert.equal(await prisma.paymentTransaction.count({where:{teamId:t.team.id}}),0);
 assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].paidPence,0);
 const remittance=await getCaptainCollectedRemittanceSnapshots([{teamId:t.team.id,fixtureId:t.fixture.id,chargeId:t.charge.id}]);assert.equal(remittance.get(t.charge.id)!.collectedPence,800);
 await assert.rejects(adjustPlayerLedgerBalance({...receipt,amountPence:100}),/different adjustment/);
});
test("pausing/replacing collection preserves balance; legacy edits cannot overwrite controlled debt",async()=>{
 const t=await target(),p=await plan(t);await changePlayerRepaymentPlan({teamId:t.team.id,planId:p.id,action:"pause",actorUserId:t.user.id});assert.ok((await getPlayerRepaymentTarget({planToken:p.token})).hold);
 assert.equal((await account(t)).balancePence,1200);
 await assert.rejects(prisma.playerMatchFee.update({where:{id:t.fee.id},data:{amountPence:800}}),/repayment ledger/);
 await assert.rejects(prisma.playerMatchFee.delete({where:{id:t.fee.id}}),/unpaid ledger/);
 await changePlayerRepaymentPlan({teamId:t.team.id,planId:p.id,action:"end",actorUserId:t.user.id});await pausePlayerFeeCollection({teamId:t.team.id,feeIds:[t.fee.id],paused:true,actorUserId:t.user.id});assert.ok(await playerFeeCollectionHold(t.fee.id));assert.equal((await account(t)).balancePence,1200);
});
test("confirmed partial refunds restore only actual refunded debt once and reopen the payment plan for review",async()=>{
 const t=await target(),p=await plan(t);const {provider,s}=await pay(t,p);const intent=s.payment_intent as string;const chargeId=`ch_${intent}`;
 provider.refunds.set(chargeId,[{id:"re_1",amount:300,status:"succeeded"},{id:"re_pending",amount:500,status:"pending"}]);
 await handlePlayerRepaymentRefund({id:chargeId} as Stripe.Charge,provider.api);await handlePlayerRepaymentRefund({id:chargeId} as Stripe.Charge,provider.api);
 assert.equal((await state(t)).balancePence,700);assert.equal((await state(t)).receivedPence,500);assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].paidPence,500);
 assert.equal((await prisma.playerRepaymentPlan.findUniqueOrThrow({where:{id:p.id}})).status,"REVIEW");
 provider.refunds.set(chargeId,[{id:"re_1",amount:300,status:"succeeded"},{id:"re_2",amount:500,status:"succeeded"}]);await handlePlayerRepaymentRefund({id:chargeId} as Stripe.Charge,provider.api);assert.equal((await state(t)).balancePence,1200);assert.equal((await state(t)).receivedPence,0);
});
test("settled team payments plus player receipts produce one capped standard-team credit, not a second cash pot",async()=>{
 const t=await target(),p=await plan(t);
 await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:4000,method:"STRIPE",paidAt:new Date(),notes:"Captain paid team charge"}});
 await pay(t,p);
 for(let n=0;n<3;n++){const ledger=(await getTeamPaymentLedger(t.team.id))!;assert.equal(ledger.entries[0].paidPence,4800);assert.equal((await getTeamCreditLedger([t.team.id])).balancePence,800);}
});
test("managed squads cannot accumulate standard credit and capped/subsidised fees keep their old flow",async()=>{
 const t=await target(1200,"MANAGED"),p=await plan(t);await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:4000,method:"STRIPE",paidAt:new Date(),notes:"Already covered"}});
 await assert.rejects(startPlayerRepaymentCheckout({planToken:p.token},fakeStripe().api),PlayerLedgerError);assert.equal((await state(t)).balancePence,1200);
 const capped=await target();await prisma.playerMatchFee.update({where:{id:capped.fee.id},data:{note:"Player fee cap applied: captain share £12.00; player pays £8.00."}});await assert.rejects(plan(capped),/special concessions/);
 assert.equal(getPlayerFeeCashReceivedPence({status:"PAID",amountPence:800,note:null}),800);
});
test("account identity is exact, includes all old fees and cannot adopt another player sharing an email",async()=>{
 const t=await target();for(let i=0;i<51;i++)await extra(t,100);
 assert.equal((await getPlayerLedgerSummaryForUser(t.team.id,t.user.id)).balancePence,6300);assert.equal((await account(t)).balancePence,6300);
 const other=await target();await assert.rejects(getPlayerLedgerAccount(other.team.id,t.fee.id),/not found/);
 await assert.rejects(createPlayerRepaymentPlan({teamId:t.team.id,anchorFeeId:t.fee.id,feeIds:[other.fee.id],instalmentPence:800,firstDueAt:past(),actorUserId:t.user.id,reason:"Not same account"}),/Only this player/);
});
test("one due email follows the optional plan; original fee chases hold, and template edits/preferences remain effective",async()=>{
 const t=await target(),p=await plan(t);assert.ok(await playerFeeCollectionHold(t.fee.id));
 await runPlayerRepaymentReminderJob();await runPlayerRepaymentReminderJob();
 const d=await prisma.notificationDispatch.findMany({where:{sourceType:"PLAYER_REPAYMENT_PLAN",sourceId:p.id},include:{recipient:true,template:true}});assert.equal(d.length,1);assert.equal(d[0].status,"QUEUED");assert.match(d[0].bodyText,/£12.00/);assert.match(d[0].bodyText,/£8.00/);assert.equal(await playerRepaymentReminderDeliveryBlock(d[0]),null);
 await prisma.notificationRecipient.update({where:{id:d[0].recipientId},data:{isSuppressed:true}});assert.ok(await playerRepaymentReminderDeliveryBlock(d[0]));
 await prisma.notificationTemplate.update({where:{key:"player-repayment-instalment-email"},data:{subject:"My edited agreement {{amount}}",isActive:false}});migrate(migration);assert.equal((await prisma.notificationTemplate.findUniqueOrThrow({where:{key:"player-repayment-instalment-email"}})).isActive,false);
});
test("simple player panel has one Pay £8 button and states full £12 debt without affecting it",async()=>{
 const t=await target(),p=await plan(t);const html=renderToStaticMarkup(await PlayerRepaymentPanel({planToken:p.token}));assert.match(html,/£12.00/);assert.match(html.replace(/<!--.*?-->/g,""),/Pay £8.00/);assert.match(html,/£4.00/);assert.equal((html.match(/<button/g)||[]).length,1);assert.equal((await account(t)).balancePence,1200);
});
test("money and small residual policy do not round debt away or silently increase the instalment",()=>{
 assert.equal(parseLedgerMoney("8"),800);assert.equal(parseLedgerMoney("£8.01"),801);assert.throws(()=>parseLedgerMoney("8.001"));assert.throws(()=>parseLedgerMoney("-8"));
 assert.equal(repaymentAmount({instalmentPence:800,instalmentPaidPence:0},1200),800);assert.equal(repaymentAmount({instalmentPence:800,instalmentPaidPence:0},825),775);
});
test("prepared sources retain normal guards, optional native controls and a single verified payment handoff",()=>{
 const read=(p:string)=>readFileSync(p,"utf8");const processor=read("src/lib/notifications/processor.ts");assert.ok(processor.indexOf("await playerLedgerNotificationBlock(dispatch)")<processor.indexOf("const sendResult = await sendEmailWithResend"));
 const webhook=read("src/app/api/stripe/webhook/route.ts");assert.match(webhook,/settlePlayerRepaymentSession/);assert.match(webhook,/handlePlayerRepaymentRefund/);
 assert.match(read("src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx"),/Arrange smaller payments|Player balances and smaller payments/);
 assert.match(read("src/app/captain/team/[teamid]/player-payments/actions.ts"),/pausePlayerFeeCollection/);
 const normal=getPlayerFeeCashReceivedPence({status:"PAID",amountPence:1200,note:null});const controlled=getPlayerFeeCashReceivedPence({status:"PAID",amountPence:1200,note:"[SIXFL_PLAYER_LEDGER_RECEIPTS]"});assert.equal(normal,1200);assert.equal(controlled,0);
 const summary=summariseChargesWithPlayerMatchFees([{amountPence:4000,fixtureId:"f",status:"OPEN",transactions:[{amountPence:1200,notes:"Player ledger repayment. Request x."}]}],[{fixtureId:"f",amountPence:1200,status:"PAID",note:"[SIXFL_PLAYER_LEDGER_RECEIPTS]"}]);assert.equal(summary[0].paidPence,1200);assert.equal(summary[0].outstandingPence,2800);
});


test("unpublished ordinary charges are not exposed in player balances; real controlled debt survives unpublishing",async()=>{
 const t=await target(); await prisma.fixture.update({where:{id:t.fixture.id},data:{publishedAt:null}});
 assert.equal((await account(t)).balancePence,0); assert.equal((await getPlayerLedgerSummaryForUser(t.team.id,t.user.id)).balancePence,0);
 await prisma.fixture.update({where:{id:t.fixture.id},data:{publishedAt:new Date()}}); await plan(t);
 await prisma.fixture.update({where:{id:t.fixture.id},data:{publishedAt:null}}); assert.equal((await account(t)).balancePence,1200);
});


test("skipped duplicate inserts and upserts record only the rows actually written",async()=>{
 const t=await target(); const before=(await account(t)).entries.length;
 await prisma.playerMatchFee.createMany({data:[{teamId:t.team.id,fixtureId:t.fixture.id,teamMemberId:t.member.id,amountPence:800,status:"OPEN"}],skipDuplicates:true});
 assert.equal((await account(t)).balancePence,1200); assert.equal((await account(t)).entries.length,before);
 assert.equal(await prisma.playerFeeLedgerState.count({where:{teamId:t.team.id}}),1);
 await prisma.playerMatchFee.upsert({where:{fixtureId_teamMemberId:{fixtureId:t.fixture.id,teamMemberId:t.member.id}},
   create:{teamId:t.team.id,fixtureId:t.fixture.id,teamMemberId:t.member.id,amountPence:800,status:"OPEN"},update:{amountPence:1000}});
 assert.equal((await account(t)).balancePence,1000); assert.equal((await account(t)).entries.length,before+1);
 await plan(t);
 await assert.rejects(prisma.playerMatchFee.upsert({where:{id:t.fee.id},create:{id:t.fee.id,teamId:t.team.id,fixtureId:t.fixture.id,amountPence:1,status:"OPEN"},update:{amountPence:1}}),/repayment ledger/);
 assert.equal((await account(t)).balancePence,1000);
});
test("the unified dashboard retains exact-user temporary fees without mixing team account statements",async()=>{
 const t=await target(); const other=await target(700);
 await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerMatchFee" SET "teamMemberId"=NULL,"temporaryUserId"=${t.user.id} WHERE id=${other.fee.id}`);
 assert.equal((await getPlayerLedgerSummaryForUser(t.team.id,t.user.id)).balancePence,1200);
 assert.equal((await getPlayerLedgerSummaryForUser(t.team.id,t.user.id,true)).balancePence,1900);
 assert.equal((await account(t)).balancePence,1200);
});


// Ordinary checkouts deliberately have no repayment-request metadata. These are
// the production path which the original arrangement-only tests missed.
function ordinaryCheckout(t: Target, amount: number, provider = fakeStripe()) {
  const session = { id:`cs_ordinary_${randomUUID()}`, mode:"payment", status:"complete", currency:"gbp",
    payment_status:"paid", amount_total:amount, payment_intent:`pi_${randomUUID()}`,
    metadata:{teamId:t.team.id,fixtureId:t.fixture.id,playerMatchFeeId:t.fee.id,paymentType:"PLAYER_MATCH_FEE"}
  } as unknown as Stripe.Checkout.Session;
  provider.sessions.set(session.id,session);
  return {session, provider};
}
async function receiveOrdinary(t: Target, amount: number, provider = fakeStripe()) {
  const payment=ordinaryCheckout(t,amount,provider);
  assert.equal(await settlePlayerRepaymentSession(payment.session,provider.api),true);
  return payment;
}
test("ordinary £12 fee / £8 receipt is part-paid £4, without creating or requiring a repayment plan",async()=>{
  const t=await target();
  await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerMatchFee" SET "captainAssignedAmountPence"=1200 WHERE id=${t.fee.id}`);
  const before=(await account(t)).entries.length;
  const {session,provider}=await receiveOrdinary(t,800);
  const s=await state(t);assert.equal(s.balancePence,400);assert.equal(s.openingAmountPence,1200);assert.equal(s.receivedPence,800);assert.equal(s.controlled,true);
  assert.equal((await feeRow(t)).status,"OPEN");assert.equal(await prisma.playerRepaymentPlan.count({where:{teamId:t.team.id}}),0);
  const display=getPlayerPaymentDisplay(await feeRow(t),s);assert.equal(display.statusLabel,"Part-paid");assert.match(display.detail,/£8.00 received online.*£4.00 outstanding/);
  await settlePlayerRepaymentSession(session,provider.api);
  assert.equal((await account(t)).entries.length,before+1);assert.equal((await state(t)).balancePence,400);
  assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].playerSubsidyPence,0);
  const targetPage=await getPlayerRepaymentTarget({feeToken:t.fee.paymentToken!});assert.equal(targetPage.amountPence,400);
  await startPlayerRepaymentCheckout({feeToken:t.fee.paymentToken!},provider.api);
  const remaining=await prisma.playerRepaymentRequest.findFirstOrThrow({where:{feeId:t.fee.id,status:"READY"}});
  assert.equal(remaining.amountPence,400);await settlePlayerRepaymentSession(provider.paid(remaining.checkoutSessionId!),provider.api);
  assert.equal((await state(t)).balancePence,0);assert.equal((await state(t)).receivedPence,1200);assert.equal((await feeRow(t)).status,"PAID");
  assert.equal((await account(t)).entries.reduce((sum,e)=>sum+e.receiptPence,0),1200);
});
test("ordinary duplicate and concurrent delivery subtracts £8 exactly once, never closes the remaining £4",async()=>{
  for(let round=0;round<5;round++) {
    const t=await target(), {session,provider}=ordinaryCheckout(t,800);
    await Promise.all(Array.from({length:4},()=>settlePlayerRepaymentSession(session,provider.api)));
    assert.equal((await state(t)).balancePence,400);assert.equal((await state(t)).receivedPence,800);
    assert.equal(await prisma.paymentTransaction.count({where:{stripeCheckoutSessionId:session.id}}),1);assert.equal(provider.refundCalls,0);
    assert.equal(await prisma.playerRepaymentRequest.count({where:{checkoutSessionId:session.id}}),1);
  }
});
test("different ordinary receipts for the same fee both count, unlike the old fee-ID-only duplicate check",async()=>{
  const t=await target();const provider=fakeStripe();const a=ordinaryCheckout(t,800,provider),b=ordinaryCheckout(t,400,provider);
  await Promise.all([settlePlayerRepaymentSession(a.session,provider.api),settlePlayerRepaymentSession(b.session,provider.api)]);
  assert.equal((await state(t)).balancePence,0);assert.equal((await state(t)).receivedPence,1200);
  assert.equal(await prisma.paymentTransaction.count({where:{teamId:t.team.id}}),2);assert.equal(provider.refundCalls,0);
});
test("£28 team cash plus £8 ordinary player receipt leaves £4 on the £40 team charge, with no invented subsidy",async()=>{
  const t=await target();await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:2800,method:"STRIPE",paidAt:new Date()}});
  await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerMatchFee" SET "captainAssignedAmountPence"=1200 WHERE id=${t.fee.id}`);
  await receiveOrdinary(t,800);const entry=(await getTeamPaymentLedger(t.team.id))!.entries[0];
  assert.equal(entry.amountPence,4000);assert.equal(entry.paidPence,3600);assert.equal(entry.playerSubsidyPence,0);assert.equal(entry.outstandingPence,400);assert.equal(entry.displayStatus,"PART_PAID");
  assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:t.charge.id}})).status,"PART_PAID");
});
test("numeric assigned-share difference is not an authorised subsidy, even on a historical PAID record",async()=>{
  const t=await target(800);await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{status:"PAID"}});
  await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerMatchFee" SET "captainAssignedAmountPence"=1200 WHERE id=${t.fee.id}`);
  await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:2800,method:"STRIPE",paidAt:new Date()}});
  const e=(await getTeamPaymentLedger(t.team.id))!.entries[0];assert.equal(e.paidPence,3600);assert.equal(e.playerSubsidyPence,0);assert.equal(e.outstandingPence,400);
  assert.equal(getPlayerFeeSubsidyPence({status:"PAID",amountPence:800,captainAssignedAmountPence:1200}),0);
  assert.equal(getPlayerPaymentDisplay({status:"PAID",amountPence:800,captainAssignedAmountPence:1200}).statusLabel,"Check balance");
});
test("explicit £12/£8 cap preserves its authorised £4 allowance, but records only £8 online cash",async()=>{
  const t=await target(800);await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{note:"Player fee cap applied: captain share £12.00; player charged £8.00."}});
  await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:2800,method:"STRIPE",paidAt:new Date()}});
  await receiveOrdinary(t,800);const e=(await getTeamPaymentLedger(t.team.id))!.entries[0];assert.equal(e.paidPence,3600);assert.equal(e.playerSubsidyPence,400);assert.equal(e.outstandingPence,0);
  const d=getPlayerPaymentDisplay(await feeRow(t),await state(t),"admin");assert.equal(d.amountPence,800);assert.equal(d.statusLabel,"Settled with adjustment");assert.match(d.detail,/£8.00 received online.*£4.00 SIXFL adjustment/);
});
test("a partial payment of an explicitly capped fee cannot trigger the whole subsidy early",async()=>{
  const t=await target(800);await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{note:"Player fee cap applied: captain share £12.00; player charged £8.00."}});
  const {provider}=await receiveOrdinary(t,500);assert.equal((await state(t)).balancePence,300);assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].playerSubsidyPence,0);
  await startPlayerRepaymentCheckout({feeToken:t.fee.paymentToken!},provider.api);const r=await prisma.playerRepaymentRequest.findFirstOrThrow({where:{feeId:t.fee.id,status:"READY"}});
  await settlePlayerRepaymentSession(provider.paid(r.checkoutSessionId!),provider.api);assert.equal((await state(t)).receivedPence,800);assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].playerSubsidyPence,400);
});
test("refunding ordinary receipts reopens only the refunded player and team balance, never double counts it",async()=>{
  const t=await target();await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:2800,method:"STRIPE",paidAt:new Date()}});
  const {session,provider}=await receiveOrdinary(t,1200);assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].displayStatus,"PAID");
  const chargeId=`ch_${session.payment_intent}`;provider.refunds.set(chargeId,[{id:"re_partial",amount:400,status:"succeeded"}]);
  await handlePlayerRepaymentRefund({id:chargeId} as Stripe.Charge,provider.api);await handlePlayerRepaymentRefund({id:chargeId} as Stripe.Charge,provider.api);
  assert.equal((await state(t)).balancePence,400);assert.equal((await state(t)).receivedPence,800);assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].outstandingPence,400);
  assert.equal((await prisma.paymentCharge.findUniqueOrThrow({where:{id:t.charge.id}})).status,"PART_PAID");
});
test("ordinary failed, unpaid or wrong-currency checkouts never reduce a balance",async()=>{
  const t=await target();const {session,provider}=ordinaryCheckout(t,800);session.payment_status="unpaid";
  await settlePlayerRepaymentSession(session,provider.api);assert.equal((await state(t)).balancePence,1200);
  session.payment_status="paid";session.currency="eur";await assert.rejects(settlePlayerRepaymentSession(session,provider.api),/not verified/);
  assert.equal((await state(t)).balancePence,1200);assert.equal(await prisma.paymentTransaction.count({where:{teamId:t.team.id}}),0);
});
test("a checkout cannot settle a different player's team or fixture",async()=>{
  const t=await target();const {session,provider}=ordinaryCheckout(t,800);session.metadata!.fixtureId="another-fixture";
  await assert.rejects(settlePlayerRepaymentSession(session,provider.api),/original team and fixture/);assert.equal((await state(t)).balancePence,1200);
  session.metadata!.fixtureId=t.fixture.id;session.metadata!.teamId="another-team";await assert.rejects(settlePlayerRepaymentSession(session,provider.api),/original team and fixture/);
  assert.equal(await prisma.paymentTransaction.count({where:{teamId:t.team.id}}),0);
});
test("replaying an already-booked legacy receipt makes no historical balance repair or duplicate payment",async()=>{
  const t=await target(800);const {session,provider}=ordinaryCheckout(t,800);
  await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:800,method:"STRIPE",paidAt:new Date(),stripeCheckoutSessionId:session.id,stripePaymentIntentId:session.payment_intent as string,notes:`Player match fee paid online. Player fee ID: ${t.fee.id}`}});
  await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{status:"PAID"}});const before=await account(t);
  await settlePlayerRepaymentSession(session,provider.api);assert.deepEqual((await account(t)).entries,before.entries);assert.equal((await state(t)).controlled,false);
  assert.equal(await prisma.playerRepaymentRequest.count({where:{teamId:t.team.id}}),0);assert.equal(provider.refundCalls,0);
});
test("ordinary stale overpayment is refunded with debt unchanged, not misreported as paid or team credit",async()=>{
  const t=await target(800);const {session,provider}=ordinaryCheckout(t,1200);await settlePlayerRepaymentSession(session,provider.api);
  assert.equal(provider.refundCalls,1);assert.equal((await state(t)).balancePence,800);assert.equal((await state(t)).receivedPence,0);assert.equal((await feeRow(t)).status,"OPEN");
});
test("normal full £6 payment still works with no arrangement or extra player action",async()=>{
  const t=await target(600);await receiveOrdinary(t,600);assert.equal((await state(t)).balancePence,0);assert.equal((await state(t)).receivedPence,600);
  assert.equal(getPlayerPaymentDisplay(await feeRow(t),await state(t)).statusLabel,"Paid online");assert.equal(await prisma.playerRepaymentPlan.count({where:{teamId:t.team.id}}),0);
});
test("new smaller receipts below the collection UI minimum are still recorded without rounding away debt",async()=>{
  const t=await target(100);await receiveOrdinary(t,30);assert.equal((await state(t)).balancePence,70);assert.equal((await state(t)).receivedPence,30);
});
test("actual signature-verified webhook routes an ordinary underpayment through the ledger and ignores a late failure",async()=>{
  const t=await target();const {session,provider}=ordinaryCheckout(t,800);const stripe=getStripeServerClient();
  const m1=mock.method(stripe.checkout.sessions,"retrieve",provider.api.checkout.sessions.retrieve);
  const m2=mock.method(stripe.paymentIntents,"retrieve",provider.api.paymentIntents.retrieve);
  const secret="whsec_local_ordinary_receipt_test";process.env.STRIPE_WEBHOOK_SECRET=secret;
  try {
    const send=async(type:string,object:unknown)=>{const payload=JSON.stringify({id:`evt_${randomUUID()}`,object:"event",type,data:{object}});
      return stripeWebhook(new Request("http://localhost/api/stripe/webhook",{method:"POST",body:payload,headers:{"stripe-signature":signedTestHeader(payload,secret)}}));};
    const response=await send("checkout.session.completed",session);assert.equal(response.status,200,await response.text());assert.equal((await state(t)).balancePence,400);
    const late=await send("checkout.session.async_payment_failed",session);assert.equal(late.status,200);assert.equal((await state(t)).balancePence,400);assert.equal((await state(t)).receivedPence,800);
    assert.equal(await prisma.paymentTransaction.count({where:{stripeCheckoutSessionId:session.id}}),1);
  } finally { m1.mock.restore();m2.mock.restore(); }
});
test("actual team webhook keeps £10 of £40 part-paid, preserves the charge and shows £30 outstanding",async()=>{
  const t=await target();const {session,provider}=ordinaryCheckout(t,1000);session.metadata={chargeId:t.charge.id,teamId:t.team.id};session.client_reference_id=t.charge.id;
  const stripe=getStripeServerClient();const m=mock.method(stripe.paymentIntents,"retrieve",provider.api.paymentIntents.retrieve);
  const secret="whsec_local_team_receipt_test";process.env.STRIPE_WEBHOOK_SECRET=secret;
  try {const payload=JSON.stringify({id:`evt_${randomUUID()}`,object:"event",type:"checkout.session.completed",data:{object:session}});
    const response=await stripeWebhook(new Request("http://localhost/api/stripe/webhook",{method:"POST",body:payload,headers:{"stripe-signature":signedTestHeader(payload,secret)}}));
    assert.equal(response.status,200,await response.text());const charge=await prisma.paymentCharge.findUniqueOrThrow({where:{id:t.charge.id}});
    assert.equal(charge.amountPence,4000);assert.equal(charge.status,"PART_PAID");assert.equal(getChargeStatusFromAmounts(4000,1000),"PART_PAID");
    assert.equal((await getTeamPaymentLedger(t.team.id))!.entries[0].outstandingPence,3000);
  } finally {m.mock.restore();}
});
test("final prepared source has no ordinary receipt-to-PAID fallback or implicit subsidy and uses native truthful history",()=>{
  const webhook=readFileSync("src/app/api/stripe/webhook/route.ts","utf8");assert.doesNotMatch(webhook,/closePlayerMatchFeeFromStripeSession|handleCompletedPlayerMatchFeeCheckoutSession|shouldSyncAmount/);
  const service=readFileSync("src/lib/payments/player-repayment-checkout.ts","utf8");assert.match(service,/if\(!requestId&&!legacyFeeId\) return false/);
  assert.match(readFileSync("src/lib/payments/player-fee-coverage.ts","utf8"),/if \(!agreement\) return 0/);
  assert.match(readFileSync("src/app/captain/team/[teamid]/payments/page.tsx","utf8"),/getPlayerPaymentDisplay\(fee, playerReceiptStates.get\(fee.id\)\)/);
});

// Admin historical corrections: use real database triggers and provider-read
// fixtures. No account-specific live data or external HTTP is used.
import { assertPlayerChargeCorrectionAdmin, previewOriginalPlayerCharge, confirmOriginalPlayerCharge, getOriginalChargeCorrectionCandidate } from "../src/lib/payments/player-charge-correction";
async function historicalCorrectionFixture() {
  const t = await target(1200);
  const admin = await prisma.user.create({data:{email:`admin-${randomUUID()}@example.invalid`,role:"ADMIN",name:"Test administrator"}});
  await prisma.$executeRaw(Prisma.sql`UPDATE "PlayerMatchFee" SET "captainAssignedAmountPence"=1200 WHERE id=${t.fee.id}`);
  const sessionId=`cs_test_historical_${randomUUID()}`, intentId=`pi_historical_${randomUUID()}`, chargeId=`ch_historical_${randomUUID()}`;
  const receipt=await prisma.paymentTransaction.create({data:{teamId:t.team.id,chargeId:t.charge.id,amountPence:800,method:"STRIPE",paidAt:new Date(),
    stripeCheckoutSessionId:sessionId,stripePaymentIntentId:intentId,reference:intentId,notes:`Player match fee paid online via Stripe Checkout. Player fee ID: ${t.fee.id}`}});
  await prisma.$executeRaw(Prisma.sql`UPDATE "PaymentTransaction" SET "playerMatchFeeId"=${t.fee.id} WHERE id=${receipt.id}`);
  await prisma.playerMatchFee.update({where:{id:t.fee.id},data:{amountPence:800,status:"PAID",paidAt:new Date()}});
  const metadata={playerMatchFeeId:t.fee.id,teamId:t.team.id,fixtureId:t.fixture.id};
  const session={id:sessionId,mode:"payment",status:"complete",payment_status:"paid",currency:"gbp",amount_total:800,payment_intent:intentId,metadata};
  const intent={id:intentId,status:"succeeded",currency:"gbp",amount_received:800,latest_charge:chargeId,metadata};
  const charge={id:chargeId,status:"succeeded",currency:"gbp",paid:true,captured:true,amount_captured:800,amount_refunded:0,refunded:false,disputed:false,payment_intent:intentId};
  const noWrite=async()=>{throw Error("No provider write is permitted by a historical correction");};
  const stripe={checkout:{sessions:{retrieve:async(id:string)=>{assert.equal(id,session.id);return session;},create:noWrite,expire:noWrite}},
    paymentIntents:{retrieve:async(id:string)=>{assert.equal(id,intent.id);return intent;}},charges:{retrieve:async(id:string)=>{assert.equal(id,charge.id);return charge;}},refunds:{create:noWrite}} as unknown as Stripe;
  const input={feeId:t.fee.id,actorUserId:admin.id,originalPence:1200,reason:"Original charge was twelve pounds; no waiver agreed. Restore the unpaid remainder.",noWaiver:true};
  return {t,admin,receipt,stripe,input,session,intent,charge};
}
test("admin correction preview is read-only and £12 less verified £8 previews £4",async()=>{
  const h=await historicalCorrectionFixture();const entries=await prisma.playerLedgerEntry.count();const tx=await prisma.paymentTransaction.count();const messages=await prisma.notificationDispatch.count();
  const candidate=await getOriginalChargeCorrectionCandidate(h.t.fee.id,h.admin.id);assert.equal(candidate.assignedPence,1200);
  const p=await previewOriginalPlayerCharge(h.input,h.stripe);assert.deepEqual([p.originalPence,p.receivedPence,p.outstandingPence],[1200,800,400]);
  assert.equal((await state(h.t)).balancePence,0);assert.equal(await prisma.playerLedgerEntry.count(),entries);assert.equal(await prisma.paymentTransaction.count(),tx);assert.equal(await prisma.notificationDispatch.count(),messages);
});
test("admin correction restores £4 once, retains the same £8 receipt and keeps all chases paused",async()=>{
  const h=await historicalCorrectionFixture();const before=await prisma.paymentTransaction.count();const messages=await prisma.notificationDispatch.count();const prior=(await account(h.t)).entries;
  const p=await previewOriginalPlayerCharge(h.input,h.stripe);const input={feeId:h.input.feeId,actorUserId:h.admin.id,token:p.token};
  const results=await Promise.all([confirmOriginalPlayerCharge(input,h.stripe),confirmOriginalPlayerCharge(input,h.stripe)]);
  assert.equal(results.filter(r=>!r.alreadySaved).length,1);assert.equal((await account(h.t)).balancePence,400);assert.equal((await state(h.t)).receivedPence,800);
  assert.equal((await state(h.t)).collectionPaused,true);assert.ok(await playerFeeCollectionHold(h.t.fee.id));assert.equal(await prisma.notificationDispatch.count(),messages);
  assert.equal(await prisma.paymentTransaction.count(),before);const receipt=await prisma.paymentTransaction.findUniqueOrThrow({where:{id:h.receipt.id}});
  assert.deepEqual([receipt.amountPence,receipt.stripePaymentIntentId,receipt.stripeCheckoutSessionId,receipt.paidAt],[h.receipt.amountPence,h.receipt.stripePaymentIntentId,h.receipt.stripeCheckoutSessionId,h.receipt.paidAt]);
  const entries=(await account(h.t)).entries;assert.deepEqual(entries.slice(0,prior.length),prior);assert.equal(entries.at(-1)!.kind,"ORIGINAL_CHARGE_CORRECTION");assert.equal(entries.at(-1)!.actorUserId,h.admin.id);assert.match(entries.at(-1)!.reference!,new RegExp(h.receipt.id));
  const display=getPlayerPaymentDisplay(await feeRow(h.t),await state(h.t));assert.equal(display.statusLabel,"Part-paid");assert.equal(display.amountPence,1200);assert.equal(display.outstandingPence,400);
  const ledger=await getTeamPaymentLedger(h.t.team.id);assert.equal(ledger!.entries[0].playerPaidPence,800);assert.equal(ledger!.entries[0].outstandingPence,3200);
  const again=await confirmOriginalPlayerCharge(input,h.stripe);assert.equal(again.alreadySaved,true);assert.equal((await state(h.t)).receivedPence,800);
  await assert.rejects(prisma.playerMatchFee.update({where:{id:h.t.fee.id},data:{amountPence:1200}}),/repayment ledger/);
});
test("after an admin correction the remaining £4 can be paid normally without duplicating old cash",async()=>{
  const h=await historicalCorrectionFixture(),p=await previewOriginalPlayerCharge(h.input,h.stripe);await confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.admin.id,token:p.token},h.stripe);
  await pausePlayerFeeCollection({teamId:h.t.team.id,feeIds:[h.t.fee.id],paused:false,actorUserId:h.admin.id});const provider=fakeStripe();
  await startPlayerRepaymentCheckout({feeToken:h.t.fee.paymentToken!},provider.api);
  const pending=await prisma.playerRepaymentRequest.findFirstOrThrow({where:{feeId:h.t.fee.id,status:"READY"}});assert.equal(pending.amountPence,400);
  await settlePlayerRepaymentSession(provider.paid(pending.checkoutSessionId!),provider.api);assert.equal((await state(h.t)).balancePence,0);assert.equal((await state(h.t)).receivedPence,1200);
  assert.equal((await getTeamPaymentLedger(h.t.team.id))!.entries[0].playerPaidPence,1200);
});
test("an adopted historical receipt remains refund-aware without rewriting the original payment",async()=>{
  const h=await historicalCorrectionFixture(),p=await previewOriginalPlayerCharge(h.input,h.stripe);await confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.admin.id,token:p.token},h.stripe);
  const refundApi={...h.stripe,refunds:{list:async()=>({data:[{id:"re_historical",amount:300,status:"succeeded"}],has_more:false})}} as unknown as Stripe;
  await handlePlayerRepaymentRefund(h.charge as Stripe.Charge,refundApi);await handlePlayerRepaymentRefund(h.charge as Stripe.Charge,refundApi);
  assert.equal((await state(h.t)).balancePence,700);assert.equal((await state(h.t)).receivedPence,500);
  assert.equal((await getTeamPaymentLedger(h.t.team.id))!.entries[0].playerPaidPence,500);
});
test("captains/players and missing actors cannot preview or confirm historical corrections",async()=>{
  const h=await historicalCorrectionFixture();await assert.rejects(assertPlayerChargeCorrectionAdmin(h.t.user.id),/Administrator/);
  await assert.rejects(previewOriginalPlayerCharge({...h.input,actorUserId:h.t.user.id},h.stripe),/Administrator/);
  const p=await previewOriginalPlayerCharge(h.input,h.stripe);await assert.rejects(confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.t.user.id,token:p.token},h.stripe),/Administrator/);
  await assert.rejects(previewOriginalPlayerCharge({...h.input,actorUserId:""},h.stripe),/Administrator/);assert.equal((await state(h.t)).balancePence,0);
});
test("confirmation is bound to the exact administrator, fee, proposed amount and receipt snapshot",async()=>{
  const h=await historicalCorrectionFixture(),p=await previewOriginalPlayerCharge(h.input,h.stripe);const other=await historicalCorrectionFixture();
  await assert.rejects(confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:other.admin.id,token:p.token},h.stripe),/another administrator/);
  await assert.rejects(confirmOriginalPlayerCharge({feeId:other.t.fee.id,actorUserId:h.admin.id,token:p.token},h.stripe),/another administrator/);
  const [body,sig]=p.token.split('.');const edited=JSON.parse(Buffer.from(body,"base64url").toString());edited.originalPence=9999;
  await assert.rejects(confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.admin.id,token:`${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${sig}`},h.stripe),/changed/);
  await prisma.playerMatchFee.update({where:{id:h.t.fee.id},data:{note:"Changed after preview"}});
  await assert.rejects(confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.admin.id,token:p.token},h.stripe),/changed since preview/);assert.equal((await state(h.t)).balancePence,0);
});
test("historical correction refuses concessions, missing receipts, wrong allocation and invalid totals",async()=>{
  for (const kind of ["concession","missing","allocation","invalid"]){const h=await historicalCorrectionFixture();
    if(kind==="concession")await prisma.playerMatchFee.update({where:{id:h.t.fee.id},data:{note:"Player fee cap applied: captain share £12.00; player charged £8.00."}});
    if(kind==="missing")await prisma.paymentTransaction.delete({where:{id:h.receipt.id}});
    if(kind==="allocation")await prisma.paymentTransaction.update({where:{id:h.receipt.id},data:{teamId:h.t.opponent.id}});
    await assert.rejects(previewOriginalPlayerCharge({...h.input,...(kind==="invalid"?{originalPence:800}:{})},h.stripe));assert.equal((await state(h.t)).balancePence,0);
  }
});
test("provider capture, identity, currency, refund and dispute changes block correction without financial writes",async()=>{
  for(const kind of ["refund","dispute","identity","currency","unpaid"]){const h=await historicalCorrectionFixture();const p=await previewOriginalPlayerCharge(h.input,h.stripe);
    if(kind==="refund")h.charge.amount_refunded=100;if(kind==="dispute")h.charge.disputed=true;if(kind==="identity")h.intent.metadata={...h.intent.metadata,teamId:h.t.opponent.id};
    if(kind==="currency")h.intent.currency="usd";if(kind==="unpaid")h.intent.status="processing";
    await assert.rejects(confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.admin.id,token:p.token},h.stripe));assert.equal((await state(h.t)).balancePence,0);
  }
});
test("an administrator whose role was revoked cannot confirm a prior preview",async()=>{
  const h=await historicalCorrectionFixture(),p=await previewOriginalPlayerCharge(h.input,h.stripe);await prisma.user.update({where:{id:h.admin.id},data:{role:"USER"}});
  await assert.rejects(confirmOriginalPlayerCharge({feeId:h.t.fee.id,actorUserId:h.admin.id,token:p.token},h.stripe),/Administrator/);
});
