import { requireAdmin } from "@/lib/requireAdmin";
import { assertCupAdmin,loadCup } from "@/lib/cups/invitation-data";
import { prisma } from "@/lib/prisma";
import { cupDate } from "@/lib/cups/invitation-policy";
export default async function CupAuditPage({params}:{params:Promise<{id:string}>}) {
  const access=await requireAdmin();await assertCupAdmin(access.user?.id||"");const {id}=await params;await loadCup(id);
  const audit=await prisma.$queryRaw<Array<{id:string;actorName:string;event:string;createdAt:Date;teamName:string|null;details:unknown}>>`SELECT a.id,a."actorName",a.event,a."createdAt",t.name AS "teamName",a.details FROM "CupInvitationAudit" a LEFT JOIN "Team" t ON t.id=a."teamId" WHERE a."cupLeagueId"=${id} ORDER BY a."createdAt" DESC LIMIT 500`;
  return <section className="space-y-4"><h2 className="text-xl font-semibold">Invitation and entry audit</h2><p className="text-sm text-white/55">Latest 500 events. Previous responses and the details they related to are retained here.</p>{audit.map(a=><details key={a.id} className="rounded-xl border border-white/15 p-4"><summary className="cursor-pointer text-sm">{cupDate(a.createdAt)} · {a.teamName||"Cup setup"} · {a.event.replaceAll('_',' ')} · {a.actorName}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-white/65">{JSON.stringify(a.details,null,2)}</pre></details>)}</section>;
}
