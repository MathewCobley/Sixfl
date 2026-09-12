"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

export default function LeadDiallerQueue({ initialLeads }: { initialLeads: DiallerLead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0]?.id ?? null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = useMemo(
    () => leads.find((lead) => lead.id === selectedId) ?? leads[0] ?? null,
    [leads, selectedId],
  );

  const activeCall = callState === "connecting" || callState === "ringing" || callState === "connected";

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanUpVoice() {
    stopTimer();
    callRef.current = null;
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
  }

  useEffect(() => {
    return () => cleanUpVoice();
  }, []);

  function selectNext(currentId: string, updatedLeads = leads) {
    const index = updatedLeads.findIndex((lead) => lead.id === currentId);
    const next = updatedLeads[index + 1] ?? updatedLeads[index - 1] ?? updatedLeads[0] ?? null;
    setSelectedId(next?.id ?? null);
    setNote("");
    setCallbackAt("");
  }

  function handleCallFinished(message: string) {
    stopTimer();
    setCallState("ended");
    setMuted(false);
    setFeedback(message);
    callRef.current = null;
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
  }

  async function startCall() {
    if (!selected || activeCall) return;
    setCallState("connecting");
    setElapsedSeconds(0);
    setMuted(false);
    setFeedback("Requesting microphone access and connecting to Twilio…");

    try {
      const tokenResponse = await fetch("/api/admin/leads/dialler/token", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!tokenResponse.ok || !tokenPayload.token) {
        throw new Error(tokenPayload.error || "Could not prepare browser calling.");
      }

      cleanUpVoice();
      const device = new Device(tokenPayload.token);
      deviceRef.current = device;

      device.on("error", (error) => {
        console.error("Twilio Voice device error", error);
        handleCallFinished(error.message || "The browser call failed.");
      });

      const call = await device.connect({
        params: { LeadId: selected.id },
        rtcConstraints: { audio: true },
      });
      callRef.current = call;
      setCallState("ringing");
      setFeedback(`Calling ${selected.contactName || selected.teamName || "lead"} from the SIXFL number…`);

      const calledAt = new Date().toISOString();
      setLeads((current) => current.map((lead) => lead.id === selected.id ? {
        ...lead,
        lastCalledAt: calledAt,
        contactedAt: calledAt,
        status: lead.status === "NEW" ? "CONTACTED" : lead.status,
      } : lead));

      call.on("ringing", () => {
        setCallState("ringing");
      });
      call.on("accept", () => {
        setCallState("connected");
        setFeedback("Connected — you are speaking through the SIXFL browser phone.");
        stopTimer();
        timerRef.current = setInterval(() => {
          setElapsedSeconds((seconds) => seconds + 1);
        }, 1000);
      });
      call.on("disconnect", () => handleCallFinished("Call ended. Record the outcome below."));
      call.on("cancel", () => handleCallFinished("Call cancelled. Record the outcome below if needed."));
      call.on("reject", () => handleCallFinished("Call was rejected. Record the outcome below."));
      call.on("error", (error) => {
        console.error("Twilio Voice call error", error);
        handleCallFinished(error.message || "The call failed.");
      });
    } catch (error) {
      cleanUpVoice();
      setCallState("idle");
      setFeedback(error instanceof Error ? error.message : "Could not start browser call.");
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

  async function saveOutcome(outcome: Outcome) {
    if (!selected || saving) return;
    if (activeCall) {
      setFeedback("End the current call before recording its outcome.");
      return;
    }
    if (outcome === "CALLBACK" && !callbackAt) {
      setFeedback("Choose the callback date and time first.");
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/leads/dialler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "outcome",
          leadId: selected.id,
          outcome,
          note,
          callbackAt: outcome === "CALLBACK" ? new Date(callbackAt).toISOString() : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save outcome.");

      setCallState("idle");
      setElapsedSeconds(0);
      if (outcome === "NOT_INTERESTED" || outcome === "JOINED") {
        const remaining = leads.filter((lead) => lead.id !== selected.id);
        setLeads(remaining);
        selectNext(selected.id, remaining);
      } else {
        const updated = leads.map((lead) => lead.id === selected.id ? {
          ...lead,
          status: payload.status ?? lead.status,
          contactedAt: new Date().toISOString(),
        } : lead);
        setLeads(updated);
        selectNext(selected.id, updated);
      }
      setFeedback("Outcome saved. Ready for the next lead.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save outcome.");
    } finally {
      setSaving(false);
    }
  }

  if (!selected) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <h2 className="text-xl font-black text-white">Call queue clear</h2>
        <p className="mt-2 text-sm text-white/55">There are no open leads with phone numbers to call.</p>
        <Link href="/admin/leads" className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">Back to leads</Link>
      </div>
    );
  }

  const selectedTitle = selected.teamName || selected.contactName || "Unnamed lead";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Queue</p>
          <p className="mt-1 text-sm text-white/60">{leads.length} open lead{leads.length === 1 ? "" : "s"} with a phone number</p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {leads.map((lead) => {
            const active = lead.id === selected.id;
            return (
              <button
                key={lead.id}
                type="button"
                disabled={activeCall}
                onClick={() => {
                  setSelectedId(lead.id);
                  setNote("");
                  setCallbackAt("");
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

        <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300/80">Browser phone</div>
              <div className="mt-1 text-xl font-black text-white">
                {callState === "connected" ? formatDuration(elapsedSeconds) : callState === "ringing" ? "Ringing…" : callState === "connecting" ? "Connecting…" : callState === "ended" ? "Call ended" : "Ready"}
              </div>
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

        {!activeCall ? (
          <button
            type="button"
            onClick={startCall}
            className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-500 px-6 text-lg font-black text-black transition hover:bg-emerald-400"
          >
            Call {selected.contactName || selected.teamName || "lead"}
          </button>
        ) : null}
        <p className="mt-2 text-center text-xs text-white/40">Audio stays in this browser. The lead sees the SIXFL Twilio number, not your personal number.</p>

        <div className="mt-7 border-t border-white/10 pt-6">
          <h3 className="font-black text-white">Record the outcome</h3>
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
            <button type="button" disabled={saving || activeCall} onClick={() => saveOutcome("INTERESTED")} className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-3 text-sm font-bold text-emerald-100 disabled:opacity-40">Interested</button>
            <button type="button" disabled={saving || activeCall} onClick={() => saveOutcome("CALLBACK")} className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-3 text-sm font-bold text-sky-100 disabled:opacity-40">Call back</button>
            <button type="button" disabled={saving || activeCall} onClick={() => saveOutcome("NO_ANSWER")} className="rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-3 text-sm font-bold text-amber-100 disabled:opacity-40">No answer</button>
            <button type="button" disabled={saving || activeCall} onClick={() => saveOutcome("NOT_INTERESTED")} className="rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-3 text-sm font-bold text-red-100 disabled:opacity-40">Not interested</button>
            <button type="button" disabled={saving || activeCall} onClick={() => saveOutcome("JOINED")} className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-3 text-sm font-bold text-violet-100 disabled:opacity-40">Joined</button>
          </div>
        </div>

        {feedback ? <div className="mt-5 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">{feedback}</div> : null}
      </section>
    </div>
  );
}
