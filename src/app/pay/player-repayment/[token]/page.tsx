import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PlayerRepaymentPanel from "@/components/payments/PlayerRepaymentPanel";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{error?:string;payment?:string}>}){
  const {token}=await params;const sp=await searchParams;
  if(!/^[a-f0-9]{48}$/.test(token)||!await prisma.playerRepaymentPlan.findUnique({where:{token},select:{id:true}}))notFound();
  return <PlayerRepaymentPanel planToken={token} message={sp.error||(sp.payment==="received"?"Payment submitted. Your balance updates when Stripe confirms receipt; refresh shortly if it is still processing.":undefined)}/>;
}
