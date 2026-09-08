import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export { PLAYER_LEDGER_RECEIPT_MARKER } from "./player-ledger-markers";
export class PlayerLedgerError extends Error {}
export type LedgerDb = Pick<typeof prisma, "$queryRaw" | "$executeRaw" | "playerFeeLedgerState" | "playerLedgerEntry" | "playerRepaymentPlan" | "playerRepaymentRequest" | "playerMatchFee" | "notificationDispatch" | "teamMember" | "user" | "paymentCharge" | "team">;
export type LedgerState = Awaited<ReturnType<typeof prisma.playerFeeLedgerState.findUniqueOrThrow>>;
export const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export function parseLedgerMoney(value: unknown, allowZero = false) {
  const raw = String(value ?? "").trim().replace(/^£/, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(raw)) throw new PlayerLedgerError("Enter an amount in pounds and pence.");
  const [pounds, pence = ""] = raw.split(".");
  const amount = Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
  if (amount < (allowZero ? 0 : 50) || amount > 500_000) throw new PlayerLedgerError("Enter an amount between £0.50 and £5,000.");
  return amount;
}

/** Raw read keeps compatibility with existing prepared-source test doubles.
 * Production must have the migration; a database error is not a zero balance. */
export async function readPlayerLedgerState(feeId: string, db: Pick<typeof prisma, "$queryRaw"> = prisma) {
  const rows = await db.$queryRaw<LedgerState[]>(Prisma.sql`SELECT * FROM "PlayerFeeLedgerState" WHERE "feeId"=${feeId}`);
  return rows[0] ?? null;
}
export async function isPlayerFeeLedgerControlled(feeId: string) {
  return (await readPlayerLedgerState(feeId))?.controlled === true;
}

export async function playerFeeCollectionHold(feeId: string, db: Pick<typeof prisma,"$queryRaw"> = prisma) {
  const state = await readPlayerLedgerState(feeId, db);
  if (state?.collectionPaused) return "Player collection is paused. The unpaid balance remains in Player account.";
  if (state?.planId) {
    const plan = (await db.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM "PlayerRepaymentPlan" WHERE id=${state.planId}`))[0];
    if (plan && ["ACTIVE", "PAUSED", "REVIEW"].includes(plan.status)) return "This balance has an agreed repayment arrangement. Use the instalment link, not individual fee chases.";
  }
  return null;
}

/** Exact membership / source-prospect links only. Never join financial accounts
 * by a shared email or a similarly named player/team. */
export async function getPlayerLedgerAccount(teamId: string, anchorFeeId: string, client?: LedgerDb) {
  if (client) return readPlayerLedgerAccount(teamId, anchorFeeId, client);
  return prisma.$transaction(db => readPlayerLedgerAccount(teamId, anchorFeeId, db), { isolationLevel: "RepeatableRead", timeout: 15000 });
}
async function readPlayerLedgerAccount(teamId: string, anchorFeeId: string, db: LedgerDb) {
  const anchor = await readPlayerLedgerState(anchorFeeId, db);
  if (!anchor || anchor.teamId !== teamId) throw new PlayerLedgerError("Player account not found for this team.");
  let userId = anchor.userId;
  if (!userId && anchor.prospectId) {
    const linked = await db.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT m."userId" FROM "TeamMemberProfile" p JOIN "TeamMember" m ON m.id=p."teamMemberId"
      WHERE p."sourceProspectId"=${anchor.prospectId} AND m."teamId"=${teamId}`);
    const identities = [...new Set(linked.map(x => x.userId))];
    if (identities.length === 1) userId = identities[0];
  }
  const owner = userId ? Prisma.sql`(s."userId"=${userId} OR s."prospectId" IN (
      SELECT p."sourceProspectId" FROM "TeamMemberProfile" p JOIN "TeamMember" m ON m.id=p."teamMemberId"
      WHERE m."teamId"=${teamId} AND p."sourceProspectId" IS NOT NULL
      GROUP BY p."sourceProspectId" HAVING COUNT(DISTINCT m."userId")=1 AND MIN(m."userId")=${userId}))`
    : anchor.teamMemberId ? Prisma.sql`s."teamMemberId"=${anchor.teamMemberId}`
    : anchor.prospectId ? Prisma.sql`s."prospectId"=${anchor.prospectId}` : Prisma.sql`s."feeId"=${anchorFeeId}`;
  const states = await db.$queryRaw<LedgerState[]>(Prisma.sql`SELECT s.* FROM "PlayerFeeLedgerState" s WHERE s."teamId"=${teamId} AND ${owner} ORDER BY s."createdAt",s."feeId"`);
  const ids = states.map(s => s.feeId);
  const [fees, entries, plans] = await Promise.all([
    db.playerMatchFee.findMany({ where: { id: { in: ids }, teamId }, orderBy: [{ fixture: { kickoffAt: "asc" } }, { id: "asc" }],
      include: { fixture: { select: { id: true, kickoffAt: true, publishedAt: true, status: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } },
        team: { select: { name: true, logoUrl: true, teamMode: true } }, teamMember: { select: { user: { select: { id: true, name: true, email: true } } } },
        prospect: { select: { firstName: true, lastName: true, email: true } } } }),
    db.playerLedgerEntry.findMany({ where: { teamId, feeId: { in: ids } }, orderBy: { sequence: "asc" } }),
    db.playerRepaymentPlan.findMany({ where: { teamId, OR: [{ anchorFeeId: { in: ids } }, { id: { in: states.map(s => s.planId).filter((id): id is string => Boolean(id)) } }] }, orderBy: { createdAt: "desc" } }),
  ]);
  const contact = fees.find(f => f.teamMember?.user.email || f.prospect?.email);
  const linkedUser=userId?await db.user.findUnique({where:{id:userId},select:{email:true,name:true}}):null;
  const email = linkedUser?.email?.trim().toLowerCase() || contact?.teamMember?.user.email?.trim().toLowerCase() || contact?.prospect?.email?.trim().toLowerCase() || null;
  const playerName = linkedUser?.name || contact?.teamMember?.user.name || [contact?.prospect?.firstName, contact?.prospect?.lastName].filter(Boolean).join(" ") || anchor.playerName || "Player";
  const balancePence = states.reduce((sum,s) => sum+s.balancePence,0);
  // An invariant, not a fallback: never present an invented balance if imports or
  // later maintenance have broken the statement/projection agreement.
  if (entries.reduce((sum,e) => sum+e.amountPence,0) !== balancePence) throw new PlayerLedgerError("Player ledger needs reconciliation. No payment should be requested until SIXFL checks it.");
  return { teamId, anchorFeeId, userId, playerName, email, teamName: contact?.team.name ?? "Team", states, fees, entries, plans, balancePence };
}
export type PlayerLedgerAccount = Awaited<ReturnType<typeof getPlayerLedgerAccount>>;

