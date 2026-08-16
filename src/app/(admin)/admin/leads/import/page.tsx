// ========================================
// File: src/app/admin/leads/import/page.tsx
// ========================================

import Link from "next/link";

import { requireAdmin } from "@/lib/requireAdmin";
import ImportLeadsForm from "@/components/admin/leads/ImportLeadsForm";

export default async function AdminLeadImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Admin console
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Import leads</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Upload a CSV of legacy or Meta campaign leads and import them into the SIXFL CRM.
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
        <ImportLeadsForm />

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">What can I upload?</h2>
          <p className="mt-3 text-sm text-white/65">
            You can upload the CSV downloaded directly from Meta/Facebook. It does not need cleaning first.
          </p>

          <h3 className="mt-6 text-sm font-semibold text-white">Standard CSV example</h3>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white/75">
{`email,firstName,lastName,teamName,source
joe@example.com,Joe,Levy,Six Offenders,Legacy import
adam@example.com,Adam,Smith,Carajo Utd,Legacy import`}
          </pre>

          <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-xs leading-5 text-emerald-100/80">
            Duplicate protection is always on: SIXFL skips a row when its email address or normalised phone number is already in Leads.
          </div>
        </div>
      </div>
    </div>
  );
}
