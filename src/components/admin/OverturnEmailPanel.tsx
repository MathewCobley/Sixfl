import { getResultOverturnEmailPanel } from "@/lib/fixtures/result-overturn-email";
import OverturnEmailPanelView from "./OverturnEmailPanelView";

export default async function OverturnEmailPanel({ fixtureId, decisionId, actorUserId, action }: {
  fixtureId: string; decisionId: string; actorUserId: string; action: (form: FormData) => Promise<void>;
}) {
  let panel;
  try { panel = await getResultOverturnEmailPanel(fixtureId, decisionId, actorUserId); }
  catch {
    return <p role="alert" className="rounded-xl border border-amber-300/25 p-4 text-sm text-amber-100">The email preview is temporarily unavailable. Your saved result and decision are unchanged. Refresh before trying to notify the teams.</p>;
  }
  return <OverturnEmailPanelView fixtureId={fixtureId} decisionId={decisionId} panel={panel} action={action}/>;
}
