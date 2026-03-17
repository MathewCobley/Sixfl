// ========================================
// File: src/app/admin/leads/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import LeadEmailForm from "@/components/admin/leads/LeadEmailForm";
import DeleteLeadButton from "@/components/admin/leads/DeleteLeadButton";
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
    },
  });

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/60">Admin • Lead</p>

          <h1 className="mt-2 text-3xl font-black text-white">
            {lead.contactName}
          </h1>

          <p className="mt-1 text-white/70">{lead.email}</p>
        </div>

        <Link
          href="/admin/leads"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Back to leads
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
          <h2 className="text-lg font-bold text-white">Lead details</h2>

          <div className="mt-4 space-y-3 text-sm text-white/80">
            <div>
              <strong>Type:</strong> {formatInterestType(lead.interestType)}
            </div>

            <div>
              <strong>Status:</strong> {formatLeadStatus(lead.status)}
            </div>

            <div>
              <strong>Area:</strong> {lead.area ?? "—"}
            </div>

            <div>
              <strong>League type:</strong> {formatLeagueType(lead.leagueType)}
            </div>

            <div>
              <strong>Preferred nights:</strong>{" "}
              {formatPreferredNights(lead.preferredNights)}
            </div>

            <div>
              <strong>Phone:</strong> {lead.phone ?? "—"}
            </div>

            <div>
              <strong>Team name:</strong> {lead.teamName ?? "—"}
            </div>

            <div>
              <strong>Free kit interest:</strong>{" "}
              {formatYesNo(lead.wantsFreeKit)}
            </div>

            <div>
              <strong>Marketing consent:</strong>{" "}
              {formatYesNo(lead.marketingConsent)}
            </div>

            <div>
              <strong>Created:</strong> {formatDate(lead.createdAt)}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase text-white/40">Message</p>

            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
              {lead.message ?? "—"}
            </div>
          </div>
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
            <h2 className="text-lg font-bold text-white">Email history</h2>

            {lead.emails.length === 0 ? (
              <p className="mt-3 text-sm text-white/60">No emails sent yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {lead.emails.map((email) => (
                  <div
                    key={email.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-white">
                        {email.subject}
                      </span>

                      <span className="text-white/50">
                        {formatDate(email.sentAt)}
                      </span>
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-sm text-white/80">
                      {email.body}
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