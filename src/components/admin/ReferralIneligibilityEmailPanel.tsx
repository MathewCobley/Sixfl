import { getReferralIneligibilityEmailPanel } from "@/lib/referral-ineligibility-email";
import ReferralIneligibilityEmailPanelView from "./ReferralIneligibilityEmailPanelView";

export default async function ReferralIneligibilityEmailPanel({ referralId, actorUserId, action }: {
  referralId: string; actorUserId: string; action: (form: FormData) => Promise<void>;
}) {
  const panel = await getReferralIneligibilityEmailPanel(referralId, actorUserId);
  return <ReferralIneligibilityEmailPanelView referralId={referralId} panel={panel} action={action}/>;
}
