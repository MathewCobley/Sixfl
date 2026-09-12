import type { ReactNode } from "react";
import ManagedSquadInjuryBridge from "@/components/admin/teams/ManagedSquadInjuryBridge";
import { requireAdmin } from "@/lib/requireAdmin";

// The console must remain inside AdminLayout's main column. Availability is
// supplementary, not a full-width block ahead of the header and sidebar.
export default async function AdminSquadLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  return (
    <div data-admin-squad-console className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      {children}
      <ManagedSquadInjuryBridge key={id} teamId={id} />
    </div>
  );
}
