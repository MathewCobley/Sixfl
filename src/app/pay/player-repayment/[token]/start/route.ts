import { NextResponse } from "next/server";
import { startPlayerRepaymentCheckout } from "@/lib/payments/player-repayment-checkout";
import { PlayerLedgerError } from "@/lib/payments/player-ledger";
import { getPublicSiteUrl } from "@/lib/stripe/client";
export const dynamic="force-dynamic";
export async function POST(_request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  try{return NextResponse.redirect(await startPlayerRepaymentCheckout({planToken:token}),303);}
  catch(error){
    const url=new URL(`/pay/player-repayment/${encodeURIComponent(token)}`,getPublicSiteUrl());
    url.searchParams.set("error",error instanceof PlayerLedgerError?error.message:"Checkout could not be confirmed. Check your account and retry this same link, or contact SIXFL before making another payment.");
    if(!(error instanceof PlayerLedgerError))console.error("Player repayment checkout",error);
    return NextResponse.redirect(url,303);
  }
}
