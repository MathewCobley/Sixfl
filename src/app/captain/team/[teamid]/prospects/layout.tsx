import type { ReactNode } from "react";
import RegistrationReminderPanel from "@/components/managed-squad/RegistrationReminderPanel";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export default async function ProspectsReminderLayout({ children, params }: { children: ReactNode; params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  return <><RegistrationReminderPanel teamId={teamid} />{children}</>;
}
