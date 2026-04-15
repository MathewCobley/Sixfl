// ========================================
// File: src/app/(admin)/admin/leads/import-sms/page.tsx
// ========================================

import Link from "next/link";

import { requireAdmin } from "@/lib/requireAdmin";
import ImportSmsLeadsForm from "@/components/admin/leads/ImportSmsLeadsForm";

export default async function AdminLeadSmsImportPage() {
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
            Import SMS leads
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Upload a CSV of mobile numbers and create SMS-ready leads inside the
            SIXFL CRM.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/leads/import"
            className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Email CSV import
          </Link>

          <Link
            href="/admin/leads"
            className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Back to leads
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ImportSmsLeadsForm />

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">CSV example</h2>

          <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white/75">
{`phone,firstName,lastName,teamName,area,source,marketingConsent
07700111222,Joe,Levy,Six Offenders,Harrogate,Rossett flyer,true
+447700333444,Adam,Smith,Carajo Utd,Knaresborough,Instagram DM,false`}
          </pre>

          <div className="mt-4 space-y-3 text-sm text-white/65">
            <p>Accepted phone formats: 07..., 447..., or +447...</p>
            <p>
              Numbers are normalized to UK mobile format and deduped on import.
            </p>
            <p>
              Email is not required for this flow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}