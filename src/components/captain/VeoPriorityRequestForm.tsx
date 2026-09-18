'use client';

export default function VeoPriorityRequestForm({
  teamId: _teamId,
  leagueId: _leagueId,
  termsVersion: _termsVersion,
}: {
  teamId: string;
  leagueId: string;
  termsVersion: string;
}) {
  return (
    <div className="rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/10 p-4 text-sm leading-6 text-fuchsia-100">
      SIXFL TV Priority is free and earned automatically from your team score. There is no request form, opt-in fee or filming supplement.
    </div>
  );
}
