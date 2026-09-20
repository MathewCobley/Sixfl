"use client";

import { useState } from "react";

export default function CopyPlayerPaymentLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.08]"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