export async function lockLedgerFees(db: LedgerDb, feeIds: string[]) {
  const ids = [...new Set(feeIds)].sort();
  if (ids.length) await db.$queryRaw(Prisma.sql`SELECT id FROM "PlayerMatchFee" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
}
export async function setLedgerContext(db: LedgerDb, input: {
  feeId: string; kind: string; reason: string; actorUserId?: string | null;
  receiptPence?: number; receivedBy?: "SIXFL" | "CAPTAIN"; reference?: string; sourceKey?: string;
}) {
  await db.$executeRaw(Prisma.sql`SELECT set_config('sixfl.player_ledger_context',${JSON.stringify(input)},true)`);
}
export function basicRepaymentFee(fee: { status: string; amountPence: number; note: string | null; fixture: { publishedAt: Date | null; status: string } }) {
  if (fee.status !== "OPEN" || fee.amountPence <= 0 || !fee.fixture.publishedAt || ["CANCELLED","POSTPONED"].includes(fee.fixture.status)) return false;
  // Existing concessions/credits retain their normal behavior. Do not turn a
  // subsidy into a player debt, or move a historical credit into a new cash pot.
  return !/Player fee cap applied|Zero-fee player share waived|Player credit applied:/i.test(fee.note ?? "");
}
async function assertNoOpenRequest(db: LedgerDb, feeIds: string[], planId?: string | null) {
  const active = await db.playerRepaymentRequest.findFirst({ where: { status: { in: ["CREATING","READY","PROCESSING","REVIEW"] },
    OR: [{ feeId: { in: feeIds } }, ...(planId ? [{ planId }] : [])] } });
  if (active) throw new PlayerLedgerError("A checkout is in progress or needs review. Complete or cancel that checkout before changing the arrangement.");
}

export async function createPlayerRepaymentPlan(input: {
  teamId: string; anchorFeeId: string; feeIds: string[]; instalmentPence: number; firstDueAt: Date; actorUserId: string; reason: string;
}) {
  if (!input.actorUserId || !input.reason.trim()) throw new PlayerLedgerError("Record who agreed the arrangement and a short reason.");
  if (!Number.isSafeInteger(input.instalmentPence) || input.instalmentPence < 50 || input.instalmentPence > 500_000) throw new PlayerLedgerError("Invalid instalment amount.");
  if (!Number.isFinite(input.firstDueAt.getTime()) || input.firstDueAt.getTime() > Date.now()+90*86400000) throw new PlayerLedgerError("Choose a first payment date within 90 days.");
  const ids = [...new Set(input.feeIds)].sort();
  if (!ids.length || ids.length>100) throw new PlayerLedgerError("Select the existing fees to repay (maximum 100). New match fees stay separate.");
  return prisma.$transaction(async db => {
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${input.teamId} FOR UPDATE`);
    await lockLedgerFees(db,ids);
    const account = await getPlayerLedgerAccount(input.teamId,input.anchorFeeId,db);
    if (!account.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) throw new PlayerLedgerError("Save the player's own valid email before arranging online payments.");
    const selected = account.fees.filter(f => ids.includes(f.id));
    if (selected.length !== ids.length || selected.some(f => !basicRepaymentFee(f))) throw new PlayerLedgerError("Only this player's published, unpaid ordinary fees can be included. Fees with special concessions or credits need SIXFL review.");
    for (const s of account.states.filter(s=>ids.includes(s.feeId))) {
      if (s.balancePence<=0 || s.deletedAt) throw new PlayerLedgerError("The balance changed. Refresh the player account.");
      if (s.planId) {
        const existing = account.plans.find(p=>p.id===s.planId);
        if (existing && ["ACTIVE","PAUSED","REVIEW"].includes(existing.status)) throw new PlayerLedgerError("One of these fees already has a repayment arrangement.");
      }
    }
    await assertNoOpenRequest(db,ids);
    const plan = await db.playerRepaymentPlan.create({ data: { teamId: input.teamId, anchorFeeId: input.anchorFeeId,
      token: randomBytes(24).toString("hex"), instalmentPence: input.instalmentPence,
      nextDueAt: input.firstDueAt, createdByUserId: input.actorUserId, reason: input.reason.trim().slice(0,1000) } });
    await db.playerFeeLedgerState.updateMany({ where: { feeId: { in: ids }, teamId: input.teamId }, data: { controlled: true, planId: plan.id, collectionPaused: false } });
    for (const s of account.states.filter(s=>ids.includes(s.feeId))) await db.playerLedgerEntry.create({ data: { feeId:s.feeId,teamId:input.teamId,kind:"ARRANGEMENT",amountPence:0,balanceAfterPence:s.balancePence,
      actorUserId:input.actorUserId,reason:`Agreed smaller payments. ${input.reason.trim()}`,reference:plan.id } });
    await db.notificationDispatch.updateMany({ where: { sourceId: { in: ids }, sourceType: { in: ["PLAYER_MATCH_FEE_REQUEST","PLAYER_MATCH_FEE_CHASE_24H","PLAYER_MATCH_FEE_CHASE_72H","PLAYER_MATCH_FEE_WARNING"] }, status: "QUEUED" },
      data: { status:"CANCELLED",cancelledAt:new Date(),failureReason:"Replaced by an agreed repayment arrangement; balance unchanged." } });
    return plan;
  },{maxWait:5000,timeout:15000});
}

