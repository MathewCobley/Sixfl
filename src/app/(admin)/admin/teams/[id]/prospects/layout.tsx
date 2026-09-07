import type { ReactNode } from "react";
import RegistrationReminderPanel from "@/components/managed-squad/RegistrationReminderPanel";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export default async function ProspectsReminderLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  return <><RegistrationReminderPanel teamId={id} />{children}</>;
}
