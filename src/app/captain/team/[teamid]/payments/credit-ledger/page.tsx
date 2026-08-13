import Link from "next/link";

export default async function TeamCreditLedgerPage({ params }: { params: Promise<{ teamid: string }> }) {
  const { teamid } = await params;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-white">Team credit ledger</h1>
      <Link href={`/captain/team/${teamid}/payments`}>Back to payments</Link>
    </div>
  );
}
