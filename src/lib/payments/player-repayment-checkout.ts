import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl, getStripeServerClient } from "@/lib/stripe/client";
import { getTeamPaymentLedger } from "./team-payment-ledger";
import { applyExistingTeamCreditToChargeFirst, getMaximumAdditionalCollectionPence, getTeamCreditPolicySnapshot } from "./team-credit-policy";
import { reconcileFixtureChargeFromPlayerPayments } from "./player-match-fee-reconciliation";
import { advanceRepaymentProgress, collectiblePlayerLedgerFee, getPlayerLedgerAccount, lockLedgerFees, PlayerLedgerError, readPlayerLedgerState, repaymentAmount, setLedgerContext, type LedgerDb } from "./player-ledger";

import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "./cancel-player-match-fee-notifications";
import { LEDGER_TRANSACTION_PREFIX } from "./player-ledger-markers";
type Allocation = { feeId:string; fixtureId:string; chargeId:string; amountPence:number; version:number };
type Target = { planToken?:string; feeToken?:string };
type RequestRow = Awaited<ReturnType<typeof prisma.playerRepaymentRequest.findUniqueOrThrow>>;
export function allocationsOf(value:unknown): Allocation[] {
  if(!Array.isArray(value)||!value.length||value.length>100) throw new PlayerLedgerError("Invalid repayment allocation record.");
  return value.map((a:unknown)=>{
    const x=a as Allocation;
    if(!x||typeof x.feeId!=="string"||typeof x.fixtureId!=="string"||typeof x.chargeId!=="string"||!Number.isSafeInteger(x.amountPence)||x.amountPence<=0||!Number.isSafeInteger(x.version)) throw new PlayerLedgerError("Invalid repayment allocation.");
    return x;
  });
}

export async function getPlayerRepaymentTarget(target:Target, db:LedgerDb=prisma, now=new Date()){
  let plan = target.planToken ? await db.playerRepaymentPlan.findUnique({where:{token:target.planToken}}) : null;
  const fee=target.feeToken ? await db.playerMatchFee.findUnique({where:{paymentToken:target.feeToken}}) : null;
  if(!plan&&!fee) throw new PlayerLedgerError("Payment link not found.");
  const state=fee?await readPlayerLedgerState(fee.id,db):null;
  if(!plan&&state?.planId) plan=await db.playerRepaymentPlan.findUnique({where:{id:state.planId}});
  if(plan&&["ENDED","COMPLETED"].includes(plan.status)&&fee) plan=null;
  const teamId=plan?.teamId??fee!.teamId, anchorFeeId=plan?.anchorFeeId??fee!.id;
  const account=await getPlayerLedgerAccount(teamId,anchorFeeId,db);
  const states=account.states.filter(s=>plan?s.planId===plan.id:s.feeId===fee?.id);
  const balance=states.reduce((sum,s)=>sum+s.balancePence,0);
  const amount=plan?repaymentAmount(plan,balance):balance;
  const paused=states.some(s=>s.collectionPaused);
  let hold:string|null=null;
  if(!balance) hold="This balance is settled. No further payment is required.";
  else if(paused) hold="Collection is paused. Your balance remains recorded.";
  else if(plan&&plan.status!=="ACTIVE") hold="This repayment arrangement is paused or needs review. Contact your captain or SIXFL.";
  else if(plan&&plan.nextDueAt>now) hold="The next agreed instalment is not due yet.";
  else if(amount<50) hold="This remaining amount is below the online card-payment minimum. Please contact your captain to settle it.";
  else if(!account.email) hold="A valid player email is needed for online payment.";
  return {plan,fee,account,states,balancePence:balance,amountPence:amount,hold,
    path:plan?`/pay/player-repayment/${plan.token}`:`/pay/player-match-fee/${target.feeToken}`};
}

