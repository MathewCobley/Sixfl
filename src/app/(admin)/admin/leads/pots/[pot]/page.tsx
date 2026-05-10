// ========================================
// File: src/app/(admin)/admin/leads/pots/[pot]/page.tsx
// ========================================

import { redirect } from "next/navigation";

export default function OldPlayerLeadRouteRedirect() {
  redirect("/admin/leads/player-flow");
}
