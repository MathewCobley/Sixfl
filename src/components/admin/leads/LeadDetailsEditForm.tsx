// ========================================
// File: src/components/admin/leads/LeadDetailsEditForm.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LeadStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";

type Props = {
  lead: {
    id: string;
    contactName: string;
    email: string | null;
    phone: string | null;
    area: string | null;
    teamName: string | null;
    message: string | null;
    status: LeadStatus;
  };
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "CLOSED", label: "Closed" },
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

async function updateLeadDetailsAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = cleanNullable(formData.get("email"))?.toLowerCase() ?? null;
  const phone = cleanNullable(formData.get("phone"));
  const status = getLeadStatus(formData.get("status"));

  if (!leadId) {
    redirect("/admin/leads?error=missing_lead");
  }

  if (!contactName) {
    redirect(`/admin/leads/${leadId}?error=${encodeURIComponent("Contact name is required.")}`);
  }

  const normalizedPhone = phone ? normalizeUkMobileNumber(phone) : null;

  await prisma.interestLead.update({
    where: { id: leadId },
    data: {
      contactName,
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
  revalidatePath("/admin/messaging");

  redirect(`/admin/leads/${leadId}?saved=details-updated`);
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue?: string | null; type?: string }) {
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

export default function LeadDetailsEditForm({ lead }: Props) {
  return (
    <form action={updateLeadDetailsAction} className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <input type="hidden" name="leadId" value={lead.id} />

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Edit lead</p>
        <h3 className="mt-1 text-lg font-semibold text-white">Edit contact details</h3>
        <p className="mt-1 text-sm text-white/60">Fix the lead name, email, mobile number, area, team name or notes before sending SMS/email or converting.</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Contact name" name="contactName" defaultValue={lead.contactName} />
        <label className="block space-y-2">
          <span className="text-sm font-medium text-white/60">Status</span>
          <select name="status" defaultValue={lead.status} className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-emerald-500/60">
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <Field label="Email" name="email" type="email" defaultValue={lead.email} />
        <Field label="Mobile number" name="phone" defaultValue={lead.phone} />
        <Field label="Area" name="area" defaultValue={lead.area} />
        <Field label="Team name" name="teamName" defaultValue={lead.teamName} />
      </div>

      <label className="mt-4 block space-y-2">
        <span className="text-sm font-medium text-white/60">Message / notes</span>
        <textarea name="message" rows={4} defaultValue={lead.message ?? ""} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/60" />
      </label>

      <button type="submit" className="mt-4 inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20">
        Save lead details
      </button>
    </form>
  );
}
