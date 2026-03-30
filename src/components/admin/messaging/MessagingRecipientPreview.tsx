// ========================================
// File: src/components/admin/messaging/MessagingRecipientPreview.tsx
// ========================================

"use client";

type Recipient = {
  id: string;
  contactName: string | null;
  email: string;
  area: string | null;
  interestType: "TEAM" | "PLAYER" | "REFEREE";
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
};

export default function MessagingRecipientPreview({
  recipients,
  selectedIds,
  onToggle,
}: {
  recipients: Recipient[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (recipients.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
        No recipients match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recipients.map((recipient) => {
        const checked = selectedIds.includes(recipient.id);

        return (
          <label
            key={recipient.id}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/[0.04]"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(recipient.id)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500"
            />

            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">
                {recipient.contactName || "Unnamed lead"}
              </div>
              <div className="mt-1 break-all text-sm text-white/55">
                {recipient.email}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  {recipient.interestType}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  {recipient.status}
                </span>
                {recipient.area ? (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                    {recipient.area}
                  </span>
                ) : null}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
