// ========================================
// File: src/app/admin/email-templates/page.tsx
// ========================================

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function audienceClasses(audience: string) {
  if (audience === "LEAD") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }

  if (audience === "TEAM") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  }

  if (audience === "PLAYER") {
    return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  }

  if (audience === "REFEREE") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }

  return "border-white/10 bg-white/5 text-white/70";
}

function formatAudience(value: string) {
  if (value === "LEAD") return "Lead";
  if (value === "TEAM") return "Team";
  if (value === "PLAYER") return "Player";
  if (value === "REFEREE") return "Referee";
  return "General";
}

function formatInterestType(value: string | null) {
  if (!value) return "—";
  if (value === "TEAM") return "Team";
  if (value === "PLAYER") return "Player";
  return "Referee";
}

export default async function AdminEmailTemplatesPage() {
  await requireAdmin();

  const templates = await prisma.emailTemplate.findMany({
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return (
    <AdminCard title="Email Templates">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Email templates
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Manage reusable admin email templates for leads, teams, and future
              communications.
            </p>

            <p className="text-sm text-white/40">
              {templates.length} template{templates.length === 1 ? "" : "s"} in
              the system
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
            >
              Back to admin
            </Link>

            <Link
              href="/admin/leads"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
            >
              Back to leads
            </Link>

            <Link
              href="/admin/email-templates/new"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              New template
            </Link>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm leading-6 text-white/60">
            No email templates yet. Create your first one to start using
            database-backed templates in admin.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-white/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Key</th>
                    <th className="px-4 py-3 font-semibold">Audience</th>
                    <th className="px-4 py-3 font-semibold">Interest type</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Updated</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {templates.map((template) => (
                    <tr
                      key={template.id}
                      className="border-t border-white/10 align-top transition hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-4">
                        <div className="font-medium text-white">
                          {template.name}
                        </div>
                        <div className="mt-1 text-sm text-white/45">
                          {template.description || "No description"}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-white/70">{template.key}</td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${audienceClasses(
                            template.audience
                          )}`}
                        >
                          {formatAudience(template.audience)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-white/70">
                        {formatInterestType(template.interestType)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                            template.isActive
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 bg-white/5 text-white/60",
                          ].join(" ")}
                        >
                          {template.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-white/55">
                        {formatDate(template.updatedAt)}
                      </td>

                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/email-templates/${template.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white/85 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">
                  What this powers
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>Lead bulk email templates</div>
                  <div>Future team email templates</div>
                  <div>Reusable admin comms</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">
                  Good keys
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>lead-response</div>
                  <div>team-follow-up</div>
                  <div>fixture-reminder</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">Tips</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>Keep subjects short and clear</div>
                  <div>Use inactive instead of deleting</div>
                  <div>Write templates so they are easy to tweak before send</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminCard>
  );
}