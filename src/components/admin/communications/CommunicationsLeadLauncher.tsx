import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getCurrentLeagueOptions } from "@/lib/current-leagues";
import { formatProspectiveLeagueLabel } from "@/lib/leads/prospectiveLeague";
import CommunicationsLeadCampaigns from "./CommunicationsLeadCampaigns";

/** Read-only options for the Comms-owned lead workspace. No recipient is selected
 * until the administrator applies the filters in the client component. */
export default async function CommunicationsLeadLauncher() {
  await requireAdmin();
  const [areaRows, leagues, emailTemplates, smsTemplates, managedTeams] = await Promise.all([
    prisma.interestLead.findMany({ where: { area: { not: null } }, distinct: ["area"], select: { area: true }, orderBy: { area: "asc" } }),
    getCurrentLeagueOptions(),
    prisma.emailTemplate.findMany({
      where: { isActive: true, audience: { in: ["LEAD", "GENERAL"] } },
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, subject: true, body: true, interestType: true, ctaLabel: true, ctaUrlKey: true },
    }),
    prisma.notificationTemplate.findMany({
      where: { isActive: true, channel: "SMS", audience: { in: ["LEAD", "GENERAL"] } },
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, subject: true, body: true, ctaLabel: true, ctaUrlKey: true },
    }),
    prisma.team.findMany({
      where: { teamMode: "MANAGED", isRecruiting: true, joinSlug: { not: null } },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
  ]);
  return (
    <section id="lead-campaigns" className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6 xl:col-span-2 3xl:col-span-5">
      <CommunicationsLeadCampaigns
        areas={areaRows.flatMap(row => row.area?.trim() ? [{ value: row.area, label: row.area }] : [])}
        leagues={leagues.map(league => ({ value: league.id, label: formatProspectiveLeagueLabel(league) }))}
        templates={[
          ...emailTemplates.map(template => ({ ...template, label: template.name, channel: "EMAIL" as const })),
          ...smsTemplates.map(template => ({ ...template, label: template.name, subject: template.subject || "", interestType: null, channel: "SMS" as const })),
        ]}
        managedTeams={managedTeams.map(team => ({ value: team.id, label: team.name }))}
      />
    </section>
  );
}
