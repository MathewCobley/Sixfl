// ========================================
// File: src/components/admin/leads/DeleteLeadButton.tsx
// ========================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLeadAction } from "@/app/(admin)/admin/leads/[id]/actions";

type Props = {
  leadId: string;
  leadName: string;
};

export default function DeleteLeadButton({ leadId, leadName }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete lead "${leadName}"?\n\nThis will permanently remove the lead and any stored email history.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const formData = new FormData();
    formData.set("leadId", leadId);

    const result = await deleteLeadAction(formData);

    if (result?.ok) {
      router.push("/admin/leads");
      router.refresh();
      return;
    }

    setError(result?.error || "Failed to delete lead.");
    setDeleting(false);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-6 text-sm font-bold tracking-[0.12em] text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
      >
        {deleting ? "Deleting..." : "Delete lead"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}