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
  availabilityByRecipientValue: Record<string, AvailabilityInfo>;
  counts: {
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

  const recipientOptions = useMemo<RecipientOption[]>(
    () => [
      ...(showTeamContactRecipient
        ? [
            {
              value: getRecipientValue({ type: "team" }),
              type: "team" as const,
              label: `${teamName} team contact`,
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
        email: recipient.email,
        phone: recipient.phone,
        roleLabel: recipient.roleLabel,
        statusLabel: recipient.statusLabel,
      })),
    ],
    [playerRecipients, showTeamContactRecipient, teamName, toEmail, toPhone],
  );

  const selectedRecipients = useMemo(() => {
    const selectedSet = new Set(selectedRecipientValues);
    return recipientOptions.filter((recipient) => selectedSet.has(recipient.value));
  }, [recipientOptions, selectedRecipientValues]);

  const primaryRecipient = selectedRecipients[0] ?? recipientOptions[0];
  const selectedCount = selectedRecipients.length;
  const selectedEmailCount = selectedRecipients.filter((recipient) => recipient.email?.trim()).length;
  const selectedSmsCount = selectedRecipients.filter((recipient) => recipient.phone?.trim()).length;

  const templateContext = useMemo(
    () => ({
      firstName: selectedCount === 1 ? getFirstName(primaryRecipient?.label || contactName) : "",
      fullName: selectedCount === 1 ? primaryRecipient?.label || contactName?.trim() || "" : "",
      teamName: teamName.trim(),
      leagueName: leagueName?.trim() || "",
      claimCode: claimCode?.trim() || "",
      claimLink: claimLink?.trim() || "",
      captainDashboardUrl: captainUrl,
    }),
    [captainUrl, claimCode, claimLink, contactName, leagueName, primaryRecipient?.label, selectedCount, teamName],
  );

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

  useEffect(() => {
    if (!selectedEmailTemplate) {
      setEmailSubject("");
      setEmailBody("");
      return;
    }

    setEmailSubject(resolveText(selectedEmailTemplate.subject, templateContext));
    setEmailBody(resolveText(selectedEmailTemplate.body, templateContext));
  }, [selectedEmailTemplate, templateContext]);

  useEffect(() => {
    if (!selectedSmsTemplate) {
      setSmsBody("");
      return;
    }

    setSmsBody(resolveText(selectedSmsTemplate.body, templateContext));
  }, [selectedSmsTemplate, templateContext]);

  function toggleRecipient(value: string) {
    setSelectedRecipientValues((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length ? next : current;
      }

      return [...current, value];
    });
  }

  function selectAllPlayers() {
    const playerValues = recipientOptions
      .filter((recipient) => recipient.type !== "team")
      .map((recipient) => recipient.value);

    setSelectedRecipientValues(playerValues.length ? playerValues : [fallbackRecipientValue]);
  }

  function selectAll() {
    const allValues = recipientOptions.map((recipient) => recipient.value);
    setSelectedRecipientValues(allValues.length ? allValues : [fallbackRecipientValue]);
  }

  function clearToPrimaryOnly() {
    setSelectedRecipientValues([fallbackRecipientValue]);
  }

  function selectAvailabilityGroup(response: AvailabilityResponse) {
    const values = recipientOptions
      .filter((recipient) => {
        if (recipient.type !== "teamMember") return false;
        return latestAvailability?.availabilityByRecipientValue[recipient.value]?.response === response;
      })
      .map((recipient) => recipient.value);

    if (values.length) {
      setSelectedRecipientValues(values);
    }
  }

  function insertEmailSnippet(snippet: string) {
    setEmailBody((current) => appendSnippet(current, snippet));
  }

  function insertSmsSnippet(snippet: string) {
    setSmsBody((current) => appendSnippet(current, snippet));
  }

  const quickLinks = [
    {
      label: "Availability link",
      emailSnippet: `Please confirm your availability here:\n${availabilityUrl}`,
      smsSnippet: `Please confirm your availability here: ${availabilityUrl}`,
    },
    {
      label: "Player dashboard",
      emailSnippet: `Open your SIXFL player dashboard here:\n${playerDashboardUrl}`,
      smsSnippet: `Open your SIXFL player dashboard here: ${playerDashboardUrl}`,
    },
    {
      label: "Captain/dashboard link",
      emailSnippet: `Open the SIXFL team dashboard here:\n${captainUrl}`,
      smsSnippet: `Open the SIXFL team dashboard here: ${captainUrl}`,
    },
    {
      label: "Admin availability",
      emailSnippet: `Admin availability dashboard:\n${adminAvailabilityUrl}`,
      smsSnippet: `Admin availability dashboard: ${adminAvailabilityUrl}`,
    },
    {
      label: "Match fees",
      emailSnippet: `Match fees dashboard:\n${adminMatchFeesUrl}`,
      smsSnippet: `Match fees dashboard: ${adminMatchFeesUrl}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">
          Recipients
        </div>
        <div className="mt-2 text-xl font-semibold text-white">Choose who to contact</div>
        <p className="mt-1 text-sm text-white/60">
          Tick one or more recipients. This lets you send the same message to several linked players/prospects at once.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAllPlayers}
            className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Select all players
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/[0.08]"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearToPrimaryOnly}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/[0.06]"
          >
            {showTeamContactRecipient ? "Team contact only" : "Primary recipient only"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-500/[0.06] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/70">
                Latest fixture availability
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {availabilityLoading
                  ? "Loading next fixture..."
                  : latestAvailability?.fixture?.label ?? "No upcoming fixture found"}
              </div>
              <p className="mt-1 text-xs text-white/50">
                Use this to quickly message players who have not answered, are unavailable, or are maybe for the next match.
              </p>
            </div>

            <a
              href={adminAvailabilityUrl}
              className="inline-flex items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15"
            >
              Open availability dashboard
            </a>
          </div>

          {latestAvailability?.fixture ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => selectAvailabilityGroup("AVAILABLE")}
                className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/15"
              >
                Available: {latestAvailability.counts.available}
              </button>
              <button
                type="button"
                onClick={() => selectAvailabilityGroup("MAYBE")}
                className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-100 transition hover:bg-amber-500/15"
              >
                Maybe: {latestAvailability.counts.maybe}
              </button>
              <button
                type="button"
                onClick={() => selectAvailabilityGroup("UNAVAILABLE")}
                className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-red-100 transition hover:bg-red-500/15"
              >
                Unavailable: {latestAvailability.counts.unavailable}
              </button>
              <button
                type="button"
                onClick={() => selectAvailabilityGroup("NO_RESPONSE")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/65 transition hover:bg-white/[0.08]"
              >
                No response: {latestAvailability.counts.noResponse}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recipientOptions.map((recipient) => {
            const checked = selectedRecipientValues.includes(recipient.value);
            const availability = latestAvailability?.availabilityByRecipientValue[recipient.value] ?? null;

            return (
              <label
                key={recipient.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition ${
                  checked
                    ? "border-emerald-400/30 bg-emerald-500/10 text-white"
                    : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.05]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRecipient(recipient.value)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{recipient.label}</span>
                  <span className="mt-1 block text-xs text-white/45">
                    {recipient.type === "team" ? "Team contact" : recipient.type === "teamMember" ? "Linked player" : "Prospect"}
                    {recipient.roleLabel ? ` · ${recipient.roleLabel}` : ""}
                    {recipient.statusLabel ? ` · ${recipient.statusLabel}` : ""}
                  </span>
                  <span className="mt-1 block break-all text-xs text-white/50">
                    Email: {recipient.email || "—"}
                  </span>
                  <span className="mt-1 block break-all text-xs text-white/50">
                    SMS: {recipient.phone || "—"}
                  </span>

                  {recipient.type === "teamMember" ? (
                    <span
                      className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getAvailabilityClasses(
                        availability?.response,
                      )}`}
                    >
                      Latest fixture: {availability?.label ?? getAvailabilityShortLabel()}
                    </span>
                  ) : recipient.type === "prospect" ? (
                    <span className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/45">
                      Latest fixture: not linked
                    </span>
                  ) : null}

                  {availability?.note ? (
                    <span className="mt-2 block rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
                      Note: {availability.note}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
            Selected: {selectedCount}
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
            Email-ready: {selectedEmailCount}
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
            SMS-ready: {selectedSmsCount}
          </span>
          {selectedCount > 1 ? (
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">
              Tokens like {"{{firstName}}"} are personalised when queued.
            </span>
          ) : null}
        </div>
      </div>

      <MarketingToggle
        checked={isMarketingMessage}
        onChange={setIsMarketingMessage}
      />

      <form action={sendTeamCommunicationBulkMessageAction} className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="EMAIL" />
        <input type="hidden" name="isMarketing" value={isMarketingMessage ? "1" : "0"} />
        <input type="hidden" name="templateId" value={selectedEmailTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedEmailTemplate?.key || ""} />
        <input type="hidden" name="ctaLabel" value={selectedEmailTemplate?.ctaLabel || ""} />
        <input type="hidden" name="ctaUrl" value={selectedEmailTemplate?.ctaUrl || ""} />
        <input type="hidden" name="claimCode" value={claimCode || ""} />
        <input type="hidden" name="claimLink" value={claimLink || ""} />
        <input type="hidden" name="captainDashboardUrl" value={captainUrl} />
        {selectedRecipientValues.map((value) => (
          <input key={`email-${value}`} type="hidden" name="recipientValues" value={value} />
        ))}

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">EMAIL</div>
        <div className="mt-2 text-xl font-semibold text-white">
          Send email to {selectedEmailCount} selected recipient{selectedEmailCount === 1 ? "" : "s"}
        </div>
        <div className="mt-1 text-sm text-white/60">
          Recipients without email addresses will be skipped.
        </div>

        <div className="mt-5 space-y-4">
          <TemplateSelect
            label="Email template"
            value={selectedEmailTemplateId}
            onChange={setSelectedEmailTemplateId}
            options={emailTemplates.map((template) => ({ value: template.id, label: template.name }))}
            placeholder="Select email template"
          />

          {selectedEmailTemplate?.description ? (
            <p className="text-xs text-white/45">{selectedEmailTemplate.description}</p>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
              Insert CTA / link
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickLinks.map((link) => (
                <button
                  key={`email-${link.label}`}
                  type="button"
                  onClick={() => insertEmailSnippet(link.emailSnippet)}
                  className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          <input
            name="subject"
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Subject"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-400"
          />
          <textarea
            name="body"
            rows={8}
            value={emailBody}
            onChange={(event) => setEmailBody(event.target.value)}
            placeholder="Write your message..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          disabled={selectedEmailCount === 0}
          className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
        >
          Queue email
        </button>
      </form>

      <form action={sendTeamCommunicationBulkMessageAction} className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="SMS" />
        <input type="hidden" name="isMarketing" value={isMarketingMessage ? "1" : "0"} />
        <input type="hidden" name="templateId" value={selectedSmsTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedSmsTemplate?.key || ""} />
        <input type="hidden" name="claimCode" value={claimCode || ""} />
        <input type="hidden" name="claimLink" value={claimLink || ""} />
        <input type="hidden" name="captainDashboardUrl" value={captainUrl} />
        {selectedRecipientValues.map((value) => (
          <input key={`sms-${value}`} type="hidden" name="recipientValues" value={value} />
        ))}

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">SMS</div>
        <div className="mt-2 text-xl font-semibold text-white">
          Send SMS to {selectedSmsCount} selected recipient{selectedSmsCount === 1 ? "" : "s"}
        </div>
        <div className="mt-1 text-sm text-white/60">
          Recipients without mobile numbers will be skipped. Ask players to use dashboard links rather than replying YES/NO by text.
        </div>

        <div className="mt-5 space-y-4">
          <TemplateSelect
            label="SMS template"
            value={selectedSmsTemplateId}
            onChange={setSelectedSmsTemplateId}
            options={smsTemplates.map((template) => ({ value: template.id, label: template.name }))}
            placeholder="Select SMS template"
          />

          {selectedSmsTemplate?.description ? (
            <p className="text-xs text-white/45">{selectedSmsTemplate.description}</p>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
              Insert CTA / link
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickLinks.map((link) => (
                <button
                  key={`sms-${link.label}`}
                  type="button"
                  onClick={() => insertSmsSnippet(link.smsSnippet)}
                  className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            name="body"
            rows={8}
            value={smsBody}
            onChange={(event) => setSmsBody(event.target.value)}
            placeholder="Write your SMS..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          disabled={selectedSmsCount === 0}
          className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/35"
        >
          Queue SMS
        </button>
      </form>
    </div>
  );
}
