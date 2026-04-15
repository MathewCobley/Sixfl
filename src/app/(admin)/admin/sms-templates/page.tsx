// ========================================
// File: src/app/(admin)/admin/sms-templates/page.tsx
// ========================================

import Link from "next/link";
import { NotificationAudience, NotificationChannel } from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function audienceClasses(audience: NotificationAudience) {
  if (audience === "LEAD") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }

  return "border-blue-500/20 bg-blue-500/10 text-blue-300";
}

function formatAudience(value: NotificationAudience) {
  return value === "LEAD" ? "Lead" : "Team";
}

function estimateSmsSegments(text: string) {
  const length = text.length;
  if (length === 0) {
    return 0;
  }
  if (length <= 160) {
    return 1;
  }
  return Math.ceil(length / 153);
}

export default async function AdminSmsTemplatesPage() {
  await requireAdmin();

  const templates = await prisma.notificationTemplate.findMany({
    where: {
      channel: NotificationChannel.SMS,
      audience: {
        in: ["LEAD", "TEAM"],
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  const activeCount = templates.filter((template) => template.isActive).length;
  const leadCount = templates.filter((template) => template.audience === "LEAD").length;
  const teamCount = templates.filter((template) => template.audience === "TEAM").length;

  return (
    <AdminCard title="SMS Templates">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              SMS templates
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Manage reusable SMS templates for lead campaigns and team outreach.
            </p>

            <p className="text-sm text-white/40">
              {templates.length} template{templates.length === 1 ? "" : "s"} in the system
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/messaging"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
            >
              Back to messaging
            </Link>

            <Link
              href="/admin/sms-templates/new"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              New SMS template
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Total</div>
            <div className="mt-2 text-3xl font-semibold text-white">{templates.length}</div>
            <div className="mt-2 text-sm text-white/60">Lead and team SMS templates</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Active</div>
            <div className="mt-2 text-3xl font-semibold text-white">{activeCount}</div>
            <div className="mt-2 text-sm text-white/60">Available to use now</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Lead</div>
            <div className="mt-2 text-3xl font-semibold text-white">{leadCount}</div>
            <div className="mt-2 text-sm text-white/60">Lead campaign templates</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Team</div>
            <div className="mt-2 text-3xl font-semibold text-white">{teamCount}</div>
            <div className="mt-2 text-sm text-white/60">Team outreach templates</div>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm leading-6 text-white/60">
            No SMS templates yet. Create your first one to start using database-backed
            SMS templates for leads and teams.
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
                    <th className="px-4 py-3 font-semibold">Length</th>
                    <th className="px-4 py-3 font-semibold">Segments</th>
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
                        <div className="font-medium text-white">{template.name}</div>
                        <div className="mt-1 text-sm text-white/45">
                          {template.description || "No description"}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-white/70">{template.key}</td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${audienceClasses(
                            template.audience,
                          )}`}
                        >
                          {formatAudience(template.audience)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-white/70">{template.body.length}</td>
                      <td className="px-4 py-4 text-white/70">
                        {estimateSmsSegments(template.body)}
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

                      <td className="px-4 py-4 text-white/55">{formatDate(template.updatedAt)}</td>

                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/sms-templates/${template.id}`}
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
                <div className="text-sm font-medium text-white/55">What this powers</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>Lead SMS campaigns</div>
                  <div>Team outreach and reminders</div>
                  <div>Reusable operational texts</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">Good keys</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>lead-follow-up</div>
                  <div>lead-last-call</div>
                  <div>team-payment-nudge</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">Tips</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>Keep SMS short and direct</div>
                  <div>Use inactive instead of deleting</div>
                  <div>Stay mindful of segment count</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminCard>
  );
}
