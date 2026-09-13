import Link from "next/link";
import { prisma } from "@/lib/prisma";
/** An owned dashboard notice; response permission is still checked on the destination. */
export default async function CupInvitationNotice({teamId,userId}:{teamId:string;userId:string}) {
  const membership=await prisma.teamMember.findFirst({where:{teamId,userId,role:"CAPTAIN"},select:{id:true}});
  if(!membership)return null;
  const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT i.id FROM "CupInvitation" i
    JOIN "CupInvitationSettings" s ON s."cupLeagueId"=i."cupLeagueId"
    JOIN "League" l ON l.id=i."cupLeagueId" JOIN "LeagueCompetition" c ON c.id=l."competitionId"
    WHERE i."teamId"=${teamId} AND i.response='PENDING' AND i."settingsVersion"=s.version
      AND s.state='OPEN' AND s."responseDeadline">NOW() AND l."isActive" AND c."isActive"
      AND NOT EXISTS (SELECT 1 FROM "LeagueSeasonTeam" e WHERE e."teamId"=${teamId} AND e."leagueId"=i."cupLeagueId")`;
  if(!rows.length)return null;
  return <aside className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4"><p className="font-semibold text-emerald-100">Your team has {rows.length} cup invitation{rows.length===1?"":"s"} awaiting a response</p><Link href={`/captain/team/${teamId}/cup-invitations`} className="mt-2 inline-block text-sm text-emerald-200 underline">View details and respond Yes / No</Link></aside>;
}
