// ========================================
// File: src/components/admin/communications/AllTeamsCommunicationsComposer.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { sendAllTeamsCommunicationMessageAction } from "@/app/(admin)/admin/communications/all-team-actions";
import TemplateSelect from "@/components/admin/leads/TemplateSelect";

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

type TeamOption = {
  id: string;
  name: string;
  leagueLabel: string | null;
  emailReady: boolean;
};

type Props = {
  fromPath: string;
  teams: TeamOption[];
  emailTemplates: EmailTemplateOption[];
};

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

function TeamPicker({
  teams,
  selectedTeamIds,
  onToggle,
  onSelectAll,
  onSelectEmailReady,
  onClear,
}: {
  teams: TeamOption[];
  selectedTeamIds: string[];
  onToggle: (teamId: string) => void;
  onSelectAll: () => void;
  onSelectEmailReady: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("all");

  const leagueOptions = useMemo(() => {
    const labels = Array.from(
      new Set(teams.map((team) => team.leagueLabel || "No league assigned")),
    ).sort((a, b) => a.localeCompare(b));

    return labels;
  }, [teams]);

  const filteredTeams = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();

    return teams.filter((team) => {
      const leagueLabel = team.leagueLabel || "No league assigned";
      const matchesLeague = leagueFilter === "all" || leagueLabel === leagueFilter;
      const matchesQuery =
        !normalisedQuery ||
        team.name.toLowerCase().includes(normalisedQuery) ||
        leagueLabel.toLowerCase().includes(normalisedQuery);

      return matchesLeague && matchesQuery;
    });
  }, [leagueFilter, query, teams]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Choose teams</div>
          <div className="mt-1 text-xs text-white/50">
            Pick exactly which teams should receive this email. Teams with no email are shown but will be skipped.
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          {selectedTeamIds.length} selected
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search teams or leagues"
          className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40"
        />
        <select
          value={leagueFilter}
          onChange={(event) => setLeagueFilter(event.target.value)}
          className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-emerald-400/40"
        >
          <option value="all">All leagues / unassigned</option>
          {leagueOptions.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onSelectEmailReady}
          className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          Select email-ready only
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
        {filteredTeams.length === 0 ? (
          <div className="px-3 py-6 text-sm text-white/45">No teams match that filter.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {filteredTeams.map((team) => {
              const selected = selectedTeamIds.includes(team.id);

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
                      <div className="mt-1 text-xs text-white/45">
                        {team.leagueLabel || "No league assigned"}
                      </div>
                    </div>
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        team.emailReady
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-amber-500/15 text-amber-200",
                      ].join(" ")}
                    >
                      {team.emailReady ? "email" : "missing"}
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
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_SUMMER_LEAGUE_TEMPLATE.id);
  const [subject, setSubject] = useState(DEFAULT_SUMMER_LEAGUE_TEMPLATE.subject);
  const [body, setBody] = useState(DEFAULT_SUMMER_LEAGUE_TEMPLATE.body);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(() =>
    teams.filter((team) => team.emailReady).map((team) => team.id),
  );

  const templates = useMemo(() => [DEFAULT_SUMMER_LEAGUE_TEMPLATE, ...emailTemplates], [emailTemplates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? DEFAULT_SUMMER_LEAGUE_TEMPLATE,
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    const availableTeamIds = new Set(teams.map((team) => team.id));
    setSelectedTeamIds((current) => current.filter((teamId) => availableTeamIds.has(teamId)));
  }, [teams]);

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setSubject("");
      setBody("");
      return;
    }

    setSubject(template.subject);
    setBody(template.body);
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

  return (
    <form
      action={sendAllTeamsCommunicationMessageAction}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
    >
      <input type="hidden" name="from" value={fromPath} />
      <input type="hidden" name="templateId" value={selectedTemplate.id} />
      <input type="hidden" name="templateKey" value={selectedTemplate.key} />
      <input type="hidden" name="ctaLabel" value={selectedTemplate.ctaLabel || ""} />
      <input type="hidden" name="ctaUrl" value={selectedTemplate.ctaUrl || ""} />
      {selectedTeamIds.map((teamId) => (
        <input key={teamId} type="hidden" name="teamIds" value={teamId} />
      ))}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/80">
            All-team email
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Email selected teams</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Use this for messages that are not tied to one league, such as inviting old teams into a new season.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {selectedEmailReadyCount} email-ready · {selectedTeamIds.length} selected
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <TemplateSelect
          label="Email template"
          value={selectedTemplateId}
          onChange={handleTemplateChange}
          options={templates.map((template) => ({ value: template.id, label: template.name }))}
          placeholder="Select email template"
        />

        {selectedTemplate.description ? (
          <p className="text-xs text-white/45">{selectedTemplate.description}</p>
        ) : null}

        <TeamPicker
          teams={teams}
          selectedTeamIds={selectedTeamIds}
          onToggle={toggleTeam}
          onSelectAll={() => setSelectedTeamIds(teams.map((team) => team.id))}
          onSelectEmailReady={() =>
            setSelectedTeamIds(teams.filter((team) => team.emailReady).map((team) => team.id))
          }
          onClear={() => setSelectedTeamIds([])}
        />

        <input
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
        />

        <textarea
          name="body"
          rows={12}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write your email..."
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-emerald-400"
        />
      </div>

      <button
        type="submit"
        disabled={selectedTeamIds.length === 0}
        className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Queue email to selected teams
      </button>
    </form>
  );
}
