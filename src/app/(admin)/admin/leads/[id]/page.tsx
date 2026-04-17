// ========================================
// File: src/app/(admin)/admin/leads/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationAudience, NotificationChannel } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import LeadEmailForm from "@/components/admin/leads/LeadEmailForm";
import LeadSmsForm from "@/components/admin/leads/LeadSmsForm";
import DeleteLeadButton from "@/components/admin/leads/DeleteLeadButton";
import ConvertLeadToTeamButton from "@/components/admin/leads/ConvertLeadToTeamButton";
import ConvertLeadToRefereeForm from "@/components/admin/leads/ConvertLeadToRefereeForm";
import ConvertLeadToManagedSquadForm from "@/components/admin/leads/ConvertLeadToManagedSquadForm";
import type {
  InterestType,
  LeadStatus,
  LeagueType,
  PreferredNight,
  TemplateAudience,
} from "@prisma/client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    managedSquadAdded?: string;
    managedTeamId?: string;
    existingProspect?: string;
    prospect?: string;
  }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
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

function formatPreferredNights(
  values: Array<{ night: PreferredNight }> | PreferredNight[],
) {
  const nights = values.map((value) =>
    typeof value === "string" ? value : value.night,
  );

  if (!nights.length) return "—";

  const uniqueNights = Array.from(new Set(nights));

  if (uniqueNights.includes("ANY")) {
    return "Any";
  }

  return uniqueNights.map(formatPreferredNight).join(", ");
}

function formatYesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function statusClasses(status: LeadStatus) {
  if (status === "NEW") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "CONTACTED") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  }

  if (status === "QUALIFIED") {
    return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  }

  return "border-white/10 bg-white/5 text-white/70";
}

