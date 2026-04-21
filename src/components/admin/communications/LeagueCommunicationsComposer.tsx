// ========================================
// File: src/components/admin/communications/LeagueCommunicationsComposer.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";

import { sendLeagueCommunicationMessageAction } from "@/app/(admin)/admin/communications/actions";
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

type SmsTemplateOption = {
  id: string;
  key: string;
  name: string;
  body: string;
  description: string | null;
};

type TeamOption = {
  id: string;
  name: string;
  emailReady: boolean;
  smsReady: boolean;
};

type Props = {
  leagueId: string;
  fromPath: string;
  leagueName: string;
  teamCount: number;
  teams: TeamOption[];
  emailTemplates: EmailTemplateOption[];
  smsTemplates: SmsTemplateOption[];
};

function resolveText(text: string, context: { leagueName: string }) {
  return text.replaceAll("{{leagueName}}", context.leagueName);
}

function TeamSelectionCard({
  title,
  helpText,
  teams,
  selectedTeamIds,
  onToggle,
  availabilityKey,
}: {
  title: string;
  helpText: string;
  teams: TeamOption[];
  selectedTeamIds: string[];
  onToggle: (teamId: string) => void;
  availabilityKey: "emailReady" | "smsReady";
}) {
  const selectedCount = selectedTeamIds.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-white/50">{helpText}</div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          {selectedCount} selected
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {teams.map((team) => {
          const isSelected = selectedTeamIds.includes(team.id);
          const isReady = team[availabilityKey];

          return (
            <button
              key={team.id}
              type="button"
              onClick={() => onToggle(team.id)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                isSelected
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10",
              ].join(" ")}
            >
              <span>{team.name}</span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                  isReady
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-amber-500/15 text-amber-200",
                ].join(" ")}
              >
                {isReady ? "ready" : "missing"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LeagueCommunicationsComposer({
  leagueId,
  fromPath,
  leagueName,
  teamCount,
  teams,
  emailTemplates,
  smsTemplates,
}: Props) {
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [selectedEmailTeamIds, setSelectedEmailTeamIds] = useState<string[]>(() =>
    teams.map((team) => team.id),
  );
  const [selectedSmsTeamIds, setSelectedSmsTeamIds] = useState<string[]>(() =>
    teams.map((team) => team.id),
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
    setSelectedEmailTeamIds((current) => {
      const availableIds = new Set(teams.map((team) => team.id));
      const next = current.filter((teamId) => availableIds.has(teamId));
      return next.length > 0 ? next : teams.map((team) => team.id);
    });

    setSelectedSmsTeamIds((current) => {
      const availableIds = new Set(teams.map((team) => team.id));
      const next = current.filter((teamId) => availableIds.has(teamId));
      return next.length > 0 ? next : teams.map((team) => team.id);
    });
  }, [teams]);

  useEffect(() => {
    if (!selectedEmailTemplate) {
      setEmailSubject("");
      setEmailBody("");
      return;
    }

    setEmailSubject(resolveText(selectedEmailTemplate.subject, { leagueName }));
    setEmailBody(resolveText(selectedEmailTemplate.body, { leagueName }));
  }, [selectedEmailTemplate, leagueName]);

  useEffect(() => {
    if (!selectedSmsTemplate) {
      setSmsBody("");
      return;
    }

    setSmsBody(resolveText(selectedSmsTemplate.body, { leagueName }));
  }, [selectedSmsTemplate, leagueName]);

  function toggleEmailTeam(teamId: string) {
    setSelectedEmailTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );
  }

  function toggleSmsTeam(teamId: string) {
    setSelectedSmsTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );
  }

  return (
    <div className="space-y-6">
      <form
        action={sendLeagueCommunicationMessageAction}
        className="rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="EMAIL" />
        <input type="hidden" name="templateId" value={selectedEmailTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedEmailTemplate?.key || ""} />
        <input type="hidden" name="ctaLabel" value={selectedEmailTemplate?.ctaLabel || ""} />
        <input type="hidden" name="ctaUrl" value={selectedEmailTemplate?.ctaUrl || ""} />
        {selectedEmailTeamIds.map((teamId) => (
          <input key={teamId} type="hidden" name="teamIds" value={teamId} />
        ))}

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">LEAGUE EMAIL</div>
        <div className="mt-2 text-xl font-semibold text-white">Email every team in this league</div>
        <div className="mt-1 text-sm text-white/60">This will queue one email per selected team. Target teams: {teamCount}</div>

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

          <TeamSelectionCard
            title="Include teams in this email"
            helpText="Click any team to exclude or re-include it before queueing the league email."
            teams={teams}
            selectedTeamIds={selectedEmailTeamIds}
            onToggle={toggleEmailTeam}
            availabilityKey="emailReady"
          />

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
            placeholder="Write your league email..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          disabled={selectedEmailTeamIds.length === 0}
          className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Queue league email
        </button>
      </form>

      <form
        action={sendLeagueCommunicationMessageAction}
        className="rounded-3xl border border-white/10 bg-white/5 p-6"
      >
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="from" value={fromPath} />
        <input type="hidden" name="channel" value="SMS" />
        <input type="hidden" name="templateId" value={selectedSmsTemplate?.id || ""} />
        <input type="hidden" name="templateKey" value={selectedSmsTemplate?.key || ""} />
        {selectedSmsTeamIds.map((teamId) => (
          <input key={teamId} type="hidden" name="teamIds" value={teamId} />
        ))}

        <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">LEAGUE SMS</div>
        <div className="mt-2 text-xl font-semibold text-white">Text every team in this league</div>
        <div className="mt-1 text-sm text-white/60">This will queue one SMS per selected team with a mobile number. Target teams: {teamCount}</div>

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

          <TeamSelectionCard
            title="Include teams in this SMS"
            helpText="Click any team to exclude or re-include it before queueing the league SMS."
            teams={teams}
            selectedTeamIds={selectedSmsTeamIds}
            onToggle={toggleSmsTeam}
            availabilityKey="smsReady"
          />

          <textarea
            name="body"
            rows={8}
            value={smsBody}
            onChange={(event) => setSmsBody(event.target.value)}
            placeholder="Write your league SMS..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          disabled={selectedSmsTeamIds.length === 0}
          className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Queue league SMS
        </button>
      </form>
    </div>
  );
}
