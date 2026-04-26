// ========================================
// File: src/components/admin/messages/CancelQueuedSmsButton.tsx
// ========================================

import { cancelQueuedSmsMessageAction } from "@/app/(admin)/admin/messages/actions";

type CancelQueuedSmsButtonProps = {
  messageId: string;
  threadId: string;
  filter?: "unread" | "open" | "archived" | "all";
  label?: string;
  compact?: boolean;
};

export default function CancelQueuedSmsButton({
  messageId,
  threadId,
  filter = "all",
  label = "Cancel queued SMS",
  compact = false,
}: CancelQueuedSmsButtonProps) {
  return (
    <form action={cancelQueuedSmsMessageAction}>
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="filter" value={filter} />
      <button
        type="submit"
        className={
          compact
            ? "inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
            : "inline-flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
        }
      >
        {label}
      </button>
    </form>
  );
}
