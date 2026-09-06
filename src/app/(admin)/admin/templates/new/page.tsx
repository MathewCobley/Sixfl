// ========================================
// File: src/app/(admin)/admin/templates/new/page.tsx
// ========================================

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";
import EmailTemplateForm from "@/components/admin/email-templates/EmailTemplateForm";
import EmailTemplatePollBridge from "@/components/admin/email-templates/EmailTemplatePollBridge";
import SmsTemplateForm from "@/components/admin/sms-templates/SmsTemplateForm";
import { requireAdmin } from "@/lib/requireAdmin";

type SearchParams = Promise<{ channel?: string; type?: string }>;
type TemplateConsoleType = "campaign" | "system";

function isChannel(value: string | undefined): value is "EMAIL" | "SMS" {
  return value === "EMAIL" || value === "SMS";
}

function isTemplateConsoleType(value: string | undefined): value is TemplateConsoleType {
  return value === "campaign" || value === "system";
}

function buildChannelHref(type: TemplateConsoleType, channel: "EMAIL" | "SMS") {
  return `/admin/templates/new?type=${type}&channel=${channel}`;
}

export default async function NewTemplatePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { channel: channelParam, type: typeParam } = await searchParams;
  const selectedType = isTemplateConsoleType(typeParam) ? typeParam : "campaign";
  const selectedChannel = isChannel(channelParam) ? channelParam : "EMAIL";

  const title = selectedType === "system"
    ? `Create System ${selectedChannel === "EMAIL" ? "Email" : "SMS"} Template`
    : `Create ${selectedChannel === "EMAIL" ? "Email" : "SMS"} Template`;

  return (
    <AdminCard title={title}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Create template</h1>
            <p className="max-w-2xl text-sm leading-6 text-white/65">
              {selectedType === "system"
                ? "Create an automated system message used by operational flows like fixture publishing, fixture confirmation chases, and match fee reminders."
                : "Start with the channel, then configure the template using the tailored editor for that message type."}
            </p>
          </div>
          <Link
            href={`/admin/templates?type=${selectedType}&channel=${selectedChannel}`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 transition hover:bg-black/30 hover:text-white"
          >
            Back to templates
          </Link>
        </div>

        <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Template type</h2>
            <p className="mt-1 text-sm text-neutral-400">Campaign templates are manual outreach and admin comms. System templates are automated transactional messages used by the platform.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Link href="/admin/templates/new?type=campaign&channel=EMAIL" className={["min-h-[120px] rounded-2xl border px-4 py-4 text-left transition", selectedType === "campaign" ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"].join(" ")}>
              <div className="text-sm font-semibold text-white">Campaign Templates</div>
              <div className="mt-2 text-sm leading-6 text-neutral-400">Manual outreach, lead follow-up, and reusable admin email and SMS messaging.</div>
            </Link>
            <Link href="/admin/templates/new?type=system&channel=EMAIL" className={["min-h-[120px] rounded-2xl border px-4 py-4 text-left transition", selectedType === "system" ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"].join(" ")}>
              <div className="text-sm font-semibold text-white">System Templates</div>
              <div className="mt-2 text-sm leading-6 text-neutral-400">Automated operational emails and SMS such as fixture publish, confirmation chases, and match fee reminders.</div>
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-neutral-950/90 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Channel</h2>
            <p className="mt-1 text-sm text-neutral-400">Email templates support subjects and CTA buttons. SMS templates stay focused on short body copy and segment length.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(["EMAIL", "SMS"] as const).map((channel) => (
              <Link key={channel} href={buildChannelHref(selectedType, channel)} className={["min-h-[120px] rounded-2xl border px-4 py-4 text-left transition", selectedChannel === channel ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"].join(" ")}>
                <div className="text-sm font-semibold text-white">{channel}</div>
                <div className="mt-2 text-sm leading-6 text-neutral-400">{channel === "EMAIL" ? "Subject, rich preview, and CTA placement." : "Short plain-text messaging with segment awareness."}</div>
              </Link>
            ))}
          </div>
        </section>

        {selectedType === "system" ? (
          selectedChannel === "EMAIL" ? (
            <>
              <EmailTemplatePollBridge />
              <EmailTemplateForm mode="create" templateType="system" />
            </>
          ) : <SmsTemplateForm mode="create" templateType="system" />
        ) : selectedChannel === "EMAIL" ? (
          <>
            <EmailTemplatePollBridge />
            <EmailTemplateForm mode="create" templateType="campaign" />
          </>
        ) : (
          <SmsTemplateForm mode="create" templateType="campaign" />
        )}
      </div>
    </AdminCard>
  );
}
