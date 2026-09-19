import PwaDiagnosticsPanel from "@/components/admin/PwaDiagnosticsPanel";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "PWA Diagnostics | SIXFL Admin",
};

export default async function AdminPwaDiagnosticsPage() {
  await requireAdmin();

  return (
    <div className="w-full px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <PwaDiagnosticsPanel />
    </div>
  );
}