async function capacities(teamId:string,allocations:Array<{fixtureId:string;amountPence:number}>,applyCredit:boolean, db:LedgerDb=prisma){
  const ledger=await getTeamPaymentLedger(teamId,db);
  if(!ledger) throw new PlayerLedgerError("The team's payment record is unavailable. The player balance has not changed.");
  const entries=allocations.map(a=>ledger.entries.find(e=>e.teamId===teamId&&e.fixtureId===a.fixtureId&&e.displayStatus!=="VOID"));
  if(entries.some(e=>!e||e.amountPence<=0)) throw new PlayerLedgerError("One of these player balances has no active team charge. SIXFL needs to check where the repayment should be received.");
  if(applyCredit) for(const e of [...new Map(entries.map(e=>[e!.chargeId,e!])).values()]) await applyExistingTeamCreditToChargeFirst({teamId,chargeId:e.chargeId,fixtureFeePence:e.amountPence});
  const fresh=await getTeamPaymentLedger(teamId,db);
  const requested=new Map<string,number>();
  for(const a of allocations) requested.set(a.fixtureId,(requested.get(a.fixtureId)??0)+a.amountPence);
  let usedHeadroom=0;
  for(const [fixtureId,amount] of requested){
    const e=fresh?.entries.find(e=>e.teamId===teamId&&e.fixtureId===fixtureId&&e.displayStatus!=="VOID");
    if(!e||e.amountPence<=0) throw new PlayerLedgerError("The fixture charge changed. Please ask SIXFL to review this payment.");
    const policy=await getTeamCreditPolicySnapshot({teamId,fixtureFeePence:e.amountPence},db);
    if(amount>getMaximumAdditionalCollectionPence({outstandingFixturePence:e.outstandingPence,creditHeadroomPence:Math.max(policy.creditHeadroomPence-usedHeadroom,0)})) throw new PlayerLedgerError("This player balance is still owed, but collecting it through SIXFL would exceed the team's payment limit. Contact SIXFL or record money actually received by the captain. The debt remains recorded.");
    usedHeadroom+=Math.max(amount-e.outstandingPence,0);
  }
  return fresh!;
}

/** Resumable creation: immutable request parameters + Stripe idempotency key.
 * A lost create response reuses the SAME request, never creates another charge. */
