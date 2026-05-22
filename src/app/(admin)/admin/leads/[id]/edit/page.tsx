// ========================================
// File: src/app/(admin)/admin/leads/[id]/edit/page.tsx
// ========================================

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InterestType, LeadStatus } from "@prisma/client";

import FormListboxField from "@/components/ui/FormListboxField";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Edit Lead | SIXFL",
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "CLOSED", label: "Closed" },
];

const INTEREST_TYPE_OPTIONS: Array<{ value: InterestType; label: string }> = [
  { value: "TEAM", label: "Team" },
  { value: "PLAYER", label: "Player" },
  { value: "REFEREE", label: "Referee" },
];

function cleanNullable(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getLeadStatus(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim().toUpperCase();
  const allowed = STATUS_OPTIONS.map((option) => option.value);
  return allowed.includes(parsed as LeadStatus) ? (parsed as LeadStatus) : "NEW";
}

function getInterestType(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim().toUpperCase();
  const allowed = INTEREST_TYPE_OPTIONS.map((option) => option.value);
  return allowed.includes(parsed as InterestType) ? (parsed as InterestType) : "TEAM";
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-white/60">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
      />
    </label>
  );
}

async function updateLeadDetailsAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = cleanNullable(formData.get("email"))?.toLowerCase() ?? null;
  const phone = cleanNullable(formData.get("phone"));
  const status = getLeadStatus(formData.get("status"));
  const interestType = getInterestType(formData.get("interestType"));

  if (!leadId) {
    redirect("/admin/leads?error=missing_lead");
  }

  if (!contactName) {
    redirect(`/admin/leads/${leadId}/edit?error=${encodeURIComponent("Contact name is required.")}`);
  }

  const normalizedPhone = phone ? normalizeUkMobileNumber(phone) : null;

  await prisma.interestLead.update({
    where: { id: leadId },
    data: {
      contactName,
      interestType,
      status,
      email,
      phone,
      phoneNormalized: normalizedPhone,
      area: cleanNullable(formData.get("area")),
      teamName: cleanNullable(formData.get("teamName")),
      message: cleanNullable(formData.get("message")),
      contactedAt: status === "CONTACTED" ? new Date() : undefined,
      closedAt: status === "CLOSED" ? new Date() : undefined,
    },
  });

  await prisma.notificationRecipient.updateMany({
    where: {
      sourceType: "LEAD",
      sourceId: leadId,
    },
    data: {
      audience: interestType === "PLAYER" ? "PLAYER" : "LEAD",
      displayName: contactName,
      email,
      emailNormalized: email,
      phone: normalizedPhone ?? phone,
      phoneNormalized: normalizedPhone,
      lastSyncedAt: new Date(),
    },
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/admin/leads/${leadId}/edit`);
  revalidatePath("/admin/messaging");

  redirect(`/admin/leads/${leadId}?saved=details-updated`);
}

export default async function EditLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const lead = await prisma.interestLead.findUnique({
    where: { id },
    select: {
      id: true,
      contactName: true,
      email: true,
      phone: true,
      area: true,
      teamName: true,
      message: true,
      status: true,
      interestType: true,
    },
  });

  if (!lead) {
    notFound();
  }

  const errorMessage = sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-white/55">Admin • Edit lead</p>
          <h1 className="mt-2 text-3xl font-black text-white">{lead.contactName}</h1>
          <p className="mt-2 text-sm text-white/60">Update the lead type and contact details before emailing, texting or converting the lead.</p>
        </div>

        <Link
          href={`/admin/leads/${lead.id}`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Back to lead
        </Link>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div>
      ) : null}

      <form action={updateLeadDetailsAction} className="rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_42%),rgba(255,255,255,0.04)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <input type="hidden" name="leadId" value={lead.id} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Contact name" name="contactName" defaultValue={lead.contactName} />
          <FormListboxField
            name="interestType"
            label="Lead type"
            value={lead.interestType}
            options={INTEREST_TYPE_OPTIONS}
            placeholder="Select lead type"
          />
          <FormListboxField
            name="status"
            label="Status"
            value={lead.status}
            options={STATUS_OPTIONS}
            placeholder="Select status"
          />
          <Field label="Email" name="email" type="email" defaultValue={lead.email} />
          <Field label="Mobile number" name="phone" defaultValue={lead.phone} />
          <Field label="Area" name="area" defaultValue={lead.area} />
          <Field label="Team name" name="teamName" defaultValue={lead.teamName} />
        </div>

        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/80">
          Changing <span className="font-semibold text-white">Lead type</span> controls which conversion action appears on the lead page. Use <span className="font-semibold text-white">Player</span> when someone wants to join a SIXFL squad as an individual.
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-white/60">Message / notes</span>
          <textarea
            name="message"
            rows={6}
            defaultValue={lead.message ?? ""}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60"
          />
        </label>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/30"
          >
            Save lead details
          </button>

          <Link
            href={`/admin/leads/${lead.id}`}
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
