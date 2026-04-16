// ========================================
// File: src/components/admin/social/CopyCaptionButton.tsx
// ========================================

"use client";

export default function CopyCaptionButton({
  caption,
}: {
  caption: string;
}) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(caption)}
      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
    >
      Copy caption
    </button>
  );
}