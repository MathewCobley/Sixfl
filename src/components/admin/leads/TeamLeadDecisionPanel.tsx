import { prisma } from "@/lib/prisma";
import { getTeamPlaceConfirmationStatus } from "@/lib/leads/teamPlaceConfirmation";
import TeamLeadDecisionControls from "./TeamLeadDecisionControls";

export default async function TeamLeadDecisionPanel({ leadId }: { leadId: string }) {
  const lead = await prisma.interestLead.findUnique({ where: { id: leadId }, select: { id: true, interestType: true, convertedTeamId: true, contactName: true, teamName: true } });
  if (!lead || lead.interestType !== "TEAM" || lead.convertedTeamId) return null;
  const decision = await getTeamPlaceConfirmationStatus(leadId);
  return <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
    <h2 className="mb-3 text-lg font-semibold text-white">Team enquiry decision</h2>
    <TeamLeadDecisionControls leadId={leadId} leadName={lead.teamName || lead.contactName || "this team"} declined={decision?.status === "DECLINED"} declinedAt={decision?.declinedAt?.toISOString() ?? null} />
  </section>;
}
