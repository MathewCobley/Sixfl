import Link from "next/link";

export const metadata = {
  title: "Install SIXFL",
  description: "Add SIXFL to your iPhone or Android Home Screen.",
};

const steps = [
  {
    number: "1",
    title: "Open SIXFL in Safari",
    detail: "Use Safari on your iPhone and open sixfl.co.uk.",
  },
  {
    number: "2",
    title: "Tap Share",
    detail: "Tap the Share button at the bottom of Safari.",
  },
  {
    number: "3",
    title: "Add to Home Screen",
    detail: "Scroll down and choose Add to Home Screen.",
  },
  {
    number: "4",
    title: "Tap Add",
    detail: "SIXFL will appear on your iPhone alongside your other apps.",
  },
];

export default function InstallSixflPage() {
  return (
    <main className="min-h-screen bg-[#071018] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm font-semibold text-white/55 transition hover:text-white"
          >
            ← Back to SIXFL
          </Link>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            App setup
          </span>
        </div>

        <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex items-center gap-4">
            <img
              src="/apple-icon.png"
              alt="SIXFL app icon"
              className="h-20 w-20 rounded-[1.35rem] border border-white/10 shadow-lg"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
                SIXFL on iPhone
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Install SIXFL</h1>
            </div>
          </div>

          <p className="mt-6 text-base leading-7 text-white/65">
            Add SIXFL to your Home Screen and it opens in its own full-screen app window,
            without the Safari address bar.
          </p>

          <div className="mt-8 space-y-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="flex gap-4 rounded-2xl border border-white/8 bg-black/20 p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400 font-black text-black">
                  {step.number}
                </div>
                <div>
                  <h2 className="font-bold text-white">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-white/55">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-sm leading-6 text-emerald-50/80">
            You do not need an App Store account for this first SIXFL app version. Your normal
            SIXFL login, fixtures, payments and team tools continue to use the existing SIXFL
            system.
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white/80">
            Android
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Open SIXFL in Chrome, open the browser menu and choose Install app or Add to Home
            screen.
          </p>
        </section>
      </div>
    </main>
  );
}
