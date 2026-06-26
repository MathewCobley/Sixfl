// ========================================
// File: src/components/admin/communications/AllTeamsCommunicationsComposer.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { sendAllTeamsCommunicationMessageAction } from "@/app/(admin)/admin/communications/all-team-actions";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";

type Channel = "EMAIL" | "SMS";

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
  ctaUrl: string | null;
};

type TeamOption = {
  id: string;
  name: string;
  leagueLabel: string | null;
  emailReady: boolean;
  smsReady: boolean;
};

type Props = {
  fromPath: string;
  teams: TeamOption[];
  emailTemplates: EmailTemplateOption[];
  smsTemplates: SmsTemplateOption[];
};

const ALL_LEAGUES_VALUE = "all";
const NO_LEAGUE_LABEL = "No league assigned";

const DEFAULT_SUMMER_LEAGUE_TEMPLATE: EmailTemplateOption = {
  id: "summer-league-returning-teams-inline-template",
  key: "summer-league-returning-teams",
  name: "Summer League returning teams",
  subject: "SIXFL Summer League – starts 30th June",
  description:
    "Email old or inactive teams to ask whether they want to join the next SIXFL Summer League.",
  ctaLabel: null,
  ctaUrl: null,
  body: [
    "Hi,",
    "",
    "Hope you’re well.",
    "",
    "We’re getting ready to start the new SIXFL Summer League, which kicks off on 30th June, and I wanted to check whether your team would like to be involved again.",
    "",
    "I know you were not involved at the end of the previous league, but we’d be really pleased to have you back if the timing now works better.",
    "",
    "If you’re interested, just reply to this email and I’ll get you added to the list.",
    "",
    "If you’re not looking to enter this time, no problem at all — it would still be useful to know either way so we can plan the league numbers.",
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n"),
};

const DEFAULT_TEAM_SMS_TEMPLATE: SmsTemplateOption = {
  id: "selected-teams-sms-inline-template",
  key: "selected-teams-sms",
  name: "Selected teams SMS",
  description: "Short SMS update for selected team contacts.",
  ctaUrl: null,
  body: "Hi {{firstName}}, quick SIXFL update for {{teamName}}:",
};

function getTeamLeagueLabel(team: TeamOption) {
  return team.leagueLabel || NO_LEAGUE_LABEL;
}

function getChannelLabel(channel: Channel) {
  return channel === "SMS" ? "SMS" : "email";
}

function isTeamReadyForChannel(team: TeamOption, channel: Channel) {
  return channel === "SMS" ? team.smsReady : team.emailReady;
}

function LeagueFilterPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        League filter
      </div>
      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
        {[ALL_LEAGUES_VALUE, ...options].map((option) => {
          const label = option === ALL_LEAGUES_VALUE ? "All leagues / unassigned" : option;
          const active = value === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={[
                "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                active
                  ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChannelPicker({
  value,
  onChange,
}: {
  value: Channel;
  onChange: (value: Channel) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["EMAIL", "SMS"] as const).map((channel) => {
        const active = value === channel;

        return (
          <button
            key={channel}
            type="button"
            onClick={() => onChange(channel)}
            className={[
              "rounded-2xl border px-4 py-3 text-left transition",
              active
                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                : "border-white/10 bg-black/25 text-white/60 hover:bg-white/[0.05] hover:text-white",
            ].join(" ")}
          >
            <span className="block text-sm font-semibold">
              {channel === "SMS" ? "SMS selected teams" : "Email selected teams"}
            </span>
            <span className="mt-1 block text-xs leading-5 opacity-70">
              {channel === "SMS"
                ? "Short urgent texts to saved mobile numbers."
                : "Longer messages to saved team contact emails."}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TeamPicker({
  teams,
  selectedTeamIds,
  selectedChannel,
  leagueFilter,
  onLeagueFilterChange,
  onToggle,
  onSelectAll,
  onSelectReady,
  onClear,
}: {
  teams: TeamOption[];
  selectedTeamIds: string[];
  selectedChannel: Channel;
  leagueFilter: string;
  onLeagueFilterChange: (value: string) => void;
  onToggle: (teamId: string) => void;
  onSelectAll: (teamIds: string[]) => void;
  onSelectReady: (teamIds: string[]) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");

  const leagueOptions = useMemo(() => {
    return Array.from(new Set(teams.map(getTeamLeagueLabel))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [teams]);

  const visibleTeams = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();

    return teams.filter((team) => {
      const leagueLabel = getTeamLeagueLabel(team);
      const matchesLeague = leagueFilter === ALL_LEAGUES_VALUE || leagueLabel === leagueFilter;
      const matchesQuery =
        !normalisedQuery ||
        team.name.toLowerCase().includes(normalisedQuery) ||
        leagueLabel.toLowerCase().includes(normalisedQuery);

      return matchesLeague && matchesQuery;
    });
  }, [leagueFilter, query, teams]);

  const visibleTeamIds = visibleTeams.map((team) => team.id);
  const visibleReadyTeamIds = visibleTeams
    .filter((team) => isTeamReadyForChannel(team, selectedChannel))
    .map((team) => team.id);
  const selectedVisibleCount = visibleTeamIds.filter((teamId) =>
    selectedTeamIds.includes(teamId),
  ).length;
  const selectedVisibleReadyCount = visibleReadyTeamIds.filter((teamId) =>
    selectedTeamIds.includes(teamId),
  ).length;
  const channelLabel = getChannelLabel(selectedChannel);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Choose teams</div>
          <div className="mt-1 text-xs text-white/50">
            Pick exactly which teams should receive this {channelLabel}. Changing the league filter now changes the recipient selection.
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          {selectedVisibleCount} of {visibleTeams.length} visible selected · {selectedTeamIds.length} total
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search teams or leagues"
          className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40"
        />
        <LeagueFilterPicker
          options={leagueOptions}
          value={leagueFilter}
          onChange={onLeagueFilterChange}
        />
      </div>

      {leagueFilter !== ALL_LEAGUES_VALUE ? (
        <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-emerald-100/85">
          Sending is currently limited to <strong>{leagueFilter}</strong>. {selectedVisibleReadyCount} visible {channelLabel}-ready team{selectedVisibleReadyCount === 1 ? "" : "s"} selected.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectAll(visibleTeamIds)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
        >
          Select visible teams
        </button>
        <button
          type="button"
          onClick={() => onSelectReady(visibleReadyTeamIds)}
          className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          Select visible {channelLabel}-ready only
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/5"
        >
          Clear
        </button>
      </div>

      <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3">
        {visibleTeams.length === 0 ? (
          <div className="px-3 py-6 text-sm text-white/45">No teams match that filter.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {visibleTeams.map((team) => {
              const selected = selectedTeamIds.includes(team.id);
              const ready = isTeamReadyForChannel(team, selectedChannel);

              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => onToggle(team.id)}
                  className={[
                    "rounded-2xl border px-3 py-3 text-left transition",
                    selected
                      ? "border-emerald-400/35 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{team.name}</div>
                      <div className="mt-1 text-xs text-white/45">{getTeamLeagueLabel(team)}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                        <span className={team.emailReady ? "text-emerald-200" : "text-white/30"}>
                          Email
                        </span>
                        <span className="text-white/20">/</span>
                        <span className={team.smsReady ? "text-emerald-200" : "text-white/30"}>
                          SMS
                        </span>
                      </div>
                    </div>
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        ready
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-amber-500/15 text-amber-200",
                      ].join(" ")}
                    >
                      {ready ? channelLabel : "missing"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AllTeamsCommunicationsComposer({
  fromPath,
  teams,
  emailTemplates,
  smsTemplates,
}: Props) {
  const [selectedChannel, setSelectedChannel] = useState<Channel>("EMAIL");
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState(DEFAULT_SUMMER_LEAGUE_TEMPLATE.id);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_SUMMER_LEAGUE_TEMPLATE.subject);
  const [emailBody, setEmailBody] = useState(DEFAULT_SUMMER_LEAGUE_TEMPLATE.body);
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState(DEFAULT_TEAM_SMS_TEMPLATE.id);
  const [smsBody, setSmsBody] = useState(DEFAULT_TEAM_SMS_TEMPLATE.body);
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState(ALL_LEAGUES_VALUE);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(() =>
    teams.filter((team) => team.emailReady).map((team) => team.id),
  );

  const emailTemplateOptions = useMemo(
    () => [DEFAULT_SUMMER_LEAGUE_TEMPLATE, ...emailTemplates],
    [emailTemplates],
  );
  const smsTemplateOptions = useMemo(
    () => [DEFAULT_TEAM_SMS_TEMPLATE, ...smsTemplates],
    [smsTemplates],
  );

  const selectedEmailTemplate = useMemo(
    () =>
      emailTemplateOptions.find((template) => template.id === selectedEmailTemplateId) ??
      DEFAULT_SUMMER_LEAGUE_TEMPLATE,
    [emailTemplateOptions, selectedEmailTemplateId],
  );
  const selectedSmsTemplate = useMemo(
    () =>
      smsTemplateOptions.find((template) => template.id === selectedSmsTemplateId) ??
      DEFAULT_TEAM_SMS_TEMPLATE,
    [selectedSmsTemplateId, smsTemplateOptions],
  );

  useEffect(() => {
    const availableTeamIds = new Set(teams.map((team) => team.id));
    setSelectedTeamIds((current) => current.filter((teamId) => availableTeamIds.has(teamId)));
  }, [teams]);

  function getReadyTeamIdsForLeague(channel: Channel, leagueFilter: string) {
    return teams
      .filter((team) => leagueFilter === ALL_LEAGUES_VALUE || getTeamLeagueLabel(team) === leagueFilter)
      .filter((team) => isTeamReadyForChannel(team, channel))
      .map((team) => team.id);
  }

  function handleChannelChange(channel: Channel) {
    setSelectedChannel(channel);
    setSelectedTeamIds(getReadyTeamIdsForLeague(channel, selectedLeagueFilter));
  }

  function handleLeagueFilterChange(leagueFilter: string) {
    setSelectedLeagueFilter(leagueFilter);
    setSelectedTeamIds(getReadyTeamIdsForLeague(selectedChannel, leagueFilter));
  }

  function handleEmailTemplateChange(templateId: string) {
    setSelectedEmailTemplateId(templateId);
    const template = emailTemplateOptions.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setEmailSubject("");
      setEmailBody("");
      return;
    }

    setEmailSubject(template.subject);
    setEmailBody(template.body);
  }

  function handleSmsTemplateChange(templateId: string) {
    setSelectedSmsTemplateId(templateId);
    const template = smsTemplateOptions.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setSmsBody("");
      return;
    }

    setSmsBody(template.body);
  }

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );
  }

  const selectedEmailReadyCount = selectedTeamIds.filter((teamId) => {
    const team = teams.find((item) => item.id === teamId);
    return Boolean(team?.emailReady);
  }).length;
  const selectedSmsReadyCount = selectedTeamIds.filter((teamId) => {
    const team = teams.find((item) => item.id === teamId);
    return Boolean(team?.smsReady);
  }).length;
  const selectedReadyCount =
    selectedChannel === "SMS" ? selectedSmsReadyCount : selectedEmailReadyCount;
  const selectedTemplate =
    selectedChannel === "SMS" ? selectedSmsTemplate : selectedEmailTemplate;
  const selectedBody = selectedChannel === "SMS" ? smsBody : emailBody;
  const selectedSubject = selectedChannel === "SMS" ? "" : emailSubject;
  const channelLabel = getChannelLabel(selectedChannel);
  const canSubmit =
    selectedTeamIds.length > 0 &&
    selectedReadyCount > 0 &&
    selectedBody.trim().length > 0 &&
    (selectedChannel === "SMS" || selectedSubject.trim().length > 0);

  return (
    <form
      action={sendAllTeamsCommunicationMessageAction}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
    >
      <input type="hidden" name="from" value={fromPath} />
      <input type="hidden" name="channel" value={selectedChannel} />
      <input type="hidden" name="templateId" value={selectedTemplate.id} />
      <input type="hidden" name="templateKey" value={selectedTemplate.key} />
      <input
        type="hidden"
        name="ctaLabel"
        value={selectedChannel === "SMS" ? "" : selectedEmailTemplate.ctaLabel || ""}
      />
      <input type="hidden" name="ctaUrl" value={selectedTemplate.ctaUrl || ""} />
      <input type="hidden" name="selectedLeagueFilter" value={selectedLeagueFilter} />
      <input type="hidden" name="subject" value={selectedSubject} />
      <input type="hidden" name="body" value={selectedBody} />
      {selectedTeamIds.map((teamId) => (
        <input key={teamId} type="hidden" name="teamIds" value={teamId} />
      ))}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/80">
            All-team messaging
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Email or SMS selected teams</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Use this for messages that are not tied to one league, such as inviting old teams into a new season or sending urgent operational texts.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {selectedReadyCount} {channelLabel}-ready · {selectedTeamIds.length} selected
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <ChannelPicker value={selectedChannel} onChange={handleChannelChange} />

        {selectedChannel === "EMAIL" ? (
          <>
            <TemplateSelect
              label="Email template"
              value={selectedEmailTemplateId}
              onChange={handleEmailTemplateChange}
              options={emailTemplateOptions.map((template) => ({ value: template.id, label: template.name }))}
              placeholder="Select email template"
            />

            {selectedEmailTemplate.description ? (
              <p className="text-xs text-white/45">{selectedEmailTemplate.description}</p>
            ) : null}
          </>
        ) : (
          <>
            <TemplateSelect
              label="SMS template"
              value={selectedSmsTemplateId}
              onChange={handleSmsTemplateChange}
              options={smsTemplateOptions.map((template) => ({
                value: template.id,
                label: template.name,
                description: template.description,
              }))}
              placeholder="Select SMS template"
            />

            {selectedSmsTemplate.description ? (
              <p className="text-xs text-white/45">{selectedSmsTemplate.description}</p>
            ) : null}
          </>
        )}

        <TeamPicker
          teams={teams}
          selectedTeamIds={selectedTeamIds}
          selectedChannel={selectedChannel}
          leagueFilter={selectedLeagueFilter}
          onLeagueFilterChange={handleLeagueFilterChange}
          onToggle={toggleTeam}
          onSelectAll={(teamIds) => setSelectedTeamIds(teamIds)}
          onSelectReady={(teamIds) => setSelectedTeamIds(teamIds)}
          onClear={() => setSelectedTeamIds([])}
        />

        {selectedChannel === "EMAIL" ? (
          <input
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Subject"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          />
        ) : null}

        <textarea
          rows={selectedChannel === "SMS" ? 7 : 12}
          value={selectedBody}
          onChange={(event) =>
            selectedChannel === "SMS"
              ? setSmsBody(event.target.value)
              : setEmailBody(event.target.value)
          }
          placeholder={selectedChannel === "SMS" ? "Write your SMS..." : "Write your email..."}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-emerald-400"
        />

        {selectedChannel === "SMS" ? (
          <p className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-xs leading-5 text-sky-100/85">
            SMS sends only to teams with a saved mobile number. The SIXFL SMS signature and quiet-hours handling are applied by the notification system.
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Queue {channelLabel} to selected teams
      </button>
    </form>
  );
}