export async function changePlayerRepaymentPlan(input: { teamId: string; planId: string; action: "pause" | "resume" | "end"; actorUserId: string }) {
  return prisma.$transaction(async db => {
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${input.teamId} FOR UPDATE`);
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "PlayerRepaymentPlan" WHERE id=${input.planId} AND "teamId"=${input.teamId} FOR UPDATE`);
    if (!rows.length) throw new PlayerLedgerError("Arrangement not found.");
    const existingPlan=await db.playerRepaymentPlan.findUniqueOrThrow({where:{id:input.planId}});
    if(!["ACTIVE","PAUSED","REVIEW"].includes(existingPlan.status)) throw new PlayerLedgerError("This arrangement is already ended or completed.");
    const states = await db.playerFeeLedgerState.findMany({ where: { planId:input.planId,teamId:input.teamId } });
    await lockLedgerFees(db,states.map(s=>s.feeId));
    await assertNoOpenRequest(db,states.map(s=>s.feeId),input.planId);
    const status = input.action==="end"?"ENDED":input.action==="pause"?"PAUSED":"ACTIVE";
    await db.playerRepaymentPlan.update({where:{id:input.planId},data:{status}});
    if(input.action==="end") await db.playerFeeLedgerState.updateMany({where:{planId:input.planId},data:{planId:null}});
    for(const s of states) await db.playerLedgerEntry.create({data:{feeId:s.feeId,teamId:input.teamId,kind:"ARRANGEMENT",amountPence:0,balanceAfterPence:s.balancePence,
      actorUserId:input.actorUserId,reason:`Repayment arrangement ${status.toLowerCase()}. Debt unchanged.`,reference:input.planId}});
  },{maxWait:5000,timeout:15000});
}

