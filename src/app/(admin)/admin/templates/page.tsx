// ========================================
// File: src/app/(admin)/admin/templates/page.tsx
// ========================================

import Link from "next/link";
import { NotificationAudience, NotificationChannel } from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type SearchParams = Promise<{
  channel?: string;
}>;

type UnifiedTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  audience: string;
  channel: "EMAIL" | "SMS";
  interestType: string | null;
  subject: string | null;
  body: string;
  isActive: boolean;
  updatedAt: Date;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
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
  if (value === "REFEREE") return "Referee";
  return value;
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

function channelClasses(channel: "EMAIL" | "SMS") {
  return channel === "EMAIL"
    ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
    : "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300";
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

function isChannelFilter(value: string | undefined): value is "EMAIL" | "SMS" {
  return value === "EMAIL" || value === "SMS";
}

function buildFilterHref(channel?: "EMAIL" | "SMS") {
  return channel ? `/admin/templates?channel=${channel}` : "/admin/templates";
}

export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const { channel: channelParam } = await searchParams;
  const selectedChannel = isChannelFilter(channelParam) ? channelParam : undefined;

  const [emailTemplates, smsTemplates] = await Promise.all([
    prisma.emailTemplate.findMany({
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.notificationTemplate.findMany({
      where: {
        channel: NotificationChannel.SMS,
        audience: {
          in: [NotificationAudience.LEAD, NotificationAudience.TEAM],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
  ]);

  const templates: UnifiedTemplateRow[] = [
    ...emailTemplates.map((template) => ({
      id: template.id,
      key: template.key,
      name: template.name,
      description: template.description,
      audience: template.audience,
      channel: "EMAIL" as const,
      interestType: template.interestType,
      subject: template.subject,
      body: template.body,
      isActive: template.isActive,
      updatedAt: template.updatedAt,
    })),
    ...smsTemplates.map((template) => ({
      id: template.id,
      key: template.key,
      name: template.name,
      description: template.description,
      audience: template.audience,
      channel: "SMS" as const,
      interestType: null,
      subject: template.subject,
      body: template.body,
      isActive: template.isActive,
      updatedAt: template.updatedAt,
    })),
  ]
    .filter((template) =>
      selectedChannel ? template.channel === selectedChannel : true,
    )
    .sort((a, b) => {
      const updatedAtDifference =
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

      if (updatedAtDifference !== 0) {
        return updatedAtDifference;
      }

      return a.name.localeCompare(b.name);
    });

  const totalCount = emailTemplates.length + smsTemplates.length;
  const activeCount =
    emailTemplates.filter((template) => template.isActive).length +
    smsTemplates.filter((template) => template.isActive).length;
  const emailCount = emailTemplates.length;
  const smsCount = smsTemplates.length;

  return (
    <AdminCard title="Templates">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Templates
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Manage email and SMS templates from one place without duplicating
              admin flows.
            </p>

            <p className="text-sm text-white/40">
              {templates.length} template{templates.length === 1 ? "" : "s"}{" "}
              shown
              {selectedChannel ? ` · ${selectedChannel.toLowerCase()} only` : ""}
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
              href="/admin/templates/new"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              New template
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Total</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {totalCount}
            </div>
            <div className="mt-2 text-sm text-white/60">
              Email and SMS templates
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Active</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {activeCount}
            </div>
            <div className="mt-2 text-sm text-white/60">
              Available in admin flows
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">Email</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {emailCount}
            </div>
            <div className="mt-2 text-sm text-white/60">
              Branded email templates
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-sm font-medium text-white/55">SMS</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {smsCount}
            </div>
            <div className="mt-2 text-sm text-white/60">
              Reusable text messaging
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { label: "All", href: buildFilterHref(), active: !selectedChannel },
            {
              label: "Email",
              href: buildFilterHref("EMAIL"),
              active: selectedChannel === "EMAIL",
            },
            {
              label: "SMS",
              href: buildFilterHref("SMS"),
              active: selectedChannel === "SMS",
            },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={[
                "inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition",
                item.active
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-black/20 text-white/75 hover:bg-black/30 hover:text-white",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {templates.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm leading-6 text-white/60">
            No templates found for this filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-white/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Channel</th>
                    <th className="px-4 py-3 font-semibold">Audience</th>
                    <th className="px-4 py-3 font-semibold">Interest type</th>
                    <th className="px-4 py-3 font-semibold">Key</th>
                    <th className="px-4 py-3 font-semibold">Length</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Updated</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {templates.map((template) => {
                    const lengthLabel =
                      template.channel === "SMS"
                        ? `${template.body.length} chars · ${estimateSmsSegments(
                            template.body,
                          )} seg`
                        : `${template.subject?.length ?? 0} subj · ${template.body.length} body`;

                    return (
                      <tr
                        key={`${template.channel}-${template.id}`}
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

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${channelClasses(
                              template.channel,
                            )}`}
                          >
                            {template.channel}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${audienceClasses(
                              template.audience,
                            )}`}
                          >
                            {formatAudience(template.audience)}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-white/70">
                          {template.channel === "EMAIL"
                            ? formatInterestType(template.interestType)
                            : "—"}
                        </td>

                        <td className="px-4 py-4 text-white/70">
                          {template.key}
                        </td>

                        <td className="px-4 py-4 text-white/70">
                          {lengthLabel}
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
                            href={`/admin/templates/${template.id}`}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white/85 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">
                  What this powers
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>Lead email and SMS campaigns</div>
                  <div>Team outreach and operations</div>
                  <div>Reusable admin comms across channels</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">
                  Good keys
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>lead-response</div>
                  <div>player-interest-follow-up</div>
                  <div>team-payment-nudge</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm font-medium text-white/55">Tips</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <div>Use inactive instead of deleting</div>
                  <div>Keep SMS short and direct</div>
                  <div>Use CTA placement only for email templates</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminCard>
  );
}
