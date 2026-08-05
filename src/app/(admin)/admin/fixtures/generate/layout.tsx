import type { ReactNode } from "react";

import AdminFixtureUnavailabilitySummary from "@/components/admin/fixtures/AdminFixtureUnavailabilitySummary";

export default function AdminFixtureGeneratorLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
        <AdminFixtureUnavailabilitySummary />
      </div>
      {children}
    </>
  );
}
