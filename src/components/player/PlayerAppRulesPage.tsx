type RuleSection = {
  title: string;
  points: string[];
};

export default function PlayerAppRulesPage({
  eyebrow,
  title,
  intro,
  version,
  effectiveDate,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  version: string;
  effectiveDate: string;
  sections: RuleSection[];
}) {
  return (
    <main className="px-4 pb-28 pt-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/45">{intro}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-white/45">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {version}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              Effective {effectiveDate}
            </span>
          </div>
        </div>

        <section className="mt-5 space-y-2">
          {sections.map((section, index) => (
            <details
              key={section.title}
              open={index === 0}
              className="group rounded-[1.3rem] border border-white/10 bg-white/[0.04] px-4 py-3"
            >
              <summary className="cursor-pointer list-none pr-7 text-sm font-black text-white marker:hidden">
                <span className="flex items-start justify-between gap-3">
                  <span>{section.title}</span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-lg leading-none text-white/30 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                {section.points.map((point) => (
                  <p key={point} className="text-xs leading-5 text-white/55">
                    {point}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </section>
      </div>
    </main>
  );
}
