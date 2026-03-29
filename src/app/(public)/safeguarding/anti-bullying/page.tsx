// ========================================
// File: src/app/safeguarding/anti-bullying/page.tsx
// ========================================

import Link from "next/link";

export default function AntiBullyingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/30 to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            SIXFL Safeguarding
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Anti-Bullying Policy
          </h1>

          <p className="mt-4 text-lg text-white/70">
            SIXFL is committed to providing a safe, respectful and inclusive
            environment for all players. Bullying of any kind is not
            acceptable in our leagues, events or associated activities.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6 lg:px-8 text-white/80">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">1. Statement</h2>
          <p className="mt-4 leading-7">
            SIXFL believes that every child and young person has the right to
            enjoy football in an environment where they feel safe, supported
            and respected. We will not tolerate bullying by players, team
            representatives, spectators, referees, volunteers or any other
            individual involved in our leagues.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">2. What is bullying?</h2>
          <p className="mt-4 leading-7">
            Bullying is behaviour by an individual or group that is repeated,
            intended to hurt someone physically or emotionally, or has the
            effect of making them feel intimidated, isolated, humiliated or
            unsafe.
          </p>

          <p className="mt-4 leading-7">
            Bullying can take different forms, including verbal, physical,
            emotional, social and online behaviour.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">3. Examples of bullying</h2>

          <div className="mt-4 space-y-3 leading-7">
            <p>Bullying may include, but is not limited to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Name-calling, insults or repeated teasing.</li>
              <li>Threatening, intimidating or humiliating another person.</li>
              <li>Physical aggression or unwanted physical contact.</li>
              <li>Excluding someone deliberately from a team or group.</li>
              <li>Spreading rumours or encouraging others to isolate someone.</li>
              <li>Mocking a person’s appearance, ability, background or identity.</li>
              <li>Sending abusive messages or using social media to target someone.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">4. Our expectations</h2>
          <p className="mt-4 leading-7">
            All participants in SIXFL leagues are expected to treat others with
            dignity and respect. This includes players, parents, guardians,
            coaches, team managers, referees, volunteers and spectators.
          </p>

          <p className="mt-4 leading-7">
            Everyone involved in SIXFL should help create a positive football
            environment where concerns are taken seriously and young players
            feel confident speaking up.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">5. Reporting bullying</h2>
          <p className="mt-4 leading-7">
            Any bullying concerns should be reported as soon as possible to
            SIXFL. Reports may be made by a player, parent, guardian, team
            representative, referee, spectator or venue staff member.
          </p>

          <p className="mt-4 leading-7">
            All reports will be taken seriously and considered appropriately.
            Where necessary, SIXFL may investigate concerns, speak with those
            involved and take action to protect participants.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">6. Possible action</h2>
          <p className="mt-4 leading-7">
            Where bullying is identified, SIXFL may take action including
            warnings, matchday sanctions, removal from venues, suspension from
            league activities or referral to appropriate safeguarding or
            governing bodies where required.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-white">7. Contact</h2>
          <p className="mt-4 leading-7">
            If you need to report a bullying concern relating to SIXFL, please
            contact:
          </p>

          <p className="mt-4 font-semibold text-white">hello@sixfl.co.uk</p>
        </div>

        <div className="border-t border-white/10 pt-6">
          <Link
            href="/safeguarding"
            className="font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            ← Back to Safeguarding
          </Link>
        </div>
      </section>
    </main>
  );
}