// ========================================
// File: src/components/admin/teams/AdminProspectCard.tsx
// ========================================

import Link from "next/link";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  convertAdminProspectToMemberAction,
  updateAdminProspectDetailsAction,
  updateAdminProspectNotesAction,
  updateAdminProspectStatusAction,
} from "@/app/(admin)/admin/teams/[id]/prospects/actions";

type Prospect = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown;
  availabilitySummary: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE_SQUAD", label: "Active squad" },
  { value: "BACKUP", label: "Backup" },
  { value: "DECLINED", label: "Declined" },
] as const;

function getProspectName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ");
}

function getPreferredNightsDisplay(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const nights = value.filter((item): item is string => typeof item === "string");
  return nights.length > 0 ? nights.join(", ") : null;
}

function getStatusLabel(status: string) {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return option?.label ?? status;
}

function getStatusClasses(status: string) {
  switch (status) {
    case "NEW":
      return "border-white/10 bg-white/5 text-white/75";
    case "CONTACTED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "TRIAL":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "ACTIVE_SQUAD":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "BACKUP":
      return "border-violet-400/25 bg-violet-500/10 text-violet-100";
    case "DECLINED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function countCompletedProfileFields(prospect: Prospect) {
  const preferredNights = Array.isArray(prospect.preferredNights)
    ? prospect.preferredNights.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const values = [
    prospect.ageBand,
    prospect.preferredPositions,
    prospect.experienceSummary,
    prospect.availabilityLevel,
    preferredNights.length > 0 ? preferredNights.join(", ") : null,
    prospect.availabilitySummary,
  ];

  return values.filter((value) => typeof value === "string" && value.trim().length > 0).length;
}

function hasCompletedProspectForm(prospect: Prospect) {
  return countCompletedProfileFields(prospect) >= 4;
}

function getCompletionBadgeClasses(isComplete: boolean) {
  return isComplete
    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
    : "border-white/10 bg-white/5 text-white/60";
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminProspectCard({
  teamId,
  prospect,
}: {
  teamId: string;
  prospect: Prospect;
}) {
  const preferredNights = getPreferredNightsDisplay(prospect.preferredNights);
  const isFormComplete = hasCompletedProspectForm(prospect);
  const completionScore = countCompletedProfileFields(prospect);

  return (
    <div className="space-y-5 px-6 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-white">
              {getProspectName({
                firstName: prospect.firstName,
                lastName: prospect.lastName,
              })}
            </div>

            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(
                prospect.status,
              )}`}
            >
              {getStatusLabel(prospect.status)}
            </span>

            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getCompletionBadgeClasses(
                isFormComplete,
              )}`}
            >
              {isFormComplete ? "Form completed" : "Form not completed"}
            </span>
          </div>

          <div className="mt-2 text-sm text-white/65">
            {prospect.email || "No email"} {prospect.phone ? `· ${prospect.phone}` : ""}
          </div>

          <div className="mt-1 text-xs text-white/45">
            {prospect.source || "No source"} · Added {formatUkDateTime(prospect.createdAt)}
          </div>

          <div className="mt-2 text-xs text-white/50">
            {completionScore}/6 profile fields completed · Updated {formatUkDateTime(prospect.updatedAt)}
          </div>

          {prospect.ageBand ? (
            <div className="mt-2 text-sm text-white/70">Age band: {prospect.ageBand}</div>
          ) : null}

          {prospect.preferredPositions ? (
            <div className="mt-2 text-sm text-white/70">Position: {prospect.preferredPositions}</div>
          ) : null}

          {prospect.experienceSummary ? (
            <div className="mt-2 text-sm text-white/60">Experience: {prospect.experienceSummary}</div>
          ) : null}

          {prospect.availabilityLevel ? (
            <div className="mt-2 text-sm text-white/60">Availability level: {prospect.availabilityLevel}</div>
          ) : null}

          {preferredNights ? (
            <div className="mt-2 text-sm text-white/60">Preferred nights: {preferredNights}</div>
          ) : null}

          {prospect.availabilitySummary ? (
            <div className="mt-2 text-sm text-white/50">{prospect.availabilitySummary}</div>
          ) : null}
        </div>

        <div className="min-w-[220px]">
          <form action={updateAdminProspectStatusAction} className="min-w-[220px]">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="prospectId" value={prospect.id} />
            <FormListboxField
              name="status"
              value={prospect.status}
              options={STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              placeholder="Select status"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Update status
              </button>
              <Link
                href={`/admin/teams/${teamId}/prospects/${prospect.id}/communications`}
                className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Communications
              </Link>
            </div>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <form action={updateAdminProspectDetailsAction} className="space-y-4">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="prospectId" value={prospect.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-white/60">First name</label>
              <input
                name="firstName"
                type="text"
                defaultValue={prospect.firstName}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/60">Last name</label>
              <input
                name="lastName"
                type="text"
                defaultValue={prospect.lastName ?? ""}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-white/60">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={prospect.email ?? ""}
                placeholder="Add email address"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/60">Phone</label>
              <input
                name="phone"
                type="text"
                defaultValue={prospect.phone ?? ""}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
              />
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Save details
          </button>
        </form>

        <form action={updateAdminProspectNotesAction} className="space-y-3">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="prospectId" value={prospect.id} />

          <textarea
            name="notes"
            rows={6}
            defaultValue={prospect.notes ?? ""}
            placeholder="Internal notes"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60"
          />

          <button
            type="submit"
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Save notes
          </button>
        </form>

        <form action={convertAdminProspectToMemberAction} className="lg:self-start">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="prospectId" value={prospect.id} />
          <button
            type="submit"
            className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
          >
            Promote to squad
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Individual outreach now lives in Communications
            </div>
            <div className="mt-1 text-xs text-white/50">
              Open the central hub for this prospect to view previous messages and send new email or SMS without duplicating history across the page.
            </div>
          </div>

          <Link
            href={`/admin/teams/${teamId}/prospects/${prospect.id}/communications`}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Open communications
          </Link>
        </div>
      </div>
    </div>
  );
}
