// ========================================
// File: src/components/admin/templates/DeleteTemplateButton.tsx
// ========================================

"use client";

import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 text-sm font-medium text-rose-200 transition hover:border-rose-400/30 hover:bg-rose-500/15 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
    >
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

type DeleteTemplateButtonProps = {
  templateName: string;
};

export default function DeleteTemplateButton({
  templateName,
}: DeleteTemplateButtonProps) {
  return (
    <div
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        if (target.closest("button[type='submit']")) {
          const confirmed = window.confirm(
            `Delete \"${templateName}\"? This cannot be undone.`,
          );

          if (!confirmed) {
            event.preventDefault();
            event.stopPropagation();
          }
        }
      }}
    >
      <SubmitButton />
    </div>
  );
}
