type InjuredPlayerStateProps = {
  note?: string | null;
  context: "availability" | "selection";
};

export function InjuredPlayerBadge({ note }: { note?: string | null }) {
  return (
    <span
      title={note?.trim() || "This player is marked injured and unavailable."}
      className="rounded-full border border-red-400/40 bg-red-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-red-100"
    >
      Injured — unavailable
    </span>
  );
}

export default function InjuredPlayerState({
  note,
  context,
}: InjuredPlayerStateProps) {
  return (
    <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium leading-6 text-red-100">
      {context === "selection"
        ? "This player is marked injured and is not available for selection. Mark them available from the squad page before selecting them."
        : "This player is marked injured. Availability responses and SMS chases are disabled until they are marked available again."}
      {note?.trim() ? (
        <div className="mt-1 text-xs font-normal text-red-100/70">
          Injury note: {note.trim()}
        </div>
      ) : null}
    </div>
  );
}