function typeClasses(type: InterestType) {
  if (type === "TEAM") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }

  if (type === "PLAYER") {
    return "border-white/10 bg-white/5 text-white";
  }

  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-sm leading-6 text-white/65">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default async function LeadPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const lead = await prisma.interestLead.findUnique({
    where: { id },
    include: {
      league: {
        select: {
          slug: true,
        },
      },
      preferredNights: {
        orderBy: { createdAt: "asc" },
      },
      emails: {
        orderBy: { sentAt: "desc" },
      },
      convertedTeam: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!lead) {
    notFound();
  }

  const [emailTemplates, smsTemplates, managedTeams] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: "LEAD" satisfies TemplateAudience,
        OR: [{ interestType: null }, { interestType: lead.interestType }],
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
        ctaLabel: true,
        ctaUrlKey: true,
      },
    }),
    prisma.notificationTemplate.findMany({
      where: {
        channel: NotificationChannel.SMS,
        audience: NotificationAudience.LEAD,
        isActive: true,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        body: true,
        description: true,
        ctaUrlKey: true,
      },
    }),
    prisma.team.findMany({
      where: {
        teamMode: "MANAGED",
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        joinSlug: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
  ]);

  const emailCount = lead.emails.length;
  const latestEmail = lead.emails[0];
  const alreadyConverted = Boolean(lead.convertedAt || lead.convertedTeamId);
  const canConvertToTeam = lead.interestType === "TEAM";
  const canConvertToReferee = lead.interestType === "REFEREE";
  const canConvertToManagedSquad = lead.interestType === "PLAYER";
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

  const managedTeamSmsOptions = managedTeams
    .filter((team) => Boolean(team.joinSlug))
    .map((team) => ({
      value: team.id,
      label: team.league?.name
        ? `${team.name} • ${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
        : team.name,
      joinUrl: team.joinSlug
        ? `https://www.sixfl.co.uk/teams/join/${team.joinSlug}`
        : null,
    }));

  const selectedManagedTeam = sp.managedTeamId
    ? managedTeams.find((team) => team.id === sp.managedTeamId) ?? null
    : null;

  const managedSquadNotice =
    sp.managedSquadAdded === "1"
      ? sp.existingProspect === "1"
        ? selectedManagedTeam
          ? `This player was already on ${selectedManagedTeam.name}, so the existing squad prospect was reused.`
          : "This player was already on that managed squad, so the existing squad prospect was reused."
        : selectedManagedTeam
          ? `Player lead added to ${selectedManagedTeam.name} successfully.`
          : "Player lead added to the managed squad successfully."
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-white/60">Admin • Lead</p>

          <h1 className="mt-2 text-3xl font-black text-white">
            {lead.contactName || "Unnamed lead"}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold ${typeClasses(
                lead.interestType,
              )}`}
            >
              {formatInterestType(lead.interestType)}
            </span>

            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                lead.status,
              )}`}
            >
              {formatLeadStatus(lead.status)}
            </span>

            {alreadyConverted ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                Converted
              </span>
            ) : null}

            {hasPhone && !hasEmail ? (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                SMS only
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-1 text-sm text-white/70">
            <div>{lead.email || "No email address"}</div>
            <div>{lead.phone || "No phone number"}</div>
            <div>{lead.area || "No area set"}</div>
          </div>
        </div>

        <Link
          href="/admin/leads"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Back to leads
        </Link>
      </div>

      {managedSquadNotice ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {managedSquadNotice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-lg font-bold text-white">Lead details</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Type"
                value={formatInterestType(lead.interestType)}
              />
              <DetailRow
                label="Status"
                value={formatLeadStatus(lead.status)}
              />
              <DetailRow label="Area" value={lead.area ?? "—"} />
              <DetailRow
                label="League type"
                value={formatLeagueType(lead.leagueType)}
              />
              <DetailRow
                label="Preferred nights"
                value={formatPreferredNights(lead.preferredNights)}
              />
              <DetailRow label="Phone" value={lead.phone ?? "—"} />
              <DetailRow label="Email" value={lead.email ?? "—"} />
              <DetailRow label="Team name" value={lead.teamName ?? "—"} />
              <DetailRow
                label="Free kit interest"
                value={formatYesNo(lead.wantsFreeKit)}
              />
              <DetailRow
                label="Marketing consent"
                value={formatYesNo(lead.marketingConsent)}
              />
              <DetailRow label="Source" value={lead.source ?? "—"} />
              <DetailRow label="Created" value={formatDate(lead.createdAt)} />
              <DetailRow
                label="Converted"
                value={lead.convertedAt ? formatDate(lead.convertedAt) : "—"}
              />
              <DetailRow
                label="Converted team"
                value={lead.convertedTeam?.name ?? "—"}
              />
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                Message
              </p>

              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/80">
                {lead.message ?? "—"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Email history</h2>
                <p className="mt-1 text-sm text-white/60">
                  Full audit trail of emails sent to this lead.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  Total emails
                </div>
                <div className="mt-1 text-lg font-black text-white">
                  {emailCount}
                </div>
              </div>
            </div>

            {latestEmail ? (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
                  Latest email
                </div>

                <div className="mt-2 text-sm font-semibold text-white">
                  {latestEmail.subject}
                </div>

                <div className="mt-1 text-xs text-white/55">
                  Sent {formatDate(latestEmail.sentAt)}
                  {latestEmail.sentTo ? ` • ${latestEmail.sentTo}` : ""}
                </div>
              </div>
            ) : null}

            {lead.emails.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-white/60">No emails sent yet.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {lead.emails.map((email, index) => (
                  <div
                    key={email.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
                            #{emailCount - index}
                          </span>

                          <span className="text-sm font-semibold text-white">
                            {email.subject}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                          <span>Sent {formatDate(email.sentAt)}</span>

                          {email.sentTo ? (
                            <span>
                              To:{" "}
                              <a
                                href={`mailto:${email.sentTo}`}
                                className="text-emerald-300 hover:text-emerald-200"
                              >
                                {email.sentTo}
                              </a>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                        Message body
                      </div>

                      <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/80">
                        {email.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_42%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
            <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Quick actions
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Manage this lead
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Handle conversion, cleanup, and direct outreach from one
                  action rail.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {canConvertToTeam ? (
                <ActionCard
                  title="Convert to team"
                  description="Create a real team from this lead, assign the contact as the captain, and close the lead."
                  tone="success"
                >
                  <ConvertLeadToTeamButton
                    leadId={lead.id}
                    alreadyConverted={alreadyConverted}
                    convertedTeamId={lead.convertedTeamId}
                  />

                  {alreadyConverted && lead.convertedTeam ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                      Converted to{" "}
                      <Link
                        href={`/admin/teams/${lead.convertedTeam.id}`}
                        className="font-semibold text-emerald-300 hover:text-emerald-200"
                      >
                        {lead.convertedTeam.name}
                      </Link>
                      {lead.convertedAt
                        ? ` on ${formatDate(lead.convertedAt)}`
                        : ""}
                      .
                    </div>
                  ) : null}
                </ActionCard>
              ) : null}

              {canConvertToManagedSquad ? (
                <ActionCard
                  title="Add to managed squad"
                  description="Turn this player lead into a managed squad prospect. This creates a squad record on the selected managed team and closes the lead."
                  tone="success"
                >
                  <ConvertLeadToManagedSquadForm
                    leadId={lead.id}
                    teams={managedTeamOptions}
                  />
                </ActionCard>
              ) : null}

              {canConvertToReferee ? (
                <ActionCard
                  title="Convert to referee"
                  description="Create or update a real referee user from this lead so they can be assigned directly in fixtures."
                  tone="warning"
                >
                  <ConvertLeadToRefereeForm
                    leadId={lead.id}
                    alreadyConverted={alreadyConverted}
                  />
                </ActionCard>
              ) : null}

              <ActionCard
                title="Send email"
                description={
                  hasEmail
                    ? "Use a saved template or write a direct reply to this lead from the admin console."
                    : "This lead does not currently have an email address, so email sending is unavailable."
                }
              >
                {hasEmail ? (
                  <LeadEmailForm
                    leadId={lead.id}
                    email={lead.email}
                    firstName={lead.contactName}
                    fullName={lead.contactName}
                    area={lead.area}
                    signupUrl={signupUrl}
                    templates={emailTemplates}
                  />
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/85">
                    No email address is stored for this lead yet. Use the phone
                    number for SMS or add an email address before sending an
                    email from this screen.
                  </div>
                )}
              </ActionCard>

              <ActionCard
                title="Send SMS"
                description={
                  hasPhone
                    ? "Use a saved SMS template or write a direct text message to this lead from the admin console."
                    : "This lead does not currently have a mobile number, so SMS sending is unavailable."
                }
              >
                {hasPhone ? (
                  <LeadSmsForm
                    leadId={lead.id}
                    phone={lead.phone}
                    firstName={lead.contactName}
                    fullName={lead.contactName}
                    area={lead.area}
                    signupUrl={signupUrl}
                    templates={smsTemplates}
                    managedTeamOptions={managedTeamSmsOptions}
                  />
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/85">
                    No mobile number is stored for this lead yet. Add a phone
                    number before sending an SMS from this screen.
                  </div>
                )}
              </ActionCard>

              <ActionCard
                title="Danger zone"
                description="Delete this lead if it is spam, a duplicate, or a test submission."
                tone="danger"
              >
                <DeleteLeadButton
                  leadId={lead.id}
                  leadName={lead.contactName}
                />
              </ActionCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
