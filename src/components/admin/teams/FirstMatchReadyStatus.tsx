import Link from "next/link";
import { getFirstMatchReadyStatus } from "@/lib/captain/first-match-ready";

export default async function FirstMatchReadyStatus({ teamId }: { teamId: string }) {
  let status: string;
  try { status = await getFirstMatchReadyStatus(teamId); }
  catch { status = "Status unavailable. Check team communications before sending."; }
  return (
    <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
      <p className="font-semibold text-white/80">First-match briefing</p>
      <p>{status}</p>
      <Link href={`/admin/teams/${teamId}/communications`} className="text-emerald-200 underline">View team comms</Link>
    </div>
  );
}