export async function startPlayerRepaymentCheckout(target:Target, stripe=getStripeServerClient()){
  const initial=await getPlayerRepaymentTarget(target);
  if(initial.hold) throw new PlayerLedgerError(initial.hold);
  // Apply existing credit before repayment locks to avoid nested lock waits.
  let previewLeft=initial.amountPence;
  const preview:Array<{fixtureId:string;amountPence:number}>=[];
  for(const fee of initial.account.fees){const state=initial.states.find(s=>s.feeId===fee.id);if(!state?.balancePence)continue;
    const amount=Math.min(state.balancePence,previewLeft);if(amount)preview.push({fixtureId:fee.fixtureId,amountPence:amount});previewLeft-=amount;if(!previewLeft)break;}
  if(previewLeft)throw new PlayerLedgerError("The player balance needs review.");
  await capacities(initial.account.teamId,preview,true);
  const request=await prisma.$transaction(async db=>{
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${initial.account.teamId} FOR UPDATE`);
    if(initial.plan) await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerRepaymentPlan" WHERE id=${initial.plan.id} FOR UPDATE`);
    await lockLedgerFees(db,initial.states.map(s=>s.feeId));
    const t=await getPlayerRepaymentTarget(target,db);
    if(t.hold) throw new PlayerLedgerError(t.hold);
    const existing=await db.playerRepaymentRequest.findFirst({where:{teamId:t.account.teamId,
      ...(t.plan?{planId:t.plan.id}:{feeId:t.fee!.id,planId:null}),status:{in:["CREATING","READY","PROCESSING","REVIEW"]}},orderBy:{createdAt:"desc"}});
    if(existing) return existing;
    let left=t.amountPence;
    const parts:Array<{feeId:string;fixtureId:string;amountPence:number;version:number}>=[];
    for(const f of t.account.fees){
      const s=t.states.find(s=>s.feeId===f.id);
      if(!s||!s.balancePence) continue;
      if(!s.controlled||!collectiblePlayerLedgerFee(f)||s.deletedAt) throw new PlayerLedgerError("A selected charge changed or needs review. No money has been taken.");
      const amount=Math.min(left,s.balancePence); if(amount) parts.push({feeId:f.id,fixtureId:f.fixtureId,amountPence:amount,version:s.version});
      left-=amount; if(!left) break;
    }
    if(left||!parts.length) throw new PlayerLedgerError("The player balance changed. Refresh before paying.");
    const ledger=await capacities(t.account.teamId,parts,false,db);
    const allocations=parts.map(p=>({...p,chargeId:ledger.entries.find(e=>e.teamId===t.account.teamId&&e.fixtureId===p.fixtureId&&e.displayStatus!=="VOID")!.chargeId}));
    const id=randomUUID(),expiresAt=new Date(Date.now()+35*60_000);
    const params:Stripe.Checkout.SessionCreateParams={mode:"payment",payment_method_types:["card"],client_reference_id:id,customer_email:t.account.email!,
      success_url:`${getPublicSiteUrl()}${t.path}?payment=received&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${getPublicSiteUrl()}${t.path}?payment=cancelled`,expires_at:Math.floor(expiresAt.getTime()/1000),
      line_items:[{quantity:1,price_data:{currency:"gbp",unit_amount:t.amountPence,product_data:{name:"SIXFL agreed player payment",description:`${t.account.teamName} — part-payment towards recorded player charges`}}}],
      metadata:{playerRepaymentRequestId:id,teamId:t.account.teamId,paymentType:"PLAYER_LEDGER_REPAYMENT"},
      payment_intent_data:{metadata:{playerRepaymentRequestId:id,teamId:t.account.teamId,paymentType:"PLAYER_LEDGER_REPAYMENT"}}};
    const saved=await db.playerRepaymentRequest.create({data:{id,teamId:t.account.teamId,planId:t.plan?.id,feeId:t.plan?null:t.fee!.id,amountPence:t.amountPence,
      dueAt:t.plan?.nextDueAt??new Date(),allocations:allocations as unknown as Prisma.InputJsonValue,stripeParams:params as unknown as Prisma.InputJsonValue,expiresAt}});
    if(t.plan) await db.playerRepaymentPlan.update({where:{id:t.plan.id},data:{activeRequestId:id}});
    return saved;
  },{maxWait:5000,timeout:25000});
  if(request.status==="REVIEW") throw new PlayerLedgerError(request.failureReason||"An earlier checkout needs review.");
  let session:Stripe.Checkout.Session;
  if(request.checkoutSessionId){
    session=await stripe.checkout.sessions.retrieve(request.checkoutSessionId);
    if(session.payment_status==="paid"){await settlePlayerRepaymentSession(session,stripe);throw new PlayerLedgerError("Payment received. Refresh to see the updated balance.");}
    if(session.status==="expired"){
      await prisma.playerRepaymentRequest.updateMany({where:{id:request.id,status:"READY"},data:{status:"EXPIRED"}});
      throw new PlayerLedgerError("The previous checkout expired. Press Pay again to create a fresh checkout; your debt has not changed.");
    }
    if(session.status!=="open"||!session.url) throw new PlayerLedgerError("This payment is processing. Do not start another checkout.");
  }else{
    if(Date.now()-request.createdAt.getTime()>23*3600_000) throw new PlayerLedgerError("The previous checkout request needs SIXFL review before it can be retried.");
    session=await stripe.checkout.sessions.create(request.stripeParams as unknown as Stripe.Checkout.SessionCreateParams,{idempotencyKey:`player-ledger:${request.id}`});
    await prisma.playerRepaymentRequest.updateMany({where:{id:request.id,status:"CREATING"},data:{checkoutSessionId:session.id,checkoutUrl:session.url,status:session.payment_status==="paid"?"PROCESSING":"READY"}});
    if(session.payment_status==="paid") {await settlePlayerRepaymentSession(session,stripe);throw new PlayerLedgerError("Payment received. Refresh to see the updated balance.");}
  }
  if(session.status==="expired") {
    await prisma.playerRepaymentRequest.updateMany({where:{id:request.id,status:{in:["CREATING","READY"]}},data:{status:"EXPIRED"}});
    throw new PlayerLedgerError("The previous checkout expired. Press Pay again for a fresh checkout.");
  }
  if(session.status!=="open"||!session.url) throw new PlayerLedgerError("Checkout is not available. Check payment status before trying again.");
  return session.url;
}

