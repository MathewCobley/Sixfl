"use client";

import { usePathname } from "next/navigation";

import AppHeader from "@/components/layout/AppHeader";

export default function PublicHeader() {
  const pathname = usePathname();
  const isRefereeRoute = pathname === "/referee" || pathname.startsWith("/referee/");

  if (isRefereeRoute) return null;

  return <AppHeader variant="public" />;
}
