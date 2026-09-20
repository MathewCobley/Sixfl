import PortalChat from "@/components/messaging/PortalChat";
import { notFound } from "next/navigation";

import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Chat | SIXFL",
};

export default async function CaptainTeamChatPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  if (!access.isAdmin) {
    notFound();
  }

  return (
    <PortalChat teamId={teamid} adminTestMode />
  );
}
