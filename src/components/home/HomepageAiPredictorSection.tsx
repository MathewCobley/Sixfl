import Image from "next/image";

import predictorLogo from "../../../public/logos/sixfl-ai-predictor.png";

const predictorHomeTeamName = "Six Offenders";
const predictorAwayTeamName = "Crescent United";

const predictorSample = [
  { label: predictorHomeTeamName, value: 58, tone: "emerald" },
  { label: "Draw", value: 14, tone: "neutral" },
  { label: predictorAwayTeamName, value: 28, tone: "sky" },
];

export type PredictorSampleTeamLogos = {
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
};

export default function HomepageAiPredictorSection({
  teamLogos,
}: {
  teamLogos: PredictorSampleTeamLogos;
}) {
  return (
    <section
      className="mt-12 lg:mt-16"
      data-testid="homepage-ai-predictor"
      aria-labelledby="homepage-ai-predictor-heading"
    >
      <div className="overflow-hidden rounded-[1.5rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center">
          <div>
            <div className="relative -mt-2 h-32 w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/70 shadow-[0_18px_55px_rgba(0,0,0,0.35)] sm:h-40">
              <Image
                src={predictorLogo}
                alt="SIXFL AI Predictor"
                priority
                className="h-full w-full object-cover object-[center_58%]"
                sizes="(max-width: 640px) 100vw, 576px"
              />
            </div>
            <h2
              id="homepage-ai-predictor-heading"
              className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl"
            >
              Match predictions, powered by SIXFL AI Predictor.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
              Before kick-off, SIXFL AI Predictor turns recent results, goals scored, goals conceded and league position into a simple match preview and win chance estimate.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              It is just for fun. It gives teams something extra to check, compare and talk about before they play.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <FeaturePill text="AI match previews" />
              <FeaturePill text="Win chance estimates" />
              <FeaturePill text="Form-based insight" />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-black/45 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)] sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
                  Match prediction
                </div>
                <h3 className="mt-2 text-xl font-black text-white">
                  {predictorHomeTeamName} vs {predictorAwayTeamName}
                </h3>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:gap-5 sm:p-5">
              <SampleTeamBadge
                initials="SO"
                logoUrl={teamLogos.homeLogoUrl}
                name={predictorHomeTeamName}
                tone="emerald"
              />
              <div className="rounded-full border border-white/10 bg-black/60 px-3 py-2 text-xs font-black tracking-[0.2em] text-white/55">
                VS
              </div>
              <SampleTeamBadge
                initials="CU"
                logoUrl={teamLogos.awayLogoUrl}
                name={predictorAwayTeamName}
                tone="sky"
              />
            </div>

            <div className="mt-6 space-y-4">
              {predictorSample.map((item) => (
                <PredictionBar key={item.label} {...item} />
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/62">
              Six Offenders are slight favourites after stronger recent scoring form. Crescent United still carry enough attacking threat to keep this fixture competitive.
            </div>
            <div className="mt-4 text-[11px] leading-5 text-white/35">
              Live predictions are calculated from completed SIXFL results, recent form, goals scored and goals conceded.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SampleTeamBadge({
  initials,
  logoUrl,
  name,
  tone,
}: {
  initials: string;
  logoUrl: string | null;
  name: string;
  tone: "emerald" | "sky";
}) {
  const badgeStyles =
    tone === "emerald"
      ? {
          outer:
            "border-emerald-300/25 bg-gradient-to-b from-emerald-300/22 via-emerald-500/12 to-black/70 shadow-emerald-500/20",
          inner:
            "border-emerald-200/30 bg-emerald-400/15 text-emerald-100",
          accent: "bg-emerald-300/75",
        }
      : {
          outer:
            "border-sky-300/25 bg-gradient-to-b from-sky-300/22 via-sky-500/12 to-black/70 shadow-sky-500/20",
          inner: "border-sky-200/30 bg-sky-400/15 text-sky-100",
          accent: "bg-sky-300/75",
        };

  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div
        className={`relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] border shadow-2xl sm:h-40 sm:w-40 ${badgeStyles.outer}`}
        aria-label={`${name} badge`}
        title={`${name} badge`}
      >
        {logoUrl ? (
          <div className="flex h-full w-full items-center justify-center bg-black/35 p-3 sm:p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={`${name} badge`}
              className="h-full w-full object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.5)]"
            />
          </div>
        ) : (
          <>
            <div className="absolute inset-3 rounded-[1.45rem] border border-white/10 bg-black/35" />
            <div
              className={`absolute left-1/2 top-4 h-1.5 w-12 -translate-x-1/2 rounded-full sm:w-16 ${badgeStyles.accent}`}
            />
            <div
              className={`relative flex h-16 w-16 items-center justify-center rounded-full border text-2xl font-black tracking-tight sm:h-20 sm:w-20 sm:text-3xl ${badgeStyles.inner}`}
            >
              {initials}
            </div>
          </>
        )}
      </div>
      <div className="mt-3 max-w-[9rem] text-sm font-black leading-5 text-white sm:text-base">
        {name}
      </div>
    </div>
  );
}

function PredictionBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  const barClass =
    tone === "emerald"
      ? "bg-emerald-400"
      : tone === "sky"
        ? "bg-sky-400"
        : "bg-white/45";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-white">{label}</span>
        <span className="font-black text-white">{value}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function FeaturePill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-emerald-200">
      {text}
    </span>
  );
}
