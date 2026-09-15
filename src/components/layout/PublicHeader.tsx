"use client";

import { usePathname } from "next/navigation";

import AppHeader from "@/components/layout/AppHeader";

export default function PublicHeader() {
  const pathname = usePathname();
  // Referee pages own their compact operational chrome; keep the public marketing header out.
  const isRefereeRoute = pathname === "/referee" || pathname.startsWith("/referee/");

  if (isRefereeRoute) return null;

  return <AppHeader variant="public" />;
}
