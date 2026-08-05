import type { ReactNode } from "react";

import AdminFixturePlanningNav from "@/components/admin/fixtures/AdminFixturePlanningNav";

export default function AdminTeamUnavailabilityLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
        <AdminFixturePlanningNav />
      </div>
      {children}
    </div>
  );
}