async function recordRejectedPayment(request:RequestRow,session:Stripe.Checkout.Session,stripe:Stripe,reason:string){
  const intent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  if(!intent) throw new Error("Verified repayment has no payment intent.");
  const refund=await stripe.refunds.create({payment_intent:intent,amount:session.amount_total!,metadata:{playerRepaymentRequestId:request.id,reason:reason.slice(0,400)}},{idempotencyKey:`invalid-player-ledger:${session.id}`});
  await prisma.playerRepaymentRequest.update({where:{id:request.id},data:{status:refund.status==="succeeded"?"REFUNDED":"REFUND_PENDING",
    checkoutSessionId:session.id,paymentIntentId:intent,paidAt:new Date(),failureReason:`Payment was not applied to debt and was submitted for refund. ${reason}`}});
}

/** Signature-verified event or retrieval of a known request only. Verify paid
 * status/currency/intent before posting any receipt. */
export async function settlePlayerRepaymentSession(eventSession:Stripe.Checkout.Session,stripe:Stripe){
  const requestId=eventSession.metadata?.playerRepaymentRequestId;
  const legacyFeeId=eventSession.metadata?.playerMatchFeeId;
  // All player checkouts, ordinary and arranged, settle against the recorded
  // obligation. Never let an ordinary link fall through to a PAID-on-any-receipt handler.
  if(!requestId&&!legacyFeeId) return false;
  const session=await stripe.checkout.sessions.retrieve(eventSession.id);
  if(session.mode!=="payment"||session.status!=="complete"||session.payment_status!=="paid") return true;
  if((requestId&&session.metadata?.playerRepaymentRequestId!==requestId)||(!requestId&&session.metadata?.playerMatchFeeId!==legacyFeeId))throw new Error("Repayment metadata changed between event and provider retrieval.");
  const intentId=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  if(!intentId) throw new Error("Repayment payment intent missing.");
  const intent=await stripe.paymentIntents.retrieve(intentId);
  if(intent.status!=="succeeded"||intent.currency!=="gbp"||session.currency!=="gbp"||!Number.isSafeInteger(session.amount_total)||!session.amount_total||session.amount_total<=0||intent.amount_received!==session.amount_total) throw new Error("Repayment was not verified as received in full.");
  let request=requestId?await prisma.playerRepaymentRequest.findUnique({where:{id:requestId}}):await prisma.playerRepaymentRequest.findFirst({where:{OR:[{checkoutSessionId:session.id},{paymentIntentId:intentId}]}});
  if(!request&&legacyFeeId){
    // Replayed historical receipts must not re-close a fee, reset its amount,
    // or be imported as another receipt. Historical mismatches need explicit review.
    const recorded=await prisma.paymentTransaction.findFirst({where:{OR:[{stripeCheckoutSessionId:session.id},{stripePaymentIntentId:intentId}]},select:{id:true}});
    if(recorded)return true;
    const s=await readPlayerLedgerState(legacyFeeId);
    if(!s)throw new PlayerLedgerError("Player obligation is missing. No balance was changed; this payment needs review.");
    if(session.metadata?.teamId!==s.teamId || session.metadata?.fixtureId!==s.fixtureId)throw new PlayerLedgerError("The payment does not belong to this player's original team and fixture.");
    const ledger=await getTeamPaymentLedger(s.teamId);
    const charge=ledger?.entries.find(e=>e.teamId===s.teamId&&e.fixtureId===s.fixtureId&&e.displayStatus!=="VOID");
    if(charge&&charge.amountPence>0){
      await applyExistingTeamCreditToChargeFirst({teamId:s.teamId,chargeId:charge.chargeId,fixtureFeePence:charge.amountPence});
    }
    // INSERT ... ON CONFLICT DO NOTHING is atomic even when webhook workers
    // race on both the deterministic receipt id and unique checkout-session id.
    // Prisma's empty-update upsert can otherwise fall back to read-then-insert.
    await prisma.playerRepaymentRequest.createMany({skipDuplicates:true,data:[{id:`legacy-${session.id}`,teamId:s.teamId,feeId:s.feeId,
      amountPence:session.amount_total,dueAt:new Date(),expiresAt:new Date(),status:"READY",checkoutSessionId:session.id,
      allocations:[{feeId:s.feeId,fixtureId:s.fixtureId,chargeId:charge?.chargeId??"unavailable",amountPence:session.amount_total,version:s.version}]}]});
    request=await prisma.playerRepaymentRequest.findUnique({where:{checkoutSessionId:session.id}});
  }
  if(!request) throw new Error("Repayment request not found; no ledger was changed.");
  if(request.status==="PAID") {await reconcileRepaymentCharges(request);return true;}
  if(["REFUNDED","REFUND_PENDING"].includes(request.status)) return true;
  const parts=allocationsOf(request.allocations);
  if(parts.reduce((sum,a)=>sum+a.amountPence,0)!==request.amountPence||session.amount_total!==request.amountPence||request.teamId!==session.metadata?.teamId) throw new Error("Repayment does not match its saved request.");
  try{
    await prisma.$transaction(async db=>{
      await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${request!.teamId} FOR UPDATE`);
      await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerRepaymentRequest" WHERE id=${request!.id} FOR UPDATE`);
      const fresh=await db.playerRepaymentRequest.findUniqueOrThrow({where:{id:request!.id}});
      if(fresh.status==="PAID") return;
      if(["REFUNDED","REFUND_PENDING"].includes(fresh.status)) throw new PlayerLedgerError("This checkout was already cancelled/refunded.");
      if(fresh.checkoutSessionId&&fresh.checkoutSessionId!==session.id) throw new PlayerLedgerError("The checkout session does not match this request.");
      await lockLedgerFees(db,parts.map(a=>a.feeId));
      for(const a of parts){
        const s=await readPlayerLedgerState(a.feeId,db);
        const f=await db.playerMatchFee.findUnique({where:{id:a.feeId},include:{fixture:{select:{publishedAt:true,status:true}}}});
        if(!s||(requestId&&!s.controlled)||s.teamId!==fresh.teamId||s.fixtureId!==a.fixtureId||s.balancePence<a.amountPence||!f||!collectiblePlayerLedgerFee(f)) throw new PlayerLedgerError("The underlying player charge changed or was already settled.");
        if(requestId&&s.version!==a.version) throw new PlayerLedgerError("The player's balance changed while checkout was open.");
      }
      const chargeIds=[...new Set(parts.map(a=>a.chargeId))].sort();
      await db.$queryRaw(Prisma.sql`SELECT id FROM "PaymentCharge" WHERE id IN (${Prisma.join(chargeIds)}) ORDER BY id FOR UPDATE`);
      const ledger=await capacities(fresh.teamId,parts,false,db);
      for(const a of parts) if(!ledger.entries.some(e=>e.chargeId===a.chargeId&&e.teamId===fresh.teamId&&e.fixtureId===a.fixtureId&&e.displayStatus!=="VOID")) throw new PlayerLedgerError("The repayment's team-charge allocation is no longer valid.");
      // This change is made only after receipt, identity and collection-capacity
      // checks. The database capture now preserves the obligation/receipt split
      // for a normal player as well as a player on a repayment arrangement.
      await db.playerFeeLedgerState.updateMany({where:{feeId:{in:parts.map(a=>a.feeId)},teamId:fresh.teamId},data:{controlled:true}});
      const paidAt=new Date();
      const progress=new Map<string,number>();
      for(const [index,a] of parts.entries()){
        const s=(await readPlayerLedgerState(a.feeId,db))!;
        const balance=s.balancePence-a.amountPence;
        const transaction=await db.paymentTransaction.create({data:{teamId:fresh.teamId,chargeId:a.chargeId,amountPence:a.amountPence,method:"STRIPE",paidAt,
          reference:intentId,stripePaymentIntentId:intentId,stripeCheckoutSessionId:index===0?session.id:null,
          notes:`${LEDGER_TRANSACTION_PREFIX}. Player: ${s.playerName??"Player"}. Account fee reference: ${s.feeId}. Request: ${fresh.id}.`}});
        await setLedgerContext(db,{feeId:s.feeId,kind:"PAYMENT",receiptPence:a.amountPence,receivedBy:"SIXFL",reference:transaction.id,
          reason:"Verified Stripe payment allocated to this original match charge. Any unpaid remainder is still owed.",sourceKey:`stripe:${session.id}:${s.feeId}`});
        await db.playerMatchFee.update({where:{id:s.feeId},data:{amountPence:balance>0?balance:s.receivedPence+s.captainReceivedPence+a.amountPence,
          status:balance>0?"OPEN":"PAID",paidAt:balance===0?paidAt:null,waivedAt:null,cancelledAt:null}});
        if(s.planId) progress.set(s.planId,(progress.get(s.planId)??0)+a.amountPence);
      }
      await db.playerRepaymentRequest.update({where:{id:fresh.id},data:{status:"PAID",checkoutSessionId:session.id,paymentIntentId:intentId,paidAt}});
      for(const [planId,amount] of progress) await advanceRepaymentProgress(db,planId,amount,paidAt);
    },{maxWait:5000,timeout:25000});
  }catch(error){
    if(!(error instanceof PlayerLedgerError)) throw error;
    await recordRejectedPayment(request,session,stripe,error.message);return true;
  }
  await reconcileRepaymentCharges(request);
  return true;
}

