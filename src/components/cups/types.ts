import type { previewCupInvitations, sendCupInvitations } from "@/lib/cups/invitations";
export type CupActionState = { error?:string; success?:string; preview?:Awaited<ReturnType<typeof previewCupInvitations>>; teamIds?:string[]; kind?:"INITIAL"|"REMINDER"; results?:Awaited<ReturnType<typeof sendCupInvitations>> };
export type CupAction = (state:CupActionState,form:FormData)=>Promise<CupActionState>;
