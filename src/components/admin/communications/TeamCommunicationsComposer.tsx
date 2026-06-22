// ========================================
// File: src/components/admin/communications/TeamCommunicationsComposer.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";
import { sendTeamCommunicationBulkMessageAction } from "@/app/(admin)/admin/communications/team-bulk-actions";

type EmailTemplateOption = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

type SmsTemplateOption = {
  id: string;
  key: string;
  name: string;
  body: string;
  description: string | null;
};

type PlayerRecipientOption = {
  id: string;
  type: "teamMember" | "prospect";
  label: string;
  email: string | null;
  phone: string | null;
  roleLabel?: string | null;
  statusLabel?: string | null;
};

type RecipientOption = {
  value: string;
  type: "team" | "teamMember" | "prospect";
  label: string;
  templateName: string;
  email: string | null;
  phone: string | null;
  roleLabel?: string | null;
  statusLabel?: string | null;
};

type AvailabilityResponse = "AVAILABLE" | "MAYBE" | "UNAVAILABLE" | "NO_RESPONSE";

type AvailabilityInfo = {
  response: AvailabilityResponse;
  label: string;
  note: string | null;
  respondedAt: string | null;
};

type LatestAvailabilityState = {
  fixture: {
    id: string;
    label: string;
  } | null;
  availabilityByRecipientValue?: Record<string, AvailabilityInfo>;
  counts?: {
    available: number;
    maybe: number;
    unavailable: number;
    noResponse: number;
  };
};

type Props = {
  teamId: string;
  fromPath: string;
  toEmail: string | null;
  toPhone: string | null;
  contactName?: string | null;
  teamName: string;
  leagueName?: string | null;
  claimCode?: string | null;
  claimLink?: string | null;
  captainDashboardUrl?: string | null;
  emailTemplates: EmailTemplateOption[];
  smsTemplates: SmsTemplateOption[];
  playerRecipients?: PlayerRecipientOption[];
  initialSelectedRecipientValues?: string[];
  showTeamContactRecipient?: boolean;
};

function getFirstName(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function getRecipientValue(input: { type: "team" | "teamMember" | "prospect"; id?: string }) {
  return input.type === "team" ? "team:" : `${input.type}:${input.id ?? ""}`;
}

function getSiteUrl() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "https://www.sixfl.co.uk";
}

function appendSnippet(current: string, snippet: string) {
  const trimmedCurrent = current.trimEnd();
  const trimmedSnippet = snippet.trim();

  if (!trimmedCurrent) return trimmedSnippet;

  return `${trimmedCurrent}\n\n${trimmedSnippet}`;
}

function resolveText(
  text: string,
  context: {
    firstName: string;
    fullName: string;
    teamName: string;
    leagueName: string;
    claimCode: string;
    claimLink: string;
    captainDashboardUrl: string;
  },
) {
  return text
    .replaceAll("{{firstName}}", context.firstName)
    .replaceAll("{{fullName}}", context.fullName)
    .replaceAll("{{teamName}}", context.teamName)
    .replaceAll("{{leagueName}}", context.leagueName)
    .replaceAll("{{claimCode}}", context.claimCode)
    .replaceAll("{{claimLink}}", context.claimLink)
    .replaceAll("{{captainDashboardUrl}}", context.captainDashboardUrl);
}

function getAvailabilityClasses(response?: AvailabilityResponse) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "NO_RESPONSE":
      return "border-white/10 bg-white/[0.04] text-white/60";
    default:
      return "border-white/10 bg-black/20 text-white/45";
  }
}

function getAvailabilityShortLabel(response?: AvailabilityResponse) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    case "NO_RESPONSE":
      return "No response";
    default:
      return "No linked availability";
  }
}

function MarketingToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
        checked
          ? "border-amber-400/30 bg-amber-500/10"
          : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-semibold text-white">
          This is a marketing/promotional message
        </span>
        <span className="mt-1 block text-xs leading-5 text-white/55">
          Leave this unticked for fixture, availability, squad, payment, admin, or operational messages. Tick it only for promotional campaigns, advertising, or non-essential marketing.
        </span>
        {checked ? (
          <span className="mt-2 block rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Marketing opt-outs will be respected for this send.
          </span>
        ) : (
          <span className="mt-2 block rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            This will be treated as a service/operational message.
          </span>
        )}
      </span>
    </label>
  );
}

