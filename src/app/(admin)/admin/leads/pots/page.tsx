// ========================================
// File: src/app/(admin)/admin/leads/pots/page.tsx
// ========================================

import { redirect } from "next/navigation";

export default function OldPlayerLeadPotsRouteRedirect() {
  redirect("/admin/leads/player-flow");
}
