// ========================================
// File: src/app/(admin)/admin/templates/new/page.tsx
// ========================================

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";
import EmailTemplateForm from "@/components/admin/email-templates/EmailTemplateForm";
import SmsTemplateForm from "@/components/admin/sms-templates/SmsTemplateForm";
import { createEmailTemplateAction } from "@/app/(admin)/admin/email-templates/actions";
import { createSmsTemplateAction } from "@/app/(admin)/admin/sms-templates/actions";
import { requireAdmin } from "@/lib/requireAdmin";

type SearchParams = Promise<{
  channel?: string;
}>;

function isChannel(value: string | undefined): value is "EMAIL" | "SMS" {
  return value === "EMAIL" || value === "SMS";
}

function buildChannelHref(channel: "EMAIL" | "SMS") {
  return `/admin/templates/new?channel=${channel}`;
}

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const { channel: channelParam } = await searchParams;
  const selectedChannel = isChannel(channelParam) ? channelParam : "EMAIL";

  return (
    <AdminCard title={`Create ${selectedChannel === "EMAIL" ? "Email" : "SMS"} Template`}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Create template
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-white/65">
              Start with the channel, then configure the template using the tailored editor for that message type.
            </p>
          </div>

          <Link
            href="/admin/templates"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
          >
            Back to templates
          </Link>
        </div>

        <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Channel</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Email templates support subjects and CTA buttons. SMS templates stay focused on short body copy and segment length.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                value: "EMAIL" as const,
                label: "Email",
                description: "Subject, rich preview, and CTA placement.",
              },
              {
                value: "SMS" as const,
                label: "SMS",
                description: "Short plain-text messaging with segment awareness.",
              },
            ].map((option) => {
              const selected = selectedChannel === option.value;

              return (
                <Link
                  key={option.value}
                  href={buildChannelHref(option.value)}
                  className={[
                    "min-h-[120px] rounded-2xl border px-4 py-4 text-left transition",
                    selected
                      ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold text-white">
                    {option.label}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-neutral-400">
                    {option.description}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {selectedChannel === "EMAIL" ? (
          <EmailTemplateForm mode="create" action={createEmailTemplateAction} />
        ) : (
          <SmsTemplateForm mode="create" action={createSmsTemplateAction} />
        )}
      </div>
    </AdminCard>
  );
}