async function reconcileRepaymentCharges(request:RequestRow) {
  await cancelQueuedPlayerMatchFeeNotificationDispatches(allocationsOf(request.allocations).map(a=>a.feeId),
    "A verified player payment changed this balance. The remaining debt is retained; this old payment request is out of date.");
  for(const fixtureId of [...new Set(allocationsOf(request.allocations).map(a=>a.fixtureId))]) {
    await reconcileFixtureChargeFromPlayerPayments({teamId:request.teamId,fixtureId});
  }
}

/** Cancel a collection request, not its debt. Check for a concurrent receipt. */
export async function cancelPlayerRepaymentCheckout(input:{teamId:string;requestId:string},stripe=getStripeServerClient()){
  const request=await prisma.playerRepaymentRequest.findFirst({where:{id:input.requestId,teamId:input.teamId}});
  if(!request) throw new PlayerLedgerError("Checkout not found for this team.");
  if(!request.checkoutSessionId) throw new PlayerLedgerError("Checkout creation is still unresolved. Retry the original payment link or ask SIXFL to review it; do not create another request.");
  let session=await stripe.checkout.sessions.retrieve(request.checkoutSessionId);
  if(session.payment_status==="paid"){await settlePlayerRepaymentSession(session,stripe);return;}
  if(session.status==="open") session=await stripe.checkout.sessions.expire(session.id);
  if(session.status!=="expired") throw new PlayerLedgerError("The payment is processing and cannot safely be cancelled yet.");
  await prisma.playerRepaymentRequest.updateMany({where:{id:request.id,status:{in:["READY","CREATING"]}},data:{status:"CANCELLED",failureReason:"Checkout cancelled. Player debt unchanged."}});
}

