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

function ProspectInput({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-white/60">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60 focus:bg-black/30"
      />
    </label>
  );
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
        <div className="min-w-0">
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

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {prospect.ageBand ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                <span className="text-white/45">Age band:</span> {prospect.ageBand}
              </div>
            ) : null}

            {prospect.preferredPositions ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                <span className="text-white/45">Position:</span> {prospect.preferredPositions}
              </div>
            ) : null}

            {prospect.experienceSummary ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                <span className="text-white/45">Experience:</span> {prospect.experienceSummary}
              </div>
            ) : null}

            {prospect.availabilityLevel ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                <span className="text-white/45">Availability:</span> {prospect.availabilityLevel}
              </div>
            ) : null}

            {preferredNights ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60 sm:col-span-2">
                <span className="text-white/45">Preferred nights:</span> {preferredNights}
              </div>
            ) : null}
          </div>

          {prospect.availabilitySummary ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white/60">
              {prospect.availabilitySummary}
            </div>
          ) : null}
        </div>

        <div className="w-full lg:w-[260px] lg:shrink-0">
          <form action={updateAdminProspectStatusAction} className="rounded-2xl border border-white/10 bg-black/20 p-4">
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

      <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Player details
            </div>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Edit readable contact details
            </h3>
            <p className="mt-1 text-sm text-white/55">
              Use this to fix names, missing emails and mobile numbers before promoting the player.
            </p>
          </div>
        </div>

        <form action={updateAdminProspectDetailsAction} className="mt-5 space-y-4">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="prospectId" value={prospect.id} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ProspectInput
              label="First name"
              name="firstName"
              defaultValue={prospect.firstName}
            />

            <ProspectInput
              label="Last name"
              name="lastName"
              defaultValue={prospect.lastName}
            />

            <ProspectInput
              label="Email"
              name="email"
              type="email"
              defaultValue={prospect.email}
              placeholder="Add email address"
            />

            <ProspectInput
              label="Phone"
              name="phone"
              defaultValue={prospect.phone}
              placeholder="Mobile number"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Save details
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <form action={updateAdminProspectNotesAction} className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-5">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="prospectId" value={prospect.id} />

          <label className="block space-y-2">
            <span className="text-sm font-medium text-white/60">Internal notes</span>
            <textarea
              name="notes"
              rows={5}
              defaultValue={prospect.notes ?? ""}
              placeholder="Internal notes"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
            />
          </label>

          <button
            type="submit"
            className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Save notes
          </button>
        </form>

        <form action={convertAdminProspectToMemberAction} className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-4 sm:p-5 xl:self-start">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="prospectId" value={prospect.id} />
          <div className="text-sm font-semibold text-emerald-50">
            Ready for squad?
          </div>
          <p className="mt-2 text-sm leading-6 text-emerald-100/70">
            Promote this player once you are happy with their details.
          </p>
          <button
            type="submit"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
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