/** Genuine reduction and private receipt are different entries. Neither creates
 * a fictitious SIXFL bank receipt or reduces the team's own fixture charge. */
export async function adjustPlayerLedgerBalance(input: { teamId:string; feeId:string; amountPence:number; kind:"WAIVER"|"CAPTAIN_RECEIPT"; reason:string; actorUserId:string; requestKey:string }) {
  if(!input.actorUserId||!input.reason.trim()||!Number.isSafeInteger(input.amountPence)||input.amountPence<=0||!input.requestKey) throw new PlayerLedgerError("Enter the amount, reason and person recording this action.");
  return prisma.$transaction(async db=>{
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${input.teamId} FOR UPDATE`);
    await lockLedgerFees(db,[input.feeId]);
    const prior=await db.playerLedgerEntry.findUnique({where:{sourceKey:`manual:${input.requestKey}`}});
    if(prior) {
      if(prior.feeId!==input.feeId||prior.teamId!==input.teamId||prior.actorUserId!==input.actorUserId||prior.amountPence!==-input.amountPence||prior.kind!==input.kind) throw new PlayerLedgerError("This action reference has already been used for a different adjustment.");
      return;
    }
    const s=await readPlayerLedgerState(input.feeId,db);
    if(!s||s.teamId!==input.teamId||input.amountPence>s.balancePence) throw new PlayerLedgerError("The amount exceeds the player's remaining balance. Refresh before trying again.");
    await assertNoOpenRequest(db,[input.feeId],s.planId);
    const fee=await db.playerMatchFee.findUniqueOrThrow({where:{id:input.feeId},include:{fixture:{select:{publishedAt:true,status:true}}}});
    if(!s.controlled&&!basicRepaymentFee(fee)) throw new PlayerLedgerError("This fee has a special concession or credit. Use the existing SIXFL adjustment controls.");
    await db.playerFeeLedgerState.update({where:{feeId:s.feeId},data:{controlled:true}});
    const receipt=input.kind==="CAPTAIN_RECEIPT"?input.amountPence:0;
    const balance=s.balancePence-input.amountPence;
    await setLedgerContext(db,{feeId:s.feeId,kind:input.kind,actorUserId:input.actorUserId,reason:input.reason,receiptPence:receipt,
      receivedBy:input.kind==="CAPTAIN_RECEIPT"?"CAPTAIN":undefined,sourceKey:`manual:${input.requestKey}`});
    await db.playerMatchFee.update({where:{id:s.feeId},data:{amountPence:balance>0?balance:s.receivedPence+s.captainReceivedPence+receipt,
      status:balance>0?"OPEN":s.receivedPence+s.captainReceivedPence+receipt>0?"PAID":"WAIVED",
      paidAt:balance===0?new Date():null,note:[fee.note,`${input.kind==="CAPTAIN_RECEIPT"?"Payment received by captain (not SIXFL)":"Player balance reduced"}: ${money(input.amountPence)}. ${input.reason}`].filter(Boolean).join("\n")}});
    if (s.planId) await advanceRepaymentProgress(db, s.planId, receipt);
  },{maxWait:5000,timeout:15000});
}

export async function pausePlayerFeeCollection(input:{teamId:string;feeIds:string[];paused:boolean;actorUserId:string}){
  await prisma.$transaction(async db=>{
    await db.$queryRaw(Prisma.sql`SELECT id FROM "Team" WHERE id=${input.teamId} FOR UPDATE`);
    await lockLedgerFees(db,input.feeIds);
    const states=await db.playerFeeLedgerState.findMany({where:{teamId:input.teamId,feeId:{in:input.feeIds}}});
    if(states.length!==new Set(input.feeIds).size) throw new PlayerLedgerError("Player fees do not belong to this team.");
    await db.playerFeeLedgerState.updateMany({where:{teamId:input.teamId,feeId:{in:input.feeIds}},data:{collectionPaused:input.paused}});
    for(const s of states) await db.playerLedgerEntry.create({data:{feeId:s.feeId,teamId:input.teamId,kind:"COLLECTION",amountPence:0,balanceAfterPence:s.balancePence,
      actorUserId:input.actorUserId,reason:input.paused?"Payment link paused. Debt has not been waived.":"Payment link resumed. Debt unchanged."}});
  });
}

/** At the shared provider boundary, suppress old demands while a plan is in
 * force even if a message was already queued before the captain saved it. */
export async function playerLedgerNotificationBlock(dispatch:{sourceType:string|null;sourceId:string|null}){
  if(!dispatch.sourceId||!["PLAYER_MATCH_FEE_REQUEST","PLAYER_MATCH_FEE_CHASE_24H","PLAYER_MATCH_FEE_CHASE_72H","PLAYER_MATCH_FEE_WARNING","TEMPORARY_PLAYER_MATCH_FEE_REQUEST"].includes(dispatch.sourceType??"")) return null;
  return playerFeeCollectionHold(dispatch.sourceId);
}

export const newLedgerActionKey=()=>randomUUID();

export async function advanceRepaymentProgress(db: LedgerDb, planId: string, paidPence: number, paidAt = new Date()) {
  const plan = await db.playerRepaymentPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  const states = await db.playerFeeLedgerState.findMany({ where: { planId } });
  const remaining = states.reduce((sum,s)=>sum+s.balancePence,0);
  if (!remaining) { await db.playerRepaymentPlan.update({where:{id:planId},data:{status:"COMPLETED",instalmentPaidPence:0,activeRequestId:null}}); return; }
  const progress = plan.instalmentPaidPence + paidPence;
  const cycleTarget = repaymentAmount({instalmentPence:plan.instalmentPence,instalmentPaidPence:0},remaining+paidPence+plan.instalmentPaidPence);
  if (progress >= cycleTarget && paidPence>0) {
    const next = new Date(Math.max(plan.nextDueAt.getTime(),paidAt.getTime())+plan.intervalDays*86400000);
    await db.playerRepaymentPlan.update({where:{id:planId},data:{instalmentPaidPence:0,nextDueAt:next,activeRequestId:null,version:{increment:1}}});
  } else if (paidPence>0) {
    await db.playerRepaymentPlan.update({where:{id:planId},data:{instalmentPaidPence:progress,activeRequestId:null,version:{increment:1}}});
  }
}

export function repaymentAmount(plan: { instalmentPence:number; instalmentPaidPence:number }, balance:number) {
  let amount = Math.min(Math.max(plan.instalmentPence-plan.instalmentPaidPence,0),balance);
  // Do not silently exceed the agreed instalment or leave a sub-50p online remainder.
  if (balance>amount && balance-amount<50) amount=balance-50;
  return amount;
}

export async function getPlayerLedgerSummaryForUser(teamId:string,userId:string) {
  const rows=await prisma.$queryRaw<Array<{anchorFeeId:string|null;balancePence:number;receivedPence:number}>>(Prisma.sql`
    SELECT MIN(s."feeId") AS "anchorFeeId",COALESCE(SUM(s."balancePence"),0)::int AS "balancePence",
      COALESCE(SUM(s."receivedPence"+s."captainReceivedPence"),0)::int AS "receivedPence"
    FROM "PlayerFeeLedgerState" s WHERE s."teamId"=${teamId} AND (s."userId"=${userId} OR s."prospectId" IN (
      SELECT p."sourceProspectId" FROM "TeamMemberProfile" p JOIN "TeamMember" m ON m.id=p."teamMemberId"
      WHERE m."teamId"=${teamId} AND p."sourceProspectId" IS NOT NULL GROUP BY p."sourceProspectId"
      HAVING COUNT(DISTINCT m."userId")=1 AND MIN(m."userId")=${userId}))`);
  return rows[0]??{anchorFeeId:null,balancePence:0,receivedPence:0};
}
