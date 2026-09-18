export default function ReviewRequestForm({
  leagueId: _leagueId,
  requestId: _requestId,
}: {
  leagueId: string;
  requestId: string;
}) {
  return (
    <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-white/65">
      Paid Veo Priority requests are retired. SIXFL TV Priority is now calculated automatically from the team score.
    </p>
  );
}
