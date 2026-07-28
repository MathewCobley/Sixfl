// ========================================
// File: src/components/admin/player-pool/DeletePlayerPoolProfileButton.tsx
// ========================================

"use client";

import { useFormStatus } from "react-dom";

type DeletePlayerPoolProfileButtonProps = {
  profileId: string;
  playerName: string;
  action: (formData: FormData) => void | Promise<void>;
};

function DeleteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-100 transition hover:border-red-400/40 hover:bg-red-500/15 disabled:cursor-wait disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete from PlayerPool"}
    </button>
  );
}

export default function DeletePlayerPoolProfileButton({
  profileId,
  playerName,
  action,
}: DeletePlayerPoolProfileButtonProps) {
  function confirmDelete(event: React.FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      `Delete ${playerName} from PlayerPool?\n\nThis removes their PlayerPool profile and introduction requests. Their original lead and player record will be kept.`,
    );

    if (!confirmed) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmDelete}>
      <input type="hidden" name="profileId" value={profileId} />
      <DeleteSubmitButton />
    </form>
  );
}
