// ========================================
// File: src/app/(admin)/admin/teams/[id]/communications/page.tsx
// ========================================

import TeamCommunicationsPage from "@/components/admin/teams/TeamCommunicationsPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Communications | SIXFL",
};

export default TeamCommunicationsPage;