export async function handlePlayerRepaymentExpiry(session:Stripe.Checkout.Session){
  const id=session.metadata?.playerRepaymentRequestId;if(!id)return false;
  if(session.payment_status==="paid")return true;
  await prisma.playerRepaymentRequest.updateMany({where:{id,status:{in:["CREATING","READY"]}},data:{status:session.status==="expired"?"EXPIRED":"FAILED",failureReason:"Checkout did not complete. Player balance unchanged."}});
  return true;
}

/** Confirmed refunds are new reversing entries; repeated events cannot restore
 * the same debt twice. Pending/failed refunds are not recorded as received. */
export async function handlePlayerRepaymentRefund(eventCharge:Stripe.Charge,stripe:Stripe){
  const charge=await stripe.charges.retrieve(eventCharge.id);
  const intent=typeof charge.payment_intent==="string"?charge.payment_intent:charge.payment_intent?.id;
  if(!intent)return false;
  const request=await prisma.playerRepaymentRequest.findUnique({where:{paymentIntentId:intent}});
  if(!request)return false;
  if(request.status==="REFUNDED")return true;
  if(request.status==="REFUND_PENDING") {
    if(charge.refunded)await prisma.playerRepaymentRequest.updateMany({where:{id:request.id,status:"REFUND_PENDING"},data:{status:"REFUNDED"}});
    return true;
  }
  if(request.status!=="PAID")return true;
  const refunds=await stripe.refunds.list({charge:charge.id,limit:100});
  if(refunds.has_more)throw new Error("Repayment has too many refund records for automatic reconciliation.");
  const confirmed=Math.min(request.amountPence,refunds.data.filter(r=>r.status==="succeeded").reduce((sum,r)=>sum+r.amount,0));
  await prisma.$transaction(async db=>{
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${request.teamId} FOR UPDATE`);
    await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerRepaymentRequest" WHERE id=${request.id} FOR UPDATE`);
    const fresh=await db.playerRepaymentRequest.findUniqueOrThrow({where:{id:request.id}});
    let delta=confirmed-fresh.refundedPence;if(delta<=0)return;
    const parts=allocationsOf(fresh.allocations).reverse();await lockLedgerFees(db,parts.map(a=>a.feeId));
    let priorRefund=fresh.refundedPence;
    for(const a of parts){
      const prior=Math.min(priorRefund,a.amountPence);priorRefund-=prior;
      const amount=Math.min(delta,a.amountPence-prior);if(!amount)continue;
      const s=await readPlayerLedgerState(a.feeId,db);if(!s||s.receivedPence<amount)throw new Error("Refund requires player ledger review.");
      const transaction=await db.paymentTransaction.create({data:{teamId:fresh.teamId,chargeId:a.chargeId,amountPence:-amount,method:"STRIPE",paidAt:new Date(),reference:charge.id,
        notes:`${LEDGER_TRANSACTION_PREFIX} refund. Account fee reference: ${s.feeId}. Request: ${fresh.id}.`}});
      await setLedgerContext(db,{feeId:s.feeId,kind:"REFUND",receiptPence:-amount,receivedBy:"SIXFL",reference:transaction.id,reason:"Stripe confirmed a refund of this player repayment.",sourceKey:`refund:${fresh.id}:${confirmed}:${s.feeId}`});
      await db.playerMatchFee.update({where:{id:s.feeId},data:{amountPence:s.balancePence+amount,status:"OPEN",paidAt:null}});
      if(s.planId)await db.playerRepaymentPlan.update({where:{id:s.planId},data:{status:"REVIEW",activeRequestId:null}});
      delta-=amount;
    }
    if(delta)throw new Error("Refund allocation does not balance.");
    await db.playerRepaymentRequest.update({where:{id:fresh.id},data:{refundedPence:confirmed}});
  },{maxWait:5000,timeout:20000});
  await reconcileRepaymentCharges(request);
  return true;
}
