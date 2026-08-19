import {
  FIXTURE_ABANDONMENT_REASONS,
  getFixtureAbandonmentReasonLabel,
  type FixtureAbandonmentRow,
} from "@/lib/fixtures/abandonment";
import { recordNightFixtureAbandonmentAction } from "@/app/(public)/referee/abandonment-actions";

export default function AbandonedMatchForm({
  refereeNightId,
  fixtureId,
  homeTeam,
  awayTeam,
  abandonment,
  locked,
}: {
  refereeNightId: string;
  fixtureId: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  abandonment: FixtureAbandonmentRow | null;
  locked: boolean;
}) {
  if (abandonment) {
    const responsibleName =
      abandonment.responsibleTeamId === homeTeam.id
        ? homeTeam.name
        : abandonment.responsibleTeamId === awayTeam.id
          ? awayTeam.name
          : null;
    const innocentName =
      abandonment.innocentTeamId === homeTeam.id
        ? homeTeam.name
        : abandonment.innocentTeamId === awayTeam.id
          ? awayTeam.name
          : null;

    return (
      <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-red-300/25 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-red-100">
            Match abandoned
          </span>
          <span className="text-xs text-white/45">
            {getFixtureAbandonmentReasonLabel(abandonment.reason)}
          </span>
        </div>
        {abandonment.details ? (
          <p className="mt-3 text-sm leading-6 text-white/70">{abandonment.details}</p>
        ) : null}
        {responsibleName && innocentName ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white/70">
            <strong className="text-white">{responsibleName}</strong> recorded as responsible. Their charge is both teams&apos; match fees. <strong className="text-white">{innocentName}</strong> has no fee due for this match; any payment already received is handled as credit where applicable.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white/65">
            No team was recorded as financially responsible. SIXFL will review any fee adjustment separately.
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-white/45">
          No official result is created by the abandonment. The result and league outcome remain for SIXFL to decide.
        </p>
      </div>
    );
  }

  if (locked) return null;

  return (
    <details className="overflow-hidden rounded-2xl border border-red-400/20 bg-red-500/[0.06]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/10 [&::-webkit-details-marker]:hidden">
        <span>Match abandoned?</span>
        <span className="text-xs font-normal text-red-100/55">Use only if the referee ended the match early</span>
      </summary>
      <form action={recordNightFixtureAbandonmentAction} className="space-y-4 border-t border-red-400/15 p-4">
        <input type="hidden" name="refereeNightId" value={refereeNightId} />
        <input type="hidden" name="fixtureId" value={fixtureId} />

        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50/85">
          If one team&apos;s conduct caused the abandonment, SIXFL rules make that team responsible for <strong>both match fees</strong>. The other team&apos;s unpaid fee is waived; if it has already paid, the payment is converted to team credit where applicable. Both teams are emailed automatically. The match result is left for SIXFL to decide separately.
        </div>

        <label className="block text-sm text-white/75">
          <span className="font-semibold text-white">Reason for abandonment</span>
          <select
            name="reason"
            required
            defaultValue=""
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/50 px-3 text-white outline-none"
          >
            <option value="" disabled>Choose reason…</option>
            {FIXTURE_ABANDONMENT_REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-white/75">
          <span className="font-semibold text-white">Team responsible</span>
          <span className="ml-2 text-xs text-white/40">Required when one team&apos;s conduct caused it</span>
          <select
            name="responsibleTeamId"
            defaultValue=""
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/50 px-3 text-white outline-none"
          >
            <option value="">No team / not a team-conduct abandonment</option>
            <option value={homeTeam.id}>{homeTeam.name}</option>
            <option value={awayTeam.id}>{awayTeam.name}</option>
          </select>
        </label>

        <label className="block text-sm text-white/75">
          <span className="font-semibold text-white">Referee details</span>
          <textarea
            name="details"
            rows={4}
            placeholder="e.g. Manager was sent off, refused repeated instructions to leave the playing area, so the referee abandoned the match."
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-white outline-none placeholder:text-white/30"
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white/70">
          <input
            type="checkbox"
            name="confirmAbandonment"
            value="yes"
            required
            className="mt-1 h-4 w-4"
          />
          <span>
            I confirm the referee abandoned this match. I understand this removes any entered score as the official result, applies the fee rule where a responsible team is selected, and emails both teams.
          </span>
        </label>

        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-400 sm:w-auto"
        >
          Mark match abandoned
        </button>
      </form>
    </details>
  );
}
