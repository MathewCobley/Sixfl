// ========================================
// File: src/app/admin/leads/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import LeadEmailForm from "@/components/admin/leads/LeadEmailForm";
import DeleteLeadButton from "@/components/admin/leads/DeleteLeadButton";
import ConvertLeadToTeamForm from "@/components/admin/leads/ConvertLeadToTeamForm";
import type {
  InterestType,
  LeadStatus,
  LeagueType,
  PreferredNight,
} from "@prisma/client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(date: Date | null | undefined) {
  if (!date) return "—";

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
  values: Array<{ night: PreferredNight }> | PreferredNight[]
) {
  const nights = values.map((value) =>
    typeof value === "string" ? value : value.night
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

export default async function LeadPage({ params }: PageProps) {
  await requireAdmin();

  const { id } = await params;

  const lead = await prisma.interestLead.findUnique({
    where: { id },
    include: {
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
          claimCode: true,
        },
      },
    },
  });

  if (!lead) {
    return notFound();
  }

  const emailCount = lead.emails.length;
  const latestEmail = lead.emails[0] ?? null;
  const alreadyConverted = Boolean(lead.convertedAt || lead.convertedTeamId);
  const canConvertToTeam = lead.interestType === "TEAM";

  const suggestedTeamName =
    lead.teamName?.trim() ||
    (lead.contactName?.trim() ? `${lead.contactName.trim()} FC` : "");

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
                lead.interestType
              )}`}
            >
              {formatInterestType(lead.interestType)}
            </span>

            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(
                lead.status
              )}`}
            >
              {formatLeadStatus(lead.status)}
            </span>

            {alreadyConverted ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                Converted
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-1 text-sm text-white/70">
            <div>{lead.email || "No email address"}</div>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
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
              <DetailRow label="Updated" value={formatDate(lead.updatedAt)} />
              <DetailRow
                label="Contacted"
                value={formatDate(lead.contactedAt)}
              />
              <DetailRow label="Closed" value={formatDate(lead.closedAt)} />
              <DetailRow
                label="Converted"
                value={formatDate(lead.convertedAt)}
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

          {canConvertToTeam ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-bold text-white">Convert to team</h2>
                <p className="text-sm text-white/65">
                  Create a real team from this lead, assign the contact as the
                  captain, and close the lead.
                </p>
              </div>

              <div className="mt-4">
                <ConvertLeadToTeamForm
                  leadId={lead.id}
                  defaultTeamName={suggestedTeamName}
                  alreadyConverted={alreadyConverted}
                  convertedTeamId={lead.convertedTeamId}
                />
              </div>

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
                  <div className="mt-2 text-xs text-white/55">
                    Claim code: {lead.convertedTeam.claimCode}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          <LeadEmailForm
            leadId={lead.id}
            email={lead.email}
            firstName={lead.contactName}
          />

          {/* DELETE LEAD */}
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
            <h2 className="text-lg font-bold text-red-300">Danger zone</h2>

            <p className="mt-2 text-sm text-red-200/70">
              Delete this lead if it is spam, a duplicate, or a test
              submission.
            </p>

            <div className="mt-4">
              <DeleteLeadButton
                leadId={lead.id}
                leadName={lead.contactName}
              />
            </div>
          </div>

          {/* EMAIL HISTORY */}
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
      </div>
    </div>
  );
}