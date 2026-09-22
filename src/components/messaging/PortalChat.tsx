"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import PushNotificationControl from "@/components/pwa/PushNotificationControl";
import {
  ArrowPathIcon,
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  TrashIcon,
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
  kind: "TEAM" | "GROUP" | "PRIVATE" | "SUPPORT";
  disabled?: boolean;
};

type ChatMessage = {
  id: string;
  body: string;
  senderUserId: string | null;
  senderRole: "ADMIN" | "CAPTAIN" | "PLAYER" | "SYSTEM";
  senderName: string;
  isAdminTest: boolean;
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
  isAdminTestMode: boolean;
  isSimulatedTestMode: boolean;
  simulatedAsName: string | null;
  selected: {
    ref: string;
    id: string;
    type:
      | "TEAM"
      | "CAPTAIN_PLAYER"
      | "CAPTAIN_CAPTAIN"
      | "REGULARS"
      | "SELECTED_GROUP"
      | "SIXFL";
    title: string;
    memberUserIds: string[];
  };
  conversations: ConversationItem[];
  audienceOptions: Array<{
    userId: string;
    name: string;
    role: string;
    isRegular: boolean;
  }>;
  messages: ChatMessage[];
};

type PortalChatProps = {
  teamId: string;
  previewMembershipId?: string | null;
  adminTestMode?: boolean;
  simulateTestMode?: boolean;
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
  adminTestMode?: boolean;
  simulateTestMode?: boolean;
}) {
  const params = new URLSearchParams();
  params.set("conversation", input.conversation);
  if (input.previewMembershipId) {
    params.set("previewMembershipId", input.previewMembershipId);
  }
  if (input.adminTestMode) {
    params.set("adminTest", "1");
  }
  if (input.simulateTestMode) {
    params.set("simulate", "1");
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
  recipientHighlighted = false,
  onSelect,
}: {
  item: ConversationItem;
  selected: boolean;
  recipientHighlighted?: boolean;
  onSelect: (ref: string) => void;
}) {
  const Icon =
    item.kind === "TEAM" || item.kind === "GROUP"
      ? UserGroupIcon
      : item.kind === "SUPPORT"
        ? ShieldCheckIcon
        : UserIcon;

  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => onSelect(item.ref)}
      className={[
        "w-full rounded-2xl border p-3 text-left transition",
        selected
          ? "border-emerald-400/30 bg-emerald-500/12"
          : recipientHighlighted
            ? "border-emerald-400/25 bg-emerald-500/[0.07]"
            : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]",
        item.disabled ? "cursor-not-allowed opacity-45" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            selected || recipientHighlighted
              ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 bg-white/[0.04] text-white/55",
          ].join(" ")}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-white">{item.title}</span>
            {recipientHighlighted && !selected ? (
              <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-200/85">
                Included
              </span>
            ) : null}
            {item.unreadCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[10px] font-black text-black">
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/50">
            {item.subtitle}
          </span>
          {item.preview ? (
            <span className="mt-1 block truncate text-[11px] text-white/35">
              Latest: {item.preview}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

export default function PortalChat({
  teamId,
  previewMembershipId = null,
  adminTestMode = false,
  simulateTestMode = false,
}: PortalChatProps) {
  const [selectedRef, setSelectedRef] = useState("team");
  const [data, setData] = useState<ChatResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showSelectedPlayers, setShowSelectedPlayers] = useState(false);
  const [selectedGroupUserIds, setSelectedGroupUserIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const [archivingGroup, setArchivingGroup] = useState(false);
  const [notifyTeam, setNotifyTeam] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const initialConversationApplied = useRef(false);

  async function loadConversation(ref: string, silent = false) {
    if (!silent) setLoading(true);

    try {
      const response = await fetch(
        apiUrl({
          teamId,
          conversation: ref,
          previewMembershipId,
          adminTestMode,
          simulateTestMode,
        }),
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
    if (!initialConversationApplied.current) {
      initialConversationApplied.current = true;
      const requestedConversation = new URLSearchParams(window.location.search)
        .get("conversation")
        ?.trim();

      if (requestedConversation && requestedConversation !== selectedRef) {
        setSelectedRef(requestedConversation);
        return;
      }
    }

    loadConversation(selectedRef);
    const interval = window.setInterval(() => {
      loadConversation(selectedRef, true);
    }, 10000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    teamId,
    selectedRef,
    previewMembershipId,
    adminTestMode,
    simulateTestMode,
  ]);

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
        apiUrl({
          teamId,
          conversation: selectedRef,
          previewMembershipId,
          adminTestMode,
          simulateTestMode,
        }),
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

  async function startGroupConversation(
    audience: "REGULARS" | "SELECTED",
  ) {
    if (!data?.canSend || data.viewRole !== "CAPTAIN" || creatingGroup) return;

    setCreatingGroup(true);
    setFeedback(null);

    try {
      const response = await fetch(
        apiUrl({
          teamId,
          conversation: selectedRef,
          previewMembershipId,
          adminTestMode,
          simulateTestMode,
        }),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create-group",
            audience,
            memberUserIds:
              audience === "SELECTED" ? selectedGroupUserIds : undefined,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; conversationRef?: string; error?: string }
        | null;

      if (!response.ok || !payload?.conversationRef) {
        throw new Error(payload?.error || "Could not start group chat.");
      }

      setSelectedRef(payload.conversationRef);
      setSelectedGroupUserIds([]);
      setShowSelectedPlayers(false);
      setShowNewMessage(false);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not start group chat.",
      );
    } finally {
      setCreatingGroup(false);
    }
  }

  function toggleSelectedPlayer(userId: string) {
    setSelectedGroupUserIds((current) =>
      current.includes(userId)
        ? current.filter((value) => value !== userId)
        : [...current, userId],
    );
  }

  async function clearTestMessages() {
    if (!data?.isAdminTestMode || !data.team.name || clearing) return;

    const confirmation = window.prompt(
      `This will permanently delete every Whole Squad Chat, group chat and private chat message for ${data.team.name}. Type the exact team name to continue:`,
    );

    if (confirmation === null) return;
    if (confirmation.trim() !== data.team.name) {
      setFeedback("Team name did not match. Nothing was deleted.");
      return;
    }

    setClearing(true);
    setFeedback(null);

    try {
      const response = await fetch(
        apiUrl({
          teamId,
          conversation: "team",
          previewMembershipId,
          adminTestMode: true,
        }),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmTeamName: confirmation.trim() }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            deletedMessages?: number;
            deletedConversations?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not clear test messages.");
      }

      setSelectedRef("team");
      setMessage("");
      setNotifyTeam(false);
      await loadConversation("team", true);
      setFeedback(
        `Cleared ${payload.deletedMessages ?? 0} test message${
          payload.deletedMessages === 1 ? "" : "s"
        } for ${data.team.name}.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not clear test messages.",
      );
    } finally {
      setClearing(false);
    }
  }

  async function removeSelectedGroupChat() {
    if (
      !data?.canSend ||
      data.isPreview ||
      !selectedRef.startsWith("group:") ||
      archivingGroup
    ) {
      return;
    }

    const title =
      data.selected.title || selectedItem?.title || "this group chat";
    const confirmed = window.confirm(
      `Remove "${title}" from your chat list? The message history is kept and the chat will return if a new message is sent.`,
    );
    if (!confirmed) return;

    const archivedRef = selectedRef;
    setArchivingGroup(true);
    setFeedback(null);
    setSelectedRef("team");

    try {
      const response = await fetch(
        apiUrl({
          teamId,
          conversation: archivedRef,
          previewMembershipId,
          adminTestMode,
          simulateTestMode,
        }),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "archive-group",
            conversation: archivedRef,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; archived?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not remove this chat.");
      }

      setSelectedRef("team");
      await loadConversation("team", true);
      setFeedback(
        "Chat removed from your list. Its history is kept and it will return if a new message is sent.",
      );
    } catch (error) {
      setSelectedRef(archivedRef);
      setFeedback(
        error instanceof Error ? error.message : "Could not remove this chat.",
      );
    } finally {
      setArchivingGroup(false);
    }
  }

  const selectedItem =
    data?.conversations.find((item) => item.ref === selectedRef) ?? null;
  const teamItems = data?.conversations.filter((item) => item.kind === "TEAM") ?? [];
  const groupItems =
    data?.conversations.filter((item) => item.kind === "GROUP") ?? [];
  const regularUserIds = new Set(
    data?.audienceOptions
      .filter((item) => item.isRegular)
      .map((item) => item.userId) ?? [],
  );
  const privateItems = (
    data?.conversations.filter((item) => item.kind === "PRIVATE") ?? []
  )
    .slice()
    .sort((a, b) => {
      const aUserId = userIdFromPrivateRef(a.ref);
      const bUserId = userIdFromPrivateRef(b.ref);
      const regularDifference =
        Number(Boolean(bUserId && regularUserIds.has(bUserId))) -
        Number(Boolean(aUserId && regularUserIds.has(aUserId)));
      if (regularDifference !== 0) return regularDifference;
      return a.title.localeCompare(b.title, "en-GB", { sensitivity: "base" });
    });
  const sortedAudienceOptions = (data?.audienceOptions ?? [])
    .slice()
    .sort((a, b) => {
      if (a.isRegular !== b.isRegular) return a.isRegular ? -1 : 1;
      return a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
    });
  const regularCount = regularUserIds.size;
  const supportItems =
    data?.conversations.filter((item) => item.kind === "SUPPORT") ?? [];
  const selectableRecipientIds = new Set(
    data?.audienceOptions.map((item) => item.userId) ?? [],
  );
  const highlightedGroupRecipientIds = new Set(
    selectedRef.startsWith("group:")
      ? (data?.selected.memberUserIds ?? []).filter((userId) =>
          selectableRecipientIds.has(userId),
        )
      : [],
  );
  function userIdFromPrivateRef(ref: string) {
    if (ref.startsWith("player:")) return ref.slice("player:".length);
    if (ref.startsWith("captain:")) return ref.slice("captain:".length);
    return null;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_42%)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
              SIXFL Chat
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {data?.team.name ?? "Team messaging"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Who do you want to message? Use Whole Squad Chat, Regulars, Selected Players or a private conversation.
            </p>
            {data?.canSend &&
            !data.isAdminTestMode &&
            !data.isSimulatedTestMode ? (
              <PushNotificationControl />
            ) : null}
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
          {data?.viewRole === "CAPTAIN" && data.canSend ? (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowNewMessage((value) => !value)}
                className="flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-300"
              >
                {showNewMessage ? "Close new message" : "New message"}
              </button>

              {showNewMessage ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Start a new conversation
                    </div>
                    <div className="mt-1 text-xs leading-5 text-white/45">
                      Choose exactly who should be included.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRef("team");
                      setShowNewMessage(false);
                      setShowSelectedPlayers(false);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left text-sm font-semibold text-white/80 transition hover:bg-white/[0.06]"
                  >
                    Whole Squad Chat
                    <span className="mt-1 block text-xs font-normal text-white/40">
                      Everyone in the squad can read and reply
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={creatingGroup || regularCount === 0}
                    onClick={() => startGroupConversation("REGULARS")}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Regulars Chat
                    <span className="mt-1 block text-xs font-normal text-white/40">
                      {regularCount} player{regularCount === 1 ? "" : "s"} marked as Regulars
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSelectedPlayers((value) => !value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left text-sm font-semibold text-white/80 transition hover:bg-white/[0.06]"
                  >
                    Selected Players
                    <span className="mt-1 block text-xs font-normal text-white/40">
                      Choose exactly which players can see this chat
                    </span>
                  </button>

                  {showSelectedPlayers ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {sortedAudienceOptions.map((person) => (
                          <label
                            key={person.userId}
                            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-white/75 hover:bg-white/[0.05]"
                          >
                            <input
                              type="checkbox"
                              checked={selectedGroupUserIds.includes(person.userId)}
                              onChange={() => toggleSelectedPlayer(person.userId)}
                              className="h-4 w-4 accent-emerald-400"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {person.name}
                            </span>
                            {person.isRegular ? (
                              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300/70">
                                Regular
                              </span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={
                          creatingGroup || selectedGroupUserIds.length < 2
                        }
                        onClick={() => startGroupConversation("SELECTED")}
                        className="mt-2 w-full rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Start group · {selectedGroupUserIds.length} selected
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

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

          {groupItems.length > 0 ? (
            <div className="mt-5">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Your group chats
              </div>
              <div className="mt-2 space-y-2">
                {groupItems.map((item) => (
                  <ConversationButton
                    key={item.ref}
                    item={item}
                    selected={selectedRef === item.ref}
                    onSelect={setSelectedRef}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              {data?.viewRole === "CAPTAIN" ? "Private messages" : "Private"}
            </div>
            <div className="mt-2 max-h-[310px] space-y-2 overflow-y-auto pr-1">
              {privateItems.map((item) => {
                const userId = userIdFromPrivateRef(item.ref);
                return (
                  <ConversationButton
                    key={item.ref}
                    item={item}
                    selected={selectedRef === item.ref}
                    recipientHighlighted={Boolean(
                      userId && highlightedGroupRecipientIds.has(userId),
                    )}
                    onSelect={setSelectedRef}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              SIXFL
            </div>
            <div className="mt-2 space-y-2">
              {supportItems.map((item) => (
                <ConversationButton
                  key={item.ref}
                  item={item}
                  selected={selectedRef === item.ref}
                  onSelect={setSelectedRef}
                />
              ))}
            </div>
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
                  ? "Everyone in the squad can read and reply"
                  : selectedRef.startsWith("group:")
                    ? data?.viewRole === "CAPTAIN" &&
                      highlightedGroupRecipientIds.size > 0
                      ? `${selectedItem?.subtitle || "Private group chat"} · recipients highlighted on the left`
                      : selectedItem?.subtitle || "Private group chat"
                    : selectedRef === "sixfl"
                      ? "Private between you and SIXFL"
                      : data?.viewRole === "CAPTAIN"
                        ? `Private between ${selectedItem?.title ?? "this person"} and you`
                        : "Private between you and your captain"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data?.isAdminTestMode ? (
                <button
                  type="button"
                  onClick={clearTestMessages}
                  disabled={clearing}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 text-xs font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  {clearing ? "Clearing…" : "Clear test messages"}
                </button>
              ) : null}
              {selectedRef.startsWith("group:") &&
              data?.canSend &&
              !data.isPreview ? (
                <button
                  type="button"
                  onClick={removeSelectedGroupChat}
                  disabled={archivingGroup}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  {archivingGroup ? "Removing…" : "Remove chat"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => loadConversation(selectedRef)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Refresh messages"
              >
                <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {data?.isAdminTestMode ? (
            <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-100/80 sm:px-5">
              Admin Test Mode · messages are sent as SIXFL Admin/Test. No phone push notifications are sent. Clear the test history before Whole Squad Chat launches.
            </div>
          ) : data?.isSimulatedTestMode ? (
            <div className="border-b border-violet-400/20 bg-violet-500/10 px-4 py-2.5 text-xs font-medium text-violet-100/85 sm:px-5">
              Simulated Test Reply · you are sending as {data.simulatedAsName || "this user"} for admin testing. No phone push notifications are sent.
            </div>
          ) : data?.isPreview ? (
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
                        {item.isAdminTest ? (
                          <span className="rounded-full bg-violet-400/10 px-1.5 py-0.5 text-violet-200/80">
                            Test
                          </span>
                        ) : null}
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
                    ? data?.viewRole === "CAPTAIN"
                      ? "Start Whole Squad Chat. Everyone currently registered in your squad will be able to see it."
                      : "Start Whole Squad Chat. Everyone currently registered in the squad will be able to see it."
                    : selectedRef.startsWith("group:")
                      ? `Start the ${selectedItem?.title ?? "group"} conversation. Only the people included in this group can see it.`
                      : selectedRef === "sixfl"
                        ? "Send a private message to SIXFL."
                        : data?.viewRole === "CAPTAIN"
                          ? `Start a private conversation with ${selectedItem?.title ?? "this person"}.`
                          : "Start a private conversation with your captain."}
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
            !data.isAdminTestMode &&
            !data.isSimulatedTestMode &&
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
                    Notify whole squad on their phone
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
                    ? data.isAdminTestMode
                      ? selectedRef === "team"
                        ? "Send a test message to Whole Squad Chat…"
                        : selectedRef.startsWith("group:")
                          ? "Send a test group message…"
                          : selectedRef === "sixfl"
                            ? "Send a test message to SIXFL…"
                            : "Send a test private message…"
                      : data.isSimulatedTestMode
                        ? selectedRef === "sixfl"
                          ? "Reply to SIXFL as this user…"
                          : selectedRef.startsWith("group:")
                            ? "Send a simulated group reply…"
                            : "Send a simulated test reply…"
                        : selectedRef === "team"
                          ? "Message the whole squad…"
                          : selectedRef.startsWith("group:")
                            ? "Message this group…"
                            : selectedRef === "sixfl"
                              ? "Message SIXFL…"
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
                {data?.isAdminTestMode
                  ? "Admin Test Mode · stored in chat · no phone alert"
                  : data?.isSimulatedTestMode
                    ? "Simulated Test Reply · stored in chat · no phone alert"
                    : selectedRef === "team"
                      ? data?.viewRole === "PLAYER"
                        ? "Squad conversation · use @Captain only when you need their attention"
                        : notifyTeam
                          ? "Important whole-squad notification"
                          : "Your squad conversation · no phone alert"
                      : selectedRef.startsWith("group:")
                        ? selectedItem?.subtitle || "Private group conversation"
                        : selectedRef === "sixfl"
                          ? "Private message to SIXFL"
                          : data?.viewRole === "CAPTAIN"
                            ? `Private with ${selectedItem?.title ?? "this person"}`
                            : "Private with your captain"}
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
