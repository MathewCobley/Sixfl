"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCaptain } from "@/lib/requireCaptain";
import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import { adjustPlayerLedgerBalance, changePlayerRepaymentPlan, createPlayerRepaymentPlan, getPlayerLedgerAccount, parseLedgerMoney, pausePlayerFeeCollection, PlayerLedgerError } from "@/lib/payments/player-ledger";
import { cancelPlayerRepaymentCheckout } from "@/lib/payments/player-repayment-checkout";
import { prisma } from "@/lib/prisma";

export async function savePlayerAccountAction(form:FormData){
  const text=(key:string)=>String(form.get(key)??"").trim();
  const teamId=text("teamId"),anchorFeeId=text("anchorFeeId");
  const access=await requireCaptain(teamId);
  if(!access.user)redirect("/login");
  const actorUserId=access.user.id;
  const path=`/captain/team/${encodeURIComponent(teamId)}/player-payments/account/${encodeURIComponent(anchorFeeId)}`;
  let error:string|null=null;
  try{
    const account=await getPlayerLedgerAccount(teamId,anchorFeeId);
    const action=text("action");
    if(action==="create-plan"){
      const day=text("firstDueDate");
      const firstDueAt=!day||day===toLondonDateInputValue(new Date())?new Date():parseLondonDateTime(day,"09:00");
      if(day&&toLondonDateInputValue(firstDueAt)!==day)throw new PlayerLedgerError("Choose a valid UK date.");
      await createPlayerRepaymentPlan({teamId,anchorFeeId,feeIds:form.getAll("feeId").map(String),instalmentPence:parseLedgerMoney(text("instalment")),firstDueAt,actorUserId,reason:text("reason")});
    }else if(["pause","resume","end"].includes(action)){
      if(!account.plans.some(p=>p.id===text("planId")))throw new PlayerLedgerError("Arrangement does not belong to this player.");
      await changePlayerRepaymentPlan({teamId,planId:text("planId"),action:action as "pause"|"resume"|"end",actorUserId});
    }else if(action==="cancel-checkout"){
      const request=await prisma.playerRepaymentRequest.findFirst({where:{id:text("requestId"),teamId}});
      if(!request||!(request.planId?account.plans.some(p=>p.id===request.planId):account.states.some(s=>s.feeId===request.feeId)))throw new PlayerLedgerError("Checkout does not belong to this player.");
      await cancelPlayerRepaymentCheckout({teamId,requestId:request.id});
    }else if(action==="reduce"||action==="captain-receipt"){
      if(!account.states.some(s=>s.feeId===text("feeId")))throw new PlayerLedgerError("Charge does not belong to this player.");
      await adjustPlayerLedgerBalance({teamId,feeId:text("feeId"),amountPence:parseLedgerMoney(text("amount")),kind:action==="reduce"?"WAIVER":"CAPTAIN_RECEIPT",reason:text("reason"),actorUserId,requestKey:text("requestKey")});
    }else if(action==="resume-fee"){
      if(!account.states.some(s=>s.feeId===text("feeId")))throw new PlayerLedgerError("Charge does not belong to this player.");
      await pausePlayerFeeCollection({teamId,feeIds:[text("feeId")],paused:false,actorUserId});
    }else throw new PlayerLedgerError("Unknown player account action.");
  }catch(e){error=e instanceof PlayerLedgerError?e.message:"The account could not be changed. Refresh and check its history before retrying.";if(!(e instanceof PlayerLedgerError))console.error("Player account action failed",e);}
  for(const p of [path,`/captain/team/${teamId}/player-payments`,`/captain/team/${teamId}/player-payments/accounts`,`/captain/team/${teamId}/payments`,`/player/team/${teamId}`,`/player/team/${teamId}/ledger`])revalidatePath(p);
  redirect(error?`${path}?error=${encodeURIComponent(error)}`:`${path}?saved=1`);
}
