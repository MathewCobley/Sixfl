import PortalChat from "@/components/messaging/PortalChat";
import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";
import { notFound } from "next/navigation";

import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "SIXFL Chat | SIXFL",
};

export default async function CaptainTeamChatPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  // requireCaptain enforces team membership. Also fail closed for its local
  // development fallback; opening a tab must never grant messaging permissions.
  if (!access.isCaptain && !access.isAdmin) {
    notFound();
  }

  // The API independently resolves the signed-in actor. Ordinary captains never
  // request admin testing; captain-only previews remain read-only. Existing
  // full-administrator testing stays explicitly identified by the chat API/UI.
  return (
    <>
      <CaptainPwaModeOnly mode="app">
        <PortalChat teamId={teamid} playerApp adminTestMode={access.isAdmin} />
      </CaptainPwaModeOnly>
      <CaptainPwaModeOnly mode="web">
        <PortalChat teamId={teamid} adminTestMode={access.isAdmin} />
      </CaptainPwaModeOnly>
    </>
  );
}
