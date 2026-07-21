// ========================================
// File: src/components/admin/teams/ManagedSquadInjuryBridge.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type SquadStatus = "ACTIVE" | "INJURED";

type MemberStatus = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  squadStatus: SquadStatus;
  squadStatusUpdatedAt: string | null;
  squadStatusNote: string | null;
};

type StatusPayload = {
  members?: MemberStatus[];
  error?: string;
};

function getAdminTeamId(pathname: string) {
  return pathname.match(/^\/admin\/teams\/([^/]+)\/squad\/?$/)?.[1] ?? "";
}

function getMemberName(member: MemberStatus) {
  return member.name?.trim() || member.email?.trim() || "Unnamed player";
}

export default function ManagedSquadInjuryBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const teamId = useMemo(() => getAdminTeamId(pathname), [pathname]);
  const [members, setMembers] = useState<MemberStatus[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!teamId) {
      setMembers([]);
      setNotes({});
      setError("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    void fetch(
      `/api/admin/managed-squad-status?teamId=${encodeURIComponent(teamId)}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as StatusPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load squad injury status.");
        }
        return payload;
      })
      .then((payload) => {
        const nextMembers = payload?.members ?? [];
        setMembers(nextMembers);
        setNotes(
          Object.fromEntries(
            nextMembers.map((member) => [member.id, member.squadStatusNote ?? ""]),
          ),
        );
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load squad injury status.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [teamId]);

  async function updateStatus(member: MemberStatus, squadStatus: SquadStatus) {
    if (!teamId) return;

    setUpdatingId(member.id);
    setError("");

    try {
      const note = squadStatus === "INJURED" ? notes[member.id]?.trim() || null : null;
      const response = await fetch("/api/admin/managed-squad-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          membershipId: member.id,
          squadStatus,
          note,
        }),
      });
      const payload = (await response.json().catch(() => null)) as StatusPayload | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not update injury status.");
      }

      setMembers((current) =>
        current.map((item) =>
          item.id === member.id
            ? {
                ...item,
                squadStatus,
                squadStatusNote: note,
                squadStatusUpdatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      if (squadStatus === "ACTIVE") {
        setNotes((current) => ({ ...current, [member.id]: "" }));
      }
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update injury status.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (!teamId) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-red-400/20 bg-red-500/[0.05] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200/70">
          Player availability status
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">Injuries</h2>
        <p className="mt-1 text-sm text-white/60">
          Marking a player injured removes them from future selections and disables availability chases until they are made available again.
        </p>
      </div>

      {error ? (
        <div className="border-b border-red-400/20 bg-red-500/10 px-5 py-3 text-sm text-red-100 sm:px-6">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="px-5 py-5 text-sm text-white/55 sm:px-6">Loading squad status…</div>
      ) : members.length === 0 ? (
        <div className="px-5 py-5 text-sm text-white/55 sm:px-6">No squad members found.</div>
      ) : (
        <div className="divide-y divide-white/10">
          {members.map((member) => {
            const isInjured = member.squadStatus === "INJURED";
            const isUpdating = updatingId === member.id;

            return (
              <div
                key={member.id}
                className={`grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] ${
                  isInjured ? "bg-red-500/[0.06]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-white">
                      {getMemberName(member)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60">
                      {member.role.replaceAll("_", " ")}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        isInjured
                          ? "border-red-400/35 bg-red-500/15 text-red-100"
                          : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      }`}
                    >
                      {isInjured ? "Injured — unavailable" : "Available"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/45">
                    {member.email || "No email on account"}
                  </div>
                  {isInjured && member.squadStatusNote ? (
                    <div className="mt-2 text-sm text-red-100/70">
                      Injury note: {member.squadStatusNote}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {!isInjured ? (
                    <input
                      value={notes[member.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [member.id]: event.target.value,
                        }))
                      }
                      placeholder="Optional injury note"
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-red-400/50"
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() =>
                      void updateStatus(member, isInjured ? "ACTIVE" : "INJURED")
                    }
                    className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isInjured
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                        : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                    }`}
                  >
                    {isUpdating
                      ? "Saving…"
                      : isInjured
                        ? "Mark available"
                        : "Mark injured"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