export default function TeamCommunicationsComposer({
  teamId,
  fromPath,
  toEmail,
  toPhone,
  contactName,
  teamName,
  leagueName,
  claimCode,
  claimLink,
  captainDashboardUrl,
  emailTemplates,
  smsTemplates,
  playerRecipients = [],
  initialSelectedRecipientValues,
  showTeamContactRecipient = true,
}: Props) {
  const fallbackRecipientValue = showTeamContactRecipient
    ? getRecipientValue({ type: "team" })
    : playerRecipients[0]
      ? getRecipientValue({ type: playerRecipients[0].type, id: playerRecipients[0].id })
      : getRecipientValue({ type: "team" });

  const [selectedRecipientValues, setSelectedRecipientValues] = useState<string[]>(() =>
    initialSelectedRecipientValues?.length ? initialSelectedRecipientValues : [fallbackRecipientValue],
  );
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [isMarketingMessage, setIsMarketingMessage] = useState(false);
  const [latestAvailability, setLatestAvailability] = useState<LatestAvailabilityState | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const availabilityByRecipientValue = latestAvailability?.availabilityByRecipientValue ?? {};
  const availabilityCounts = latestAvailability?.counts ?? {
    available: 0,
    maybe: 0,
    unavailable: 0,
    noResponse: 0,
  };

  const siteUrl = getSiteUrl();
  const playerDashboardUrl = `${siteUrl}/player/team/${teamId}`;
  const availabilityUrl = latestAvailability?.fixture?.id
    ? `${siteUrl}/player/team/${teamId}/availability?fixtureId=${latestAvailability.fixture.id}`
    : `${siteUrl}/player/team/${teamId}/availability`;
  const adminAvailabilityUrl = latestAvailability?.fixture?.id
    ? `${siteUrl}/admin/teams/${teamId}/availability?fixtureId=${latestAvailability.fixture.id}`
    : `${siteUrl}/admin/teams/${teamId}/availability`;
  const adminMatchFeesUrl = `${siteUrl}/admin/teams/${teamId}/match-fees`;
  const captainUrl = captainDashboardUrl?.trim() || claimLink?.trim() || `${siteUrl}/captain/team/${teamId}`;
  const teamContactTemplateName = contactName?.trim() || "there";

  const recipientOptions = useMemo<RecipientOption[]>(
    () => [
      ...(showTeamContactRecipient
        ? [
            {
              value: getRecipientValue({ type: "team" }),
              type: "team" as const,
              label: contactName?.trim()
                ? `${contactName.trim()} · ${teamName} team contact`
                : `${teamName} team contact`,
              templateName: contactName?.trim() || "there",
              email: toEmail,
              phone: toPhone,
              roleLabel: "Team contact",
              statusLabel: null,
            },
          ]
        : []),
      ...playerRecipients.map((recipient) => ({
        value: getRecipientValue({ type: recipient.type, id: recipient.id }),
        type: recipient.type,
        label: recipient.label,
        templateName: recipient.label,
        email: recipient.email,
        phone: recipient.phone,
        roleLabel: recipient.roleLabel,
        statusLabel: recipient.statusLabel,
      })),
    ],
    [contactName, playerRecipients, showTeamContactRecipient, teamName, toEmail, toPhone],
  );

  const selectedRecipients = useMemo(() => {
    const selectedSet = new Set(selectedRecipientValues);
    return recipientOptions.filter((recipient) => selectedSet.has(recipient.value));
  }, [recipientOptions, selectedRecipientValues]);

  const primaryRecipient = selectedRecipients[0] ?? recipientOptions[0];
  const selectedCount = selectedRecipients.length;
  const selectedEmailCount = selectedRecipients.filter((recipient) => recipient.email?.trim()).length;
  const selectedSmsCount = selectedRecipients.filter((recipient) => recipient.phone?.trim()).length;

  const templateContext = useMemo(() => {
    const templateName = selectedCount === 1
      ? primaryRecipient?.templateName?.trim() || teamContactTemplateName
      : "";

    return {
      firstName: selectedCount === 1 ? getFirstName(templateName) || "there" : "",
      fullName: selectedCount === 1 ? templateName || "there" : "",
      teamName: teamName.trim(),
      leagueName: leagueName?.trim() || "",
      claimCode: claimCode?.trim() || "",
      claimLink: claimLink?.trim() || "",
      captainDashboardUrl: captainUrl,
    };
  }, [captainUrl, claimCode, claimLink, leagueName, primaryRecipient?.templateName, selectedCount, teamContactTemplateName, teamName]);

  const selectedEmailTemplate = useMemo(
    () => emailTemplates.find((template) => template.id === selectedEmailTemplateId) ?? null,
    [emailTemplates, selectedEmailTemplateId],
  );
  const selectedSmsTemplate = useMemo(
    () => smsTemplates.find((template) => template.id === selectedSmsTemplateId) ?? null,
    [smsTemplates, selectedSmsTemplateId],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLatestAvailability() {
      setAvailabilityLoading(true);

      try {
        const response = await fetch(`/api/admin/teams/${teamId}/latest-availability`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load availability.");
        }

        const data = (await response.json()) as LatestAvailabilityState;
        if (!cancelled) {
          setLatestAvailability(data);
        }
      } catch {
        if (!cancelled) {
          setLatestAvailability(null);
        }
      } finally {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      }
    }

    loadLatestAvailability();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  function handleEmailTemplateChange(templateId: string) {
    setSelectedEmailTemplateId(templateId);

    const template = emailTemplates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setEmailSubject("");
      setEmailBody("");
      return;
    }

    setEmailSubject(resolveText(template.subject, templateContext));
    setEmailBody(resolveText(template.body, templateContext));
  }

  function handleSmsTemplateChange(templateId: string) {
    setSelectedSmsTemplateId(templateId);

    const template = smsTemplates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setSmsBody("");
      return;
    }

    setSmsBody(resolveText(template.body, templateContext));
  }

  useEffect(() => {
    if (!selectedEmailTemplate) return;

    setEmailSubject(resolveText(selectedEmailTemplate.subject, templateContext));
    setEmailBody(resolveText(selectedEmailTemplate.body, templateContext));
  }, [selectedEmailTemplate, templateContext]);

  useEffect(() => {
    if (!selectedSmsTemplate) return;

    setSmsBody(resolveText(selectedSmsTemplate.body, templateContext));
  }, [selectedSmsTemplate, templateContext]);

  function appendToEmail(snippet: string) {
    setEmailBody((current) => appendSnippet(current, snippet));
  }

  function appendToSms(snippet: string) {
    setSmsBody((current) => appendSnippet(current, snippet));
  }

  const availabilitySnippet = latestAvailability?.fixture
    ? [
        `Availability link for ${latestAvailability.fixture.label}:`,
        availabilityUrl,
      ].join("\n")
    : ["Availability link:", availabilityUrl].join("\n");
  const adminAvailabilitySnippet = latestAvailability?.fixture
    ? [
        `Admin availability view for ${latestAvailability.fixture.label}:`,
        adminAvailabilityUrl,
      ].join("\n")
    : ["Admin availability view:", adminAvailabilityUrl].join("\n");
  const matchFeesSnippet = ["Match fee admin link:", adminMatchFeesUrl].join("\n");
  const playerDashboardSnippet = ["Player dashboard link:", playerDashboardUrl].join("\n");

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Outbound message
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Compose message</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Send one-off email or SMS messages. Availability and payment snippets can be added without retyping links.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/55">
          {availabilityLoading
            ? "Loading latest availability…"
            : latestAvailability?.fixture
              ? `Latest availability: ${latestAvailability.fixture.label}`
              : "No upcoming availability fixture found"}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Recipients</p>
            <p className="mt-1 text-xs text-white/45">
              Select one or more recipients. Team contact uses the saved contact name for template fields such as first name.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {selectedCount} selected
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {selectedEmailCount} email
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {selectedSmsCount} SMS
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {recipientOptions.map((recipient) => {
            const checked = selectedRecipientValues.includes(recipient.value);
            const availability = availabilityByRecipientValue[recipient.value];

            return (
              <label
                key={recipient.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
                  checked
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    setSelectedRecipientValues((current) => {
                      if (event.target.checked) {
                        return Array.from(new Set([...current, recipient.value]));
                      }

                      const next = current.filter((value) => value !== recipient.value);
                      return next.length ? next : current;
                    });
                  }}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {recipient.label}
                  </span>
                  <span className="mt-1 block text-xs text-white/45">
                    {recipient.email || "No email"}
                    {recipient.phone ? ` · ${recipient.phone}` : ""}
                    {recipient.roleLabel ? ` · ${recipient.roleLabel}` : ""}
                    {recipient.statusLabel ? ` · ${recipient.statusLabel}` : ""}
                  </span>
                  {availability ? (
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getAvailabilityClasses(availability.response)}`}>
                      {availability.label}
                      {availability.respondedAt ? ` · ${new Date(availability.respondedAt).toLocaleDateString("en-GB")}` : ""}
                    </span>
                  ) : (
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getAvailabilityClasses(undefined)}`}>
                      {getAvailabilityShortLabel(undefined)}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        {latestAvailability?.fixture ? (
          <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60 sm:grid-cols-4">
            <div><span className="text-emerald-200">Available:</span> {availabilityCounts.available}</div>
            <div><span className="text-amber-200">Maybe:</span> {availabilityCounts.maybe}</div>
            <div><span className="text-red-200">Unavailable:</span> {availabilityCounts.unavailable}</div>
            <div><span className="text-white/50">No response:</span> {availabilityCounts.noResponse}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Email</h3>
              <p className="mt-1 text-xs text-white/45">Choose a template or write a fresh email.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
              {selectedEmailCount} reachable
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <TemplateSelect
              label="Email template"
              value={selectedEmailTemplateId}
              onChange={handleEmailTemplateChange}
              options={emailTemplates.map((template) => ({
                id: template.id,
                name: template.name,
                description: template.description,
              }))}
              placeholder="Choose email template"
            />

            <label className="block space-y-2 text-sm text-white/65">
              <span>Subject</span>
              <input
                name="subject"
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="Subject"
              />
            </label>

            <label className="block space-y-2 text-sm text-white/65">
              <span>Body</span>
              <textarea
                value={emailBody}
                onChange={(event) => setEmailBody(event.target.value)}
                rows={10}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="Write your email..."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => appendToEmail(availabilitySnippet)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.08]">
                Add player availability link
              </button>
              <button type="button" onClick={() => appendToEmail(playerDashboardSnippet)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.08]">
                Add player dashboard link
              </button>
              <button type="button" onClick={() => appendToEmail(adminAvailabilitySnippet)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.08]">
                Add admin availability link
              </button>
              <button type="button" onClick={() => appendToEmail(matchFeesSnippet)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.08]">
                Add match fees link
              </button>
            </div>

            <MarketingToggle checked={isMarketingMessage} onChange={setIsMarketingMessage} />

            <form action={sendTeamCommunicationBulkMessageAction}>
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="from" value={fromPath} />
              <input type="hidden" name="channel" value="EMAIL" />
              <input type="hidden" name="subject" value={emailSubject} />
              <input type="hidden" name="body" value={emailBody} />
              <input type="hidden" name="templateId" value={selectedEmailTemplateId} />
              <input type="hidden" name="templateKey" value={selectedEmailTemplate?.key ?? ""} />
              <input type="hidden" name="ctaLabel" value={selectedEmailTemplate?.ctaLabel ?? ""} />
              <input type="hidden" name="ctaUrl" value={selectedEmailTemplate?.ctaUrl ?? ""} />
              <input type="hidden" name="claimCode" value={claimCode ?? ""} />
              <input type="hidden" name="claimLink" value={claimLink ?? ""} />
              <input type="hidden" name="captainDashboardUrl" value={captainUrl} />
              <input type="hidden" name="isMarketing" value={isMarketingMessage ? "1" : "0"} />
              {selectedRecipientValues.map((value) => (
                <input key={value} type="hidden" name="recipientValues" value={value} />
              ))}
              <button
                type="submit"
                disabled={!emailSubject.trim() || !emailBody.trim() || selectedEmailCount === 0}
                className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Queue email
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">SMS</h3>
              <p className="mt-1 text-xs text-white/45">Use for short, urgent updates only.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
              {selectedSmsCount} reachable
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <TemplateSelect
              label="SMS template"
              value={selectedSmsTemplateId}
              onChange={handleSmsTemplateChange}
              options={smsTemplates.map((template) => ({
                id: template.id,
                name: template.name,
                description: template.description,
              }))}
              placeholder="Choose SMS template"
            />

            <label className="block space-y-2 text-sm text-white/65">
              <span>Body</span>
              <textarea
                value={smsBody}
                onChange={(event) => setSmsBody(event.target.value)}
                rows={8}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-white outline-none transition focus:border-emerald-400/50"
                placeholder="Write your SMS..."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => appendToSms(availabilitySnippet)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.08]">
                Add player availability link
              </button>
              <button type="button" onClick={() => appendToSms(playerDashboardSnippet)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.08]">
                Add player dashboard link
              </button>
            </div>

            <MarketingToggle checked={isMarketingMessage} onChange={setIsMarketingMessage} />

            <form action={sendTeamCommunicationBulkMessageAction}>
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="from" value={fromPath} />
              <input type="hidden" name="channel" value="SMS" />
              <input type="hidden" name="body" value={smsBody} />
              <input type="hidden" name="templateId" value={selectedSmsTemplateId} />
              <input type="hidden" name="templateKey" value={selectedSmsTemplate?.key ?? ""} />
              <input type="hidden" name="claimCode" value={claimCode ?? ""} />
              <input type="hidden" name="claimLink" value={claimLink ?? ""} />
              <input type="hidden" name="captainDashboardUrl" value={captainUrl} />
              <input type="hidden" name="isMarketing" value={isMarketingMessage ? "1" : "0"} />
              {selectedRecipientValues.map((value) => (
                <input key={value} type="hidden" name="recipientValues" value={value} />
              ))}
              <button
                type="submit"
                disabled={!smsBody.trim() || selectedSmsCount === 0}
                className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Queue SMS
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
