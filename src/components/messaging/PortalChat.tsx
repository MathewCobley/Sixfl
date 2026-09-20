"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import PushNotificationControl from "@/components/pwa/PushNotificationControl";
import {
  ArrowPathIcon,
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

type ConversationItem = {
  ref: string;
  title: string;
  subtitle: string;
  unreadCount: number;
  latestMessageAt: string | null;
  preview: string | null;
  kind: "TEAM" | "PRIVATE";
  disabled?: boolean;
};

type ChatMessage = {
  id: string;
  body: string;
  senderUserId: string | null;
  senderRole: "ADMIN" | "CAPTAIN" | "PLAYER" | "SYSTEM";
  senderName: string;
  createdAt: string;
  isMine: boolean;
};

type ChatResponse = {
  team: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  viewRole: "CAPTAIN" | "PLAYER";
  canSend: boolean;
  isPreview: boolean;
  selected: {
    ref: string;
    id: string;
    type: "TEAM" | "CAPTAIN_PLAYER" | "SIXFL";
    title: string;
  };
  conversations: ConversationItem[];
  messages: ChatMessage[];
};

type PortalChatProps = {
  teamId: string;
  sixflHref: string;
  previewMembershipId?: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function apiUrl(input: {
  teamId: string;
  conversation: string;
  previewMembershipId?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("conversation", input.conversation);
  if (input.previewMembershipId) {
    params.set("previewMembershipId", input.previewMembershipId);
  }
  return `/api/portal-chat/team/${input.teamId}?${params.toString()}`;
}

function initials(name: string) {
  const bits = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return bits.map((bit) => bit[0]?.toUpperCase() ?? "").join("") || "S";
}

function ConversationButton({
  item,
  selected,
  onSelect,
}: {
  item: ConversationItem;
  selected: boolean;
  onSelect: (ref: string) => void;
}) {
  const Icon = item.kind === "TEAM" ? UserGroupIcon : UserIcon;

  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => onSelect(item.ref)}
      className={[
        "w-full rounded-2xl border p-3 text-left transition",
        selected
          ? "border-emerald-400/30 bg-emerald-500/12"
          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]",
        item.disabled ? "cursor-not-allowed opacity-45" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            selected
              ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 bg-white/[0.04] text-white/55",
          ].join(" ")}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-white">{item.title}</span>
            {item.unreadCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[10px] font-black text-black">
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/45">
            {item.preview || item.subtitle}
          </span>
        </span>
      </div>
    </button>
  );
}

export default function PortalChat({
  teamId,
  sixflHref,
  previewMembershipId = null,
}: PortalChatProps) {
  const [selectedRef, setSelectedRef] = useState("team");
  const [data, setData] = useState<ChatResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notifyTeam, setNotifyTeam] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadConversation(ref: string, silent = false) {
    if (!silent) setLoading(true);

    try {
      const response = await fetch(
        apiUrl({ teamId, conversation: ref, previewMembershipId }),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | ChatResponse
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("messages" in payload)) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not load the conversation.",
        );
      }

      setData(payload);
      setFeedback(null);
    } catch (error) {
      if (!silent) {
        setFeedback(error instanceof Error ? error.message : "Could not load messages.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    const requestedConversation = new URLSearchParams(window.location.search)
      .get("conversation")
      ?.trim();

    if (requestedConversation && requestedConversation !== selectedRef) {
      setSelectedRef(requestedConversation);
      return;
    }

    loadConversation(selectedRef);
    const interval = window.setInterval(() => {
      loadConversation(selectedRef, true);
    }, 10000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, selectedRef, previewMembershipId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [data?.messages.length, selectedRef]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending || !data?.canSend) return;

    setSending(true);
    setFeedback(null);

    try {
      const response = await fetch(
        apiUrl({ teamId, conversation: selectedRef, previewMembershipId }),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: selectedRef,
            message: trimmed,
            notifyTeam:
              data.viewRole === "CAPTAIN" &&
              selectedRef === "team" &&
              notifyTeam,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not send message.");
      }

      setMessage("");
      setNotifyTeam(false);
      await loadConversation(selectedRef, true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  const selectedItem =
    data?.conversations.find((item) => item.ref === selectedRef) ?? null;
  const teamItems = data?.conversations.filter((item) => item.kind === "TEAM") ?? [];
  const privateItems =
    data?.conversations.filter((item) => item.kind === "PRIVATE") ?? [];

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_42%)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
              SIXFL messages
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {data?.team.name ?? "Team messaging"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Team chat is visible to the whole registered squad. Private player chats are only visible to that player and the team captain(s).
            </p>
            {data?.canSend ? <PushNotificationControl /> : null}
          </div>

          {data?.team ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/30">
              {data.team.logoUrl ? (
                <img
                  src={data.team.logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-lg font-black text-emerald-100">
                  {initials(data.team.name)}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-[620px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-black/15 p-3 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            {teamItems.map((item) => (
              <ConversationButton
                key={item.ref}
                item={item}
                selected={selectedRef === item.ref}
                onSelect={setSelectedRef}
              />
            ))}
          </div>

          <div className="mt-5">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              {data?.viewRole === "CAPTAIN" ? "Private player messages" : "Private"}
            </div>
            <div className="mt-2 max-h-[310px] space-y-2 overflow-y-auto pr-1">
              {privateItems.map((item) => (
                <ConversationButton
                  key={item.ref}
                  item={item}
                  selected={selectedRef === item.ref}
                  onSelect={setSelectedRef}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <Link
              href={sixflHref}
              className="flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3 transition hover:bg-sky-500/15"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-100">
                <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">Message SIXFL</span>
                <span className="mt-0.5 block text-xs leading-5 text-sky-100/60">
                  Private support and league administration
                </span>
              </span>
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {data?.selected.title ?? selectedItem?.title ?? "Conversation"}
              </div>
              <div className="mt-0.5 truncate text-xs text-white/40">
                {selectedRef === "team"
                  ? "Everyone in the registered squad can read and reply"
                  : "Private between this player and the team captain(s)"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadConversation(selectedRef)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
              aria-label="Refresh messages"
            >
              <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {data?.isPreview ? (
            <div className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-100/80 sm:px-5">
              Preview mode is read-only. Messages cannot be sent as the person you are previewing.
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            {loading && !data ? (
              <div className="flex min-h-64 items-center justify-center text-sm text-white/45">
                Loading conversation…
              </div>
            ) : data?.messages.length ? (
              <div className="space-y-3">
                {data.messages.map((item) => (
                  <div
                    key={item.id}
                    className={`flex ${item.isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[88%] rounded-2xl border px-4 py-3 sm:max-w-[72%]",
                        item.isMine
                          ? "border-emerald-400/20 bg-emerald-500/12 text-emerald-50"
                          : "border-white/10 bg-white/[0.055] text-white/85",
                      ].join(" ")}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                        <span>{item.isMine ? "You" : item.senderName}</span>
                        {item.senderRole === "CAPTAIN" && !item.isMine ? (
                          <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-emerald-200/80">
                            Captain
                          </span>
                        ) : null}
                        <span>·</span>
                        <span>{formatTime(item.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm leading-6">
                        {item.body}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/10 px-6 text-center">
                <ChatBubbleLeftRightIcon
                  className="h-8 w-8 text-emerald-300/60"
                  aria-hidden="true"
                />
                <div className="mt-3 text-sm font-semibold text-white">
                  No messages yet
                </div>
                <p className="mt-1 max-w-sm text-xs leading-5 text-white/45">
                  {selectedRef === "team"
                    ? "Start the team conversation. Everyone currently registered in the squad will be able to see it."
                    : "Start a private conversation between the player and captain."}
                </p>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="border-t border-white/10 bg-black/15 p-3 sm:p-4"
          >
            {data?.viewRole === "CAPTAIN" &&
            data.canSend &&
            selectedRef === "team" ? (
              <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <input
                  type="checkbox"
                  checked={notifyTeam}
                  onChange={(event) => setNotifyTeam(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-400"
                />
                <BellAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300/80" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    Notify team on their phone
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/45">
                    Off by default. Use this only for an important team message — normal chat stays quiet.
                  </span>
                </span>
              </label>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={1}
                maxLength={2000}
                disabled={!data?.canSend}
                placeholder={
                  data?.canSend
                    ? selectedRef === "team"
                      ? "Message the team…"
                      : "Private message…"
                    : "Preview mode is read-only"
                }
                className="max-h-32 min-h-12 flex-1 resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!data?.canSend || sending || !message.trim()}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-white/35">
              <span>
                {selectedRef === "team"
                  ? data?.viewRole === "PLAYER"
                    ? "Squad conversation · use @Captain only when you need their attention"
                    : notifyTeam
                      ? "Important team notification"
                      : "Squad conversation · no phone alert"
                  : "Private captain conversation · phone alert if enabled"}
              </span>
              <span>{message.length}/2000</span>
            </div>
            {feedback ? (
              <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {feedback}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
