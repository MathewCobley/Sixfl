// src/components/admin/ConfirmDeleteButton.tsx

"use client";

export default function ConfirmDeleteButton({
  label,
  confirmText,
  className,
}: {
  label: string;
  confirmText: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}