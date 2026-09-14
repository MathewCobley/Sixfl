"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Call, Device } from "@twilio/voice-sdk";

export type DiallerLead = {
  id: string;
  contactName: string | null;
  teamName: string | null;
  phone: string | null;
  area: string | null;
  status: string;
  interestType: string;
  createdAt: string;
  contactedAt: string | null;
  lastCalledAt: string | null;
  message: string | null;
  leagueName: string | null;
};

type Outcome = "INTERESTED" | "CALLBACK" | "NO_ANSWER" | "NOT_INTERESTED" | "JOINED";
type CallState = "idle" | "connecting" | "ringing" | "connected" | "ended";

type SaveOutcomeOptions = {
  automatic?: boolean;
  continueAutoDial?: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function labelForType(value: string) {
  if (value === "TEAM") return "Team";
  if (value === "PLAYER") return "Player";
  if (value === "REFEREE") return "Referee";
  return value;
}

function leadLabel(lead: DiallerLead) {
  return lead.contactName || lead.teamName || "lead";
}

async function fetchVoiceToken() {
  const response = await fetch("/api/admin/leads/dialler/token", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
  };

  if (!response.ok || !payload.token) {
    throw new Error(payload.error || "Could not prepare browser calling.");
  }

  return payload.token;
}

export default function LeadDiallerQueue({
  initialLeads,
  backHref = "/admin/leads",
}: {
  initialLeads: DiallerLead[];
  backHref?: string;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState<string | null>(initialLeads[0]?.id ?? null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [autoDialEnabled, setAutoDialEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const leadsRef = useRef(initialLeads);
  const selectedIdRef = useRef<string | null>(initialLeads[0]?.id ?? null);
  const autoDialRef = useRef(false);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = useMemo(
    () => leads.find((lead) => lead.id === selectedId) ?? leads[0] ?? null,
    [leads, selectedId],
  );

  const activeCall = callState === "connecting" || callState === "ringing" || callState === "connected";
  const selectionLocked = activeCall || saving || callState === "ended";

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetOutcomeFields() {
    setNote("");
    setCallbackAt("");
  }
  function setSelectedLead(id: string | null) {
    selectedIdRef.current = id;
    setSelectedId(id);
  }

  function setAutoDial(value: boolean) {
    autoDialRef.current = value;
    setAutoDialEnabled(value);
  }

  function destroyVoice() {
    stopTimer();
    callRef.current = null;
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
  }

  useEffect(() => {
    return () => destroyVoice();
  }, []);

  function advancePastLead(leadId: string) {
    const current = leadsRef.current;
    const currentIndex = current.findIndex((lead) => lead.id === leadId);
    const remaining = current.filter((lead) => lead.id !== leadId);
    const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex, Math.max(remaining.length - 1, 0));
    const next = remaining[nextIndex] ?? remaining[0] ?? null;

    leadsRef.current = remaining;
    setLeads(remaining);
    setSelectedLead(next?.id ?? null);
    resetOutcomeFields();
    return next;
  }

  async function ensureDevice() {
    if (deviceRef.current) return deviceRef.current;

    const token = await fetchVoiceToken();
    const device = new Device(token);

    device.on("error", (error) => {
      console.error("Twilio Voice device error", error);
      setAutoDial(false);
      setCallState("idle");
      setFeedback(error.message || "The browser phone failed. Auto Dial has been paused.");
    });

    device.on("tokenWillExpire", () => {
      void fetchVoiceToken()
        .then((nextToken) => device.updateToken(nextToken))
        .catch((error) => {
          console.error("Could not refresh Twilio Voice token", error);
        });
    });

    deviceRef.current = device;
    return device;
  }

  async function recordOutcomeForLead(
    lead: DiallerLead,
    outcome: Outcome,
    options: SaveOutcomeOptions = {},
  ) {
    const automatic = options.automatic === true;
    const continueAutoDial = options.continueAutoDial === true;

    if (saving) return;
    if (!automatic && outcome === "CALLBACK" && !callbackAt) {
      setFeedback("Choose the callback date and time first.");
      return;
    }

    setSaving(true);
    if (automatic) {
      setFeedback("No answer — recording the attempt and moving to the next lead…");
    } else {
      setFeedback(null);
    }

    try {
      const response = await fetch("/api/admin/leads/dialler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "outcome",
          leadId: lead.id,
          outcome,
          note: automatic ? "" : note,
          callbackAt:
            !automatic && outcome === "CALLBACK"
              ? new Date(callbackAt).toISOString()
              : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not save outcome.");
      }

      setCallState("idle");
      setElapsedSeconds(0);
      const next = advancePastLead(lead.id);

      if (continueAutoDial && autoDialRef.current && next) {
        setFeedback(
          automatic
            ? `No answer recorded. Calling ${leadLabel(next)} next…`
            : `Outcome saved. Calling ${leadLabel(next)} next…`,
        );
        window.setTimeout(() => {
          if (autoDialRef.current) void startCall(next);
        }, 700);
      } else if (!next) {
        setAutoDial(false);
        setFeedback("Call list complete — there are no more leads in this filtered list.");
      } else {
        setFeedback(automatic ? "No answer recorded. Ready for the next lead." : "Outcome saved. Ready for the next lead.");
      }
    } catch (error) {
      setAutoDial(false);
      setCallState("ended");
      setFeedback(
        error instanceof Error
          ? `${error.message} Auto Dial has been paused so this lead is not skipped.`
          : "Could not save outcome. Auto Dial has been paused so this lead is not skipped.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function startCall(targetOverride?: DiallerLead) {
    const target =
      targetOverride ??
      leadsRef.current.find((lead) => lead.id === selectedIdRef.current) ??
      leadsRef.current[0] ??
      null;

    if (!target || callRef.current) return;

    setSelectedLead(target.id);
    setCallState("connecting");
    setElapsedSeconds(0);
    setMuted(false);
    setFeedback(
      autoDialRef.current
        ? `Auto Dial is preparing ${leadLabel(target)}…`
        : "Requesting microphone access and connecting to Twilio…",
    );

    try {
      const device = await ensureDevice();
      let finalized = false;
      let answered = false;

      const call = await device.connect({
        params: { LeadId: target.id },
        rtcConstraints: { audio: true },
      });
      callRef.current = call;
      setCallState("ringing");
      setFeedback(
        autoDialRef.current
          ? `Auto Dial: calling ${leadLabel(target)}. You will be connected when they answer.`
          : `Calling ${leadLabel(target)} from the SIXFL number…`,
      );

      const calledAt = new Date().toISOString();
      const updatedLeads = leadsRef.current.map((lead) =>
        lead.id === target.id
          ? {
              ...lead,
              lastCalledAt: calledAt,
              contactedAt: calledAt,
              status: lead.status === "NEW" ? "CONTACTED" : lead.status,
            }
          : lead,
      );
      leadsRef.current = updatedLeads;
      setLeads(updatedLeads);

      const clearCall = () => {
        stopTimer();
        if (callRef.current === call) callRef.current = null;
        setMuted(false);
      };

      const finishUnanswered = () => {
        if (finalized) return;
        finalized = true;
        clearCall();
        setCallState("ended");

        if (autoDialRef.current) {
          void recordOutcomeForLead(target, "NO_ANSWER", {
            automatic: true,
            continueAutoDial: true,
          });
        } else {
          setFeedback("No answer. Record the outcome below, or call again.");
        }
      };

      const finishConversation = () => {
        if (finalized) return;
        finalized = true;
        clearCall();
        setCallState("ended");
        setFeedback(
          autoDialRef.current
            ? "Call ended. Record the outcome below; Auto Dial will continue with the next lead after you save it."
            : "Call ended. Record the outcome below.",
        );
      };

      call.on("ringing", () => {
        setCallState("ringing");
      });
      call.on("accept", () => {
        answered = true;
        setCallState("connected");
        setFeedback("Answered — connected to your browser/headset through the SIXFL number.");
        stopTimer();
        timerRef.current = setInterval(() => {
          setElapsedSeconds((seconds) => seconds + 1);
        }, 1000);
      });
      call.on("disconnect", () => {
        if (answered) finishConversation();
        else finishUnanswered();
      });
      call.on("cancel", finishUnanswered);
      call.on("reject", finishUnanswered);
      call.on("error", (error) => {
        if (finalized) return;
        finalized = true;
        clearCall();
        setAutoDial(false);
        setCallState("idle");
        setFeedback(error.message || "The call failed. Auto Dial has been paused.");
      });
    } catch (error) {
      callRef.current = null;
      setAutoDial(false);
      setCallState("idle");
      setFeedback(
        error instanceof Error
          ? `${error.message} Auto Dial has been paused.`
          : "Could not start browser call. Auto Dial has been paused.",
      );
    }
  }

  function endCall() {
    callRef.current?.disconnect();
  }

  function toggleMute() {
    const call = callRef.current;
    if (!call || callState !== "connected") return;
    const nextMuted = !muted;
    call.mute(nextMuted);
    setMuted(nextMuted);
  }

  function toggleAutoDial() {
    if (autoDialRef.current) {
      setAutoDial(false);
      setFeedback(
        activeCall
          ? "Auto Dial paused. The current call will continue, but the next lead will not be called automatically."
          : "Auto Dial paused.",
      );
      return;
    }

    setAutoDial(true);
    setFeedback("Auto Dial started. SIXFL will call one lead at a time.");
    if (!activeCall && !saving && callState !== "ended") {
      void startCall();
    }
  }

  async function saveOutcome(outcome: Outcome) {
    if (!selected || saving) return;
    if (activeCall) {
      setFeedback("End the current call before recording its outcome.");
      return;
    }

    await recordOutcomeForLead(selected, outcome, {
      continueAutoDial: autoDialRef.current,
    });
  }

  if (!selected) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <h2 className="text-xl font-black text-white">Call list complete</h2>
        <p className="mt-2 text-sm text-white/55">There are no more callable leads in this filtered list.</p>
        <Link href={backHref} className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
          Back to filtered leads
        </Link>
      </div>
    );
  }

  const selectedTitle = selected.teamName || selected.contactName || "Unnamed lead";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Filtered call list</p>
          <p className="mt-1 text-sm text-white/60">{leads.length} lead{leads.length === 1 ? "" : "s"} left in this session</p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {leads.map((lead) => {
            const active = lead.id === selected.id;
            return (
              <button
                key={lead.id}
                type="button"
                disabled={selectionLocked}
                onClick={() => {
                  setSelectedLead(lead.id);
                  resetOutcomeFields();
                  setFeedback(null);
                  setCallState("idle");
                  setElapsedSeconds(0);
                }}
                className={`w-full border-b border-white/10 px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "bg-emerald-500/10" : "hover:bg-white/[0.04]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-white">{lead.teamName || lead.contactName || "Unnamed lead"}</div>
                    {lead.teamName && lead.contactName ? <div className="mt-0.5 text-xs text-white/45">{lead.contactName}</div> : null}
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">{labelForType(lead.interestType)}</span>
                </div>
                <div className="mt-2 text-xs text-white/50">{lead.area || "Area not set"} · {lead.leagueName || "No league"}</div>
                <div className="mt-1 text-[11px] text-white/35">Last called: {formatDateTime(lead.lastCalledAt)}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Next lead</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{selectedTitle}</h2>
            {selected.teamName && selected.contactName ? <p className="mt-1 text-white/60">Contact: {selected.contactName}</p> : null}
          </div>
          <Link href={`/admin/leads/${selected.id}`} className="text-sm font-semibold text-emerald-200 hover:text-emerald-100">Open full lead →</Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] uppercase tracking-wider text-white/35">Phone</div><div className="mt-1 font-bold text-white">{selected.phone}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] uppercase tracking-wider text-white/35">Area</div><div className="mt-1 font-bold text-white">{selected.area || "—"}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] uppercase tracking-wider text-white/35">Status</div><div className="mt-1 font-bold text-white">{selected.status}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[11px] uppercase tracking-wider text-white/35">Last called</div><div className="mt-1 font-bold text-white">{formatDateTime(selected.lastCalledAt)}</div></div>
        </div>

        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-500/[0.08] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-200/80">Auto Dial</div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
                Calls one lead at a time. If nobody answers it records “No answer” and tries the next lead. If they answer, the call is bridged to your browser/headset and the dialler waits for you to record the outcome before continuing.
              </p>
            </div>
            <button
              type="button"
              aria-pressed={autoDialEnabled}
              onClick={toggleAutoDial}
              disabled={saving}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-5 py-2.5 text-sm font-black transition disabled:opacity-50 ${autoDialEnabled ? "border border-amber-300/30 bg-amber-400/15 text-amber-100 hover:bg-amber-400/20" : "bg-sky-400 text-black hover:bg-sky-300"}`}
            >
              {autoDialEnabled ? "Pause Auto Dial" : "Start Auto Dial"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300/80">Browser phone</div>
              <div className="mt-1 text-xl font-black text-white">
                {callState === "connected" ? formatDuration(elapsedSeconds) : callState === "ringing" ? "Calling lead…" : callState === "connecting" ? "Preparing call…" : callState === "ended" ? "Call ended" : "Ready"}
              </div>
              <div className="mt-1 text-xs text-white/45">Uses the microphone and speaker/headset selected by your browser or computer.</div>
            </div>
            {activeCall ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={callState !== "connected"}
                  className="rounded-xl border border-white/15 bg-black/25 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={endCall}
                  className="rounded-xl border border-red-400/30 bg-red-500/20 px-4 py-2 text-sm font-bold text-red-100"
                >
                  End call
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {!activeCall && !autoDialEnabled && callState !== "ended" ? (
          <button
            type="button"
            onClick={() => void startCall()}
            disabled={saving}
            className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-500 px-6 text-lg font-black text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            Call {selected.contactName || selected.teamName || "lead"}
          </button>
        ) : null}
        <p className="mt-2 text-center text-xs text-white/40">The lead sees the SIXFL Twilio number, not your personal number.</p>

        <div className="mt-7 border-t border-white/10 pt-6">
          <h3 className="font-black text-white">Record the outcome</h3>
          <p className="mt-1 text-xs text-white/45">After a completed conversation, Auto Dial will not call the next person until you choose an outcome.</p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Optional call notes…"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-500/50"
          />
          <div className="mt-3">
            <label className="text-xs font-bold uppercase tracking-wider text-white/45" htmlFor="callback-at">Callback date/time</label>
            <input
              id="callback-at"
              type="datetime-local"
              value={callbackAt}
              onChange={(event) => setCallbackAt(event.target.value)}
              className="mt-1 block rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <button type="button" disabled={saving || activeCall} onClick={() => void saveOutcome("INTERESTED")} className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-3 text-sm font-bold text-emerald-100 disabled:opacity-40">Interested</button>
            <button type="button" disabled={saving || activeCall} onClick={() => void saveOutcome("CALLBACK")} className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-3 text-sm font-bold text-sky-100 disabled:opacity-40">Call back</button>
            <button type="button" disabled={saving || activeCall} onClick={() => void saveOutcome("NO_ANSWER")} className="rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-3 text-sm font-bold text-amber-100 disabled:opacity-40">No answer</button>
            <button type="button" disabled={saving || activeCall} onClick={() => void saveOutcome("NOT_INTERESTED")} className="rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-3 text-sm font-bold text-red-100 disabled:opacity-40">Not interested</button>
            <button type="button" disabled={saving || activeCall} onClick={() => void saveOutcome("JOINED")} className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-3 text-sm font-bold text-violet-100 disabled:opacity-40">Joined</button>
          </div>
        </div>

        {feedback ? <div className="mt-5 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">{feedback}</div> : null}
      </section>
    </div>
  );
}