import { getPendingActivationEmailStatus } from "@/lib/squad/activation-emails";

/** Server-rendered, read-only status. Opening a squad page never sends mail. */
export default async function PendingActivationEmailStatus({ prospectId }: { prospectId: string }) {
  let message: string;
  try { message = await getPendingActivationEmailStatus(prospectId); }
  catch { message = "Activation status could not be checked. Review Prospect comms before sending manually."; }
  return <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/65">{message}</p>;
}
