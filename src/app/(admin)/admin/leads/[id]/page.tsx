// ========================================
// File: src/app/(admin)/admin/leads/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  type InterestType,
  type LeadStatus,
  type LeagueType,
  type PreferredNight,
  type TemplateAudience,
} from "@prisma/client";

import ConvertLeadToManagedSquadForm from "@/components/admin/leads/ConvertLeadToManagedSquadForm";
import ConvertLeadToRefereeForm from "@/components/admin/leads/ConvertLeadToRefereeForm";
import ConvertLeadToTeamButton from "@/components/admin/leads/ConvertLeadToTeamButton";
import DeleteLeadButton from "@/components/admin/leads/DeleteLeadButton";
import LeadEmailForm from "@/components/admin/leads/LeadEmailForm";
import LeadSmsForm from "@/components/admin/leads/LeadSmsForm";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    managedSquadAdded?: string;
    managedTeamId?: string;
    existingProspect?: string;
    prospect?: string;
    joinEmail?: string;
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function formatInterestType(type: InterestType) {
  if (type === "TEAM") return "Team";
  if (type === "PLAYER") return "Player";
  return "Referee";
}

function formatLeadStatus(status: LeadStatus) {
  if (status === "NEW") return "New";
  if (status === "CONTACTED") return "Contacted";
  if (status === "QUALIFIED") return "Qualified";
  return "Closed";
}

function formatLeagueType(type: LeagueType | null) {
  if (!type) return "—";
  if (type === "MENS") return "Men’s";
  if (type === "WOMENS") return "Women’s";
  return "Youth";
}

function formatPreferredNight(night: PreferredNight) {
  if (night === "ANY") return "Any";
  return night.charAt(0) + night.slice(1).toLowerCase();
}

function formatPreferredNights(values: Array<{ night: PreferredNight }>) {
  const nights = Array.from(new Set(values.map((value) => value.night)));
  if (nights.length === 0 || nights.includes("ANY")) return nights.length ? "Any" : "—";
  return nights.map(formatPreferredNight).join(", ");
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function getEmailTemplateAudiences(interestType: InterestType): TemplateAudience[] {
  if (interestType === "PLAYER") return ["LEAD", "PLAYER"];
  if (interestType === "REFEREE") return ["LEAD", "REFEREE"];
  return ["LEAD"];
}

function getSmsTemplateAudiences(interestType: InterestType): NotificationAudience[] {
  if (interestType === "PLAYER") {
    return [NotificationAudience.LEAD, NotificationAudience.PLAYER];
  }
  return [NotificationAudience.LEAD];
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
        {label}
      </div>
      <div className="mt-1 break-words text-sm leading-relaxed text-white/85">
        {value || "—"}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  children,
  tone = "default",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  tone?: "default" | "danger" | "success" | "warning";
}) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-500/20 bg-rose-500/5"
      : tone === "success"
        ? "border-emerald-500/20 bg-emerald-500/5"
        : tone === "warning"
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-white/10 bg-black/20";

  return (
    <div className={`rounded-2xl border p-6 ${toneClasses}`}>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

async function loadEmailTemplates(interestType: InterestType) {
  try {
    return await prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: { in: getEmailTemplateAudiences(interestType) },
        OR: [{ interestType: null }, { interestType }],
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        body: true,
        description: true,
        interestType: true,
      },
    });
  } catch (error) {
    console.error("Lead page email templates could not be loaded", error);
    return [];
  }
}

async function loadSmsTemplates(interestType: InterestType) {
  try {
    return await prisma.notificationTemplate.findMany({
      where: {
        channel: NotificationChannel.SMS,
        audience: { in: getSmsTemplateAudiences(interestType) },
        isActive: true,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        body: true,
        description: true,
      },
    });
  } catch (error) {
    console.error("Lead page SMS templates could not be loaded", error);
    return [];
  }
}

async function loadManagedTeams() {
  try {
    return await prisma.team.findMany({
      where: { teamMode: "MANAGED" },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: { select: { name: true, season: true } },
      },
    });
  } catch (error) {
    console.error("Lead page managed teams could not be loaded", error);
    return [];
  }
}

