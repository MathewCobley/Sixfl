"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import FormListboxField from "@/components/ui/FormListboxField";
import {
  EMPTY_LEAD_FILTERS, LEAD_TYPES, LEAD_STATUSES, LEAD_NIGHTS, LEAD_FILTER_KEYS,
  leadCampaignHref, leadCampaignConfirmation,
  type LeadCampaignFilters, type LeadCampaignChannel, type LeadCampaignTemplate,
  type LeadCampaignPreview, type LeadCampaignSendResult,
} from "@/lib/leads/campaign-filters";
import { previewLeadCampaignAction, sendLeadCampaignAction } from "@/app/(admin)/admin/communications/lead-campaign-actions";

type Option = { value: string; label: string };
export type LeadCampaignOptions = { areas: Option[]; leagues: Option[]; templates: LeadCampaignTemplate[]; managedTeams: Option[] };
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
const choices = (values: readonly string[], all: string): Option[] => [{ value: "", label: all }, ...values.map(value => ({ value, label: titleCase(value) }))];
const inputClass = "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-50";

export default function CommunicationsLeadCampaigns({ areas, leagues, templates, managedTeams }: LeadCampaignOptions) {
  const [filters, setFilters] = useState<LeadCampaignFilters>({ ...EMPTY_LEAD_FILTERS });
  const [channel, setChannel] = useState<LeadCampaignChannel>("EMAIL");
  const [preview, setPreview] = useState<LeadCampaignPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<LeadCampaignSendResult | null>(null);
  const previewRequest = useRef(0);
  const sendLock = useRef(false);

  function invalidatePreview() {
    previewRequest.current += 1;
    setPreview(null); setSelectedIds([]); setConfirmation(""); setLoading(false); setResult(null);
  }
  function changeFilter(key: keyof LeadCampaignFilters, value: string) {
    invalidatePreview();
    setFilters(current => ({ ...current, [key]: value }));
  }
  function changeChannel(value: LeadCampaignChannel) {
    if (value === channel) return;
    invalidatePreview(); setChannel(value); setTemplateId(""); setSubject(""); setBody(""); setTargetTeamId("");
  }
  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const request = ++previewRequest.current;
    setLoading(true); setPreview(null); setSelectedIds([]); setConfirmation(""); setResult(null);
    try {
      const next = await previewLeadCampaignAction(data);
      if (request !== previewRequest.current) return;
      setPreview(next);
      setSelectedIds(next.ok ? (next.recipients || []).map(row => row.id) : []);
    } catch {
      if (request === previewRequest.current) setPreview({ ok: false, error: "Could not load leads. Please try again." });
    } finally {
      if (request === previewRequest.current) setLoading(false);
    }
  }
  async function sendCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendLock.current || !preview?.ok || !selectedIds.length) return;
    const data = new FormData(event.currentTarget);
    sendLock.current = true; setSending(true); setResult(null);
    try {
      const next = await sendLeadCampaignAction({}, data);
      setResult(next);
      if (next.ok) {
        setPreview(null); setSelectedIds([]); setConfirmation("");
      }
    } catch {
      setResult({ ok: false, error: "The send could not be confirmed. Check message history before trying again." });
    } finally {
      sendLock.current = false; setSending(false);
    }
  }
  function toggleRecipient(id: string) {
    setConfirmation(""); setResult(null);
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }
  const recipients = preview?.ok ? preview.recipients || [] : [];
  const selectedRecipients = recipients.filter(row => selectedIds.includes(row.id));
  const availableTemplates = templates.filter(template => template.channel === channel &&
    (!template.interestType || selectedRecipients.every(row => row.interestType === template.interestType)));
  const selectedTemplate = availableTemplates.find(template => template.id === templateId) || null;
  const needsTeam = selectedTemplate?.ctaUrlKey === "teamJoinUrl";
  const phrase = leadCampaignConfirmation(selectedIds.length, channel);
  const canSend = selectedIds.length > 0 && Boolean(selectedTemplate) && body.trim() &&
    (channel === "SMS" || subject.trim()) && (!needsTeam || targetTeamId) &&
    (selectedIds.length <= 20 || confirmation.trim().replace(/\s+/g, " ").toUpperCase() === phrase);
  const fields: { key: keyof LeadCampaignFilters; label: string; options: Option[] }[] = [
    { key: "type", label: "Lead type", options: choices(LEAD_TYPES, "All lead types") },
    { key: "status", label: "Status", options: choices(LEAD_STATUSES, "All statuses") },
    { key: "area", label: "Area", options: [{ value: "", label: "All areas" }, ...areas] },
    { key: "night", label: "Preferred night", options: choices(LEAD_NIGHTS, "All nights") },
    { key: "league", label: "Prospective league", options: [{ value: "", label: "All prospective leagues" }, { value: "unassigned", label: "No prospective league set" }, ...leagues] },
    { key: "excludeType", label: "Exclude lead type", options: choices(LEAD_TYPES, "Do not exclude a type") },
    { key: "excludeStatus", label: "Exclude status", options: choices(LEAD_STATUSES, "Do not exclude a status") },
  ];

  return (
    <div className="space-y-6" data-comms-lead-campaigns>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Lead campaigns</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Choose leads and send a message</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Use the same filters as Leads, review the matching contacts, then choose an email or SMS template. Stay here in Comms throughout.</p>
        </div>
        <Link href={leadCampaignHref(filters)} className="py-2 text-sm font-semibold text-emerald-200 underline">Open these filters in Leads</Link>
      </div>
      <div className="flex gap-2" role="group" aria-label="Lead message channel">
        {(["EMAIL", "SMS"] as const).map(value => <button key={value} type="button" disabled={sending} aria-pressed={channel === value} onClick={() => changeChannel(value)} className={`min-h-11 rounded-xl border px-5 text-sm font-semibold ${channel === value ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 text-white/60"}`}>{value === "EMAIL" ? "Email" : "SMS"}</button>)}
      </div>
      <form onSubmit={applyFilters} aria-label="Lead campaign filters" className="space-y-4">
        <input type="hidden" name="channel" value={channel} />
        <fieldset disabled={sending} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <legend className="mb-3 text-sm font-semibold text-white/80">1. Filter your leads</legend>
          {fields.map(field => <FormListboxField key={field.key} name={field.key} label={field.label} value={filters[field.key]} options={field.options} disabled={sending} onValueChange={value => changeFilter(field.key, value)} />)}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={loading || sending} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{loading ? "Loading leads…" : "Apply filters"}</button>
          <button type="button" disabled={sending} onClick={() => { invalidatePreview(); setFilters({ ...EMPTY_LEAD_FILTERS }); }} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white/70">Clear filters</button>
          <span className="text-xs text-white/50">Changing any filter clears the previous recipient selection.</span>
        </div>
      </form>
      {result ? <div role={result.ok ? "status" : "alert"} className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-400/30 text-emerald-100" : "border-amber-400/30 text-amber-100"}`}>{result.ok ? `${result.sentCount || 0} messages queued${result.failedCount ? `; ${result.failedCount} could not be queued` : ""}. Check delivery in Comms. Apply filters again before another send.` : result.error}</div> : null}
      {preview?.error ? <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-100">{preview.error}</p> : null}
      {!preview && !loading && !result ? <p className="rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-white/55">Apply filters to see the matching leads. No messages are sent when you filter or select recipients.</p> : null}
      {preview?.ok ? (
        <form onSubmit={sendCampaign} aria-label="Lead campaign message" className="space-y-5 border-t border-white/10 pt-5">
          <input type="hidden" name="channel" value={preview.channel} />
          {LEAD_FILTER_KEYS.map(key => <input key={key} type="hidden" name={key} value={preview.filters?.[key] || ""} />)}
          <input type="hidden" name="templateId" value={templateId} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div aria-live="polite">
              <h3 className="font-semibold text-white">{preview.matchingCount || 0} matching leads · {selectedIds.length} selected</h3>
              <p className="mt-1 text-xs text-white/55">{recipients.length} {channel === "EMAIL" ? "email" : "SMS"}-ready{preview.missingContactCount ? ` · ${preview.missingContactCount} without a usable ${channel === "EMAIL" ? "email address" : "UK mobile number"}` : ""}. Expansion-partner enquiries are kept in their separate workflow.</p>
            </div>
            <div className="flex gap-3 text-sm">
              <button type="button" disabled={sending || !recipients.length} onClick={() => { setSelectedIds(recipients.map(row => row.id)); setConfirmation(""); }} className="min-h-11 text-emerald-200 underline">Select all matching</button>
              <button type="button" disabled={sending} onClick={() => { setSelectedIds([]); setConfirmation(""); }} className="min-h-11 text-white/60 underline">Clear selection</button>
            </div>
          </div>
          {recipients.length ? <div className="max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-white/10 p-2" aria-label="Matching lead recipients">
            {recipients.map(row => <label key={row.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.03] p-3 hover:bg-white/[0.06]">
              <input type="checkbox" name="includedLeadIds" value={row.id} checked={selectedIds.includes(row.id)} disabled={sending} onChange={() => toggleRecipient(row.id)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{row.contactName || "Unnamed lead"}</span><span className="block break-all text-sm text-white/60">{channel === "EMAIL" ? row.email : row.phone}</span><span className="mt-1 block text-xs text-white/45">{titleCase(row.interestType)} · {titleCase(row.status)}{row.area ? ` · ${row.area}` : ""} · {row.leagueLabel}</span></span>
              <Link href={`/admin/leads/${encodeURIComponent(row.id)}`} target="_blank" className="shrink-0 py-1 text-xs text-emerald-200 underline" aria-label={`Open ${row.contactName || "lead"} in new tab`}>Open</Link>
            </label>)}
          </div> : <p className="rounded-xl bg-white/[0.03] p-4 text-sm text-white/65">No sendable leads match these filters. Change the filters or choose the other channel.</p>}
          {recipients.length ? <fieldset disabled={sending} className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-white/80">2. Choose your template and review the message</legend>
            <FormListboxField name="campaignTemplateChoice" label="Template" value={selectedTemplate?.id || ""} options={availableTemplates.map(template => ({ value: template.id, label: template.label }))} placeholder="Choose a template" disabled={sending} onValueChange={id => { const template = templates.find(item => item.id === id); setTemplateId(id); setSubject(template?.subject || ""); setBody(template?.body || ""); setTargetTeamId(""); setResult(null); }} />
            {selectedTemplate?.ctaLabel ? <p className="text-xs text-emerald-200">Email button: {selectedTemplate.ctaLabel}. Personalised links are created by the existing Leads sender.</p> : null}
            {needsTeam ? <FormListboxField name="targetTeamId" label="Target managed team" value={targetTeamId} options={managedTeams} disabled={sending} onValueChange={setTargetTeamId} /> : null}
            {channel === "EMAIL" ? <label className="block space-y-2 text-sm text-white/70"><span>Subject</span><input name="subject" required value={subject} onChange={event => setSubject(event.target.value)} maxLength={300} className={inputClass} /></label> : null}
            <label className="block space-y-2 text-sm text-white/70"><span>Message</span><textarea name="body" required value={body} onChange={event => setBody(event.target.value)} maxLength={30000} rows={channel === "EMAIL" ? 9 : 4} className={inputClass} /></label>
            {selectedIds.length > 20 ? <label className="block space-y-2 rounded-xl border border-amber-400/25 bg-amber-500/5 p-4 text-sm text-amber-100"><span>Type <strong>{phrase}</strong> to confirm these {selectedIds.length} selected leads.</span><input name="bulkSendConfirmation" aria-label="Bulk send confirmation" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={phrase} className={inputClass} /></label> : null}
            <button type="submit" disabled={!canSend || sending} className="min-h-12 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">{sending ? "Queueing messages…" : `Send ${channel === "EMAIL" ? "email" : "SMS"} to ${selectedIds.length} selected lead${selectedIds.length === 1 ? "" : "s"}`}</button>
          </fieldset> : null}
        </form>
      ) : null}
    </div>
  );
}
