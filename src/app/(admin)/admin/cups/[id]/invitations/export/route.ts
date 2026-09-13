import { requireAdmin } from "@/lib/requireAdmin";
import { getCupInvitationReport } from "@/lib/cups/invitations";
import { csvCell,cupDate,filterCupRows,responseLabel } from "@/lib/cups/invitation-policy";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const access=await requireAdmin(),{id}=await params,p=new URL(request.url).searchParams;
  const report=await getCupInvitationReport(id,access.user?.id||""),rows=filterCupRows(report.rows,{q:p.get("q")||"",league:p.get("league")||"",response:p.get("response")||""});
  const lines=[["Team","League","Response","Entry","Responded at","Responded by","Last reminder","Delivery problems"],...rows.map(r=>[r.teamName,r.sourceLeagueName,responseLabel(r.response),r.entered?"Confirmed":r.withdrawn?"Withdrawn":"Not confirmed",cupDate(r.invitation?.respondedAt||null),r.invitation?.respondedByName,cupDate(r.invitation?.lastReminderAt||null),r.deliveryProblem?"Yes":"No"])];
  return new Response('\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n'),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="cup-responses.csv"',"Cache-Control":"no-store"}});
}