export default async function LeadPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const lead = await prisma.interestLead.findUnique({
    where: { id },
    include: {
      league: { select: { slug: true } },
      preferredNights: { orderBy: { createdAt: "asc" } },
      emails: { orderBy: { sentAt: "desc" } },
      convertedTeam: { select: { id: true, name: true } },
    },
  });

  if (!lead) notFound();

  const [emailTemplates, smsTemplates, managedTeams] = await Promise.all([
    loadEmailTemplates(lead.interestType),
    loadSmsTemplates(lead.interestType),
    loadManagedTeams(),
  ]);

  const canConvertToTeam = lead.interestType === "TEAM";
  const canConvertToReferee = lead.interestType === "REFEREE";
  const canConvertToManagedSquad = lead.interestType === "PLAYER";
  const alreadyConverted = Boolean(lead.convertedAt || lead.convertedTeamId);
  const hasEmail = Boolean(lead.email?.trim());
  const hasPhone = Boolean(lead.phone?.trim());

  const signupUrl = lead.league?.slug
    ? `https://www.sixfl.co.uk/leagues/${lead.league.slug}`
    : "https://www.sixfl.co.uk/register-interest";

  const managedTeamOptions = managedTeams.map((team) => ({
    value: team.id,
    label: team.league?.name
      ? `${team.name} • ${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
      : team.name,
  }));

  const selectedManagedTeam = sp.managedTeamId
    ? managedTeams.find((team) => team.id === sp.managedTeamId) ?? null
    : null;

  const managedSquadNotice =
    sp.managedSquadAdded === "1"
      ? sp.existingProspect === "1"
        ? `This player was already on ${selectedManagedTeam?.name ?? "that managed squad"}; the existing squad record was reused.`
        : `Player added to ${selectedManagedTeam?.name ?? "the managed squad"} successfully.`
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-white/60">Admin • Lead</p>
          <h1 className="mt-2 text-3xl font-black text-white">
            {lead.contactName || "Unnamed lead"}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
              {formatInterestType(lead.interestType)}
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">
              {formatLeadStatus(lead.status)}
            </span>
            {alreadyConverted ? (
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-100">
                Converted
              </span>
            ) : null}
          </div>
          <div className="mt-3 space-y-1 text-sm text-white/70">
            <div>{lead.email || "No email address"}</div>
            <div>{lead.phone || "No phone number"}</div>
            <div>{lead.area || "No area set"}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/leads/${lead.id}/edit#edit-lead-details`}
            className="inline-flex h-11 items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-100"
          >
            Edit lead
          </Link>
          <Link
            href="/admin/leads"
            className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/80"
          >
            Back to leads
          </Link>
        </div>
      </div>

      {managedSquadNotice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {managedSquadNotice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-2xl font-bold text-white">Lead details</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <DetailRow label="Contact" value={lead.contactName} />
              <DetailRow label="Email" value={lead.email} />
              <DetailRow label="Phone" value={lead.phone} />
              <DetailRow label="Area" value={lead.area} />
              <DetailRow label="Team name" value={lead.teamName} />
              <DetailRow label="League type" value={formatLeagueType(lead.leagueType)} />
              <DetailRow label="Preferred nights" value={formatPreferredNights(lead.preferredNights)} />
              <DetailRow label="Free kit" value={formatYesNo(lead.wantsFreeKit)} />
              <DetailRow label="Marketing consent" value={formatYesNo(lead.marketingConsent)} />
              <DetailRow label="Source" value={lead.source} />
            </div>
            {lead.message ? (
              <div className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/80">
                {lead.message}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-2xl font-bold text-white">Email history</h2>
            <p className="mt-2 text-sm text-white/55">
              {lead.emails.length} recorded email{lead.emails.length === 1 ? "" : "s"}.
            </p>
            <div className="mt-4 space-y-3">
              {lead.emails.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                  No emails recorded yet.
                </div>
              ) : null}
              {lead.emails.map((email) => (
                <div key={email.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="font-semibold text-white">{email.subject}</div>
                  <div className="mt-1 text-xs text-white/40">{formatDate(email.sentAt)}</div>
                  <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-white/70">
                    {email.body}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          {canConvertToManagedSquad ? (
            <ActionCard
              title="Add to managed squad"
              description="Choose the managed team. This creates or reuses the player’s squad prospect record and closes the lead."
              tone="success"
            >
              {managedTeamOptions.length ? (
                <ConvertLeadToManagedSquadForm leadId={lead.id} teams={managedTeamOptions} />
              ) : (
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Managed teams could not be loaded. The lead page remains available; check the server log entry “Lead page managed teams could not be loaded”.
                </div>
              )}
            </ActionCard>
          ) : null}

          {canConvertToTeam ? (
            <ActionCard title="Convert to team" description="Create a team and assign this contact as captain." tone="success">
              <ConvertLeadToTeamButton
                leadId={lead.id}
                alreadyConverted={alreadyConverted}
                convertedTeamId={lead.convertedTeamId}
              />
              {lead.convertedTeam ? (
                <Link href={`/admin/teams/${lead.convertedTeam.id}`} className="mt-3 inline-flex text-sm font-semibold text-emerald-200">
                  Open {lead.convertedTeam.name}
                </Link>
              ) : null}
            </ActionCard>
          ) : null}

          {canConvertToReferee ? (
            <ActionCard title="Convert to referee" description="Create or update a referee account from this lead." tone="warning">
              <ConvertLeadToRefereeForm leadId={lead.id} alreadyConverted={alreadyConverted} />
            </ActionCard>
          ) : null}

          <ActionCard title="Send email" description={hasEmail ? "Send a saved template or direct email." : "No email address is stored."}>
            {hasEmail ? (
              <LeadEmailForm
                leadId={lead.id}
                email={lead.email}
                firstName={lead.contactName}
                fullName={lead.contactName}
                area={lead.area}
                signupUrl={signupUrl}
                templates={emailTemplates}
                managedTeamOptions={managedTeamOptions}
                showTeamConfirmationShortcut={canConvertToTeam}
              />
            ) : (
              <div className="text-sm text-amber-100">Add an email address before sending email.</div>
            )}
          </ActionCard>

          <ActionCard title="Send SMS" description={hasPhone ? "Send a saved template or direct SMS." : "No mobile number is stored."}>
            {hasPhone ? (
              <LeadSmsForm
                leadId={lead.id}
                phone={lead.phone}
                firstName={lead.contactName}
                fullName={lead.contactName}
                area={lead.area}
                signupUrl={signupUrl}
                templates={smsTemplates}
              />
            ) : (
              <div className="text-sm text-amber-100">Add a phone number before sending SMS.</div>
            )}
          </ActionCard>

          <ActionCard title="Danger zone" description="Delete spam, duplicate, or test leads." tone="danger">
            <DeleteLeadButton leadId={lead.id} leadName={lead.contactName} />
          </ActionCard>
        </div>
      </div>
    </div>
  );
}
