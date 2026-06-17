// ========================================
// File: src/components/admin/AdminSidebarDesktopColumnsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";

export default function AdminSidebarDesktopColumnsBridge() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("aside.sticky nav");

    if (!nav) return;

    nav.classList.add("xl:grid-cols-2");
  }, []);

  return null;
}
