// src/components/admin/CopyToClipboardButton.tsx

"use client";

export default function CopyToClipboardButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
      }}
    >
      {label}
    </button>
  );
}