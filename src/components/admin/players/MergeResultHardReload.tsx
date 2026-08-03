"use client";

import { useEffect } from "react";

export default function MergeResultHardReload({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("hardReload");

    // Player merges can start from pages containing legacy DOM bridges. A normal
    // server-action redirect keeps those orphaned elements alive during the route
    // transition. Replace the document once so the admin squad console starts from
    // a clean React tree, while preserving the merge success message.
    window.location.replace(url.toString());
  }, [active]);

  return null;
}
