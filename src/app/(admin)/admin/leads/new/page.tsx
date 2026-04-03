// ========================================
// File: src/app/(admin)/admin/leads/new/page.tsx
// ========================================

import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import ManualLeadForm from "@/components/admin/leads/ManualLeadForm";

export default async function AdminLeadNewPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Admin console
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Add lead manually
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Add a single team, player or referee lead directly into the SIXFL CRM
            without using CSV import.
          </p>
        </div>

        <Link
          href="/admin/leads"
          className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Back to leads
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ManualLeadForm />

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">
              What you can add here
            </h2>
            <div className="mt-4 space-y-3 text-sm text-white/65">
              <div>Single team leads from phone calls or WhatsApp enquiries</div>
              <div>Player waiting list leads</div>
              <div>Referee interest captured offline</div>
              <div>Legacy leads you want to input one by one</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Useful tip</h2>
            <p className="mt-4 text-sm leading-6 text-white/65">
              If this is a team lead, add the team name, area and preferred nights
              where possible. That makes the demand and launch-readiness views on
              the main leads page much more useful.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
