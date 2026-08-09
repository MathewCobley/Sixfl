// ========================================
// File: src/components/captain/CaptainSupportPanel.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { sendCaptainSupportRequestAction } from "@/app/captain/team/[teamid]/support/actions";
import GoalOfWeekDashboardPromo from "@/components/goal-of-week/GoalOfWeekDashboardPromo";

type HelpContext = {
  topic: string;
  title: string;
  body: string;
  options: string[];
};

type OptionPrompt = {
  title: string;
  helper: string;
  placeholder: string;
};

function getContext(pathname: string): HelpContext | null {
  if (/\/player-payments\/?$/.test(pathname)) {
    return {
      topic: "Squad payments",
      title: "Need help with squad payments?",
      body: "Use this page to split the team fee between players and send secure payment links. Player links only work if player emails are saved.",
      options: ["How do squad payments work?", "My player did not get a payment link", "I need to change a player amount", "A player has paid me directly", "I still need help"],
    };
  }

  if (/\/availability\/?$/.test(pathname) || /\/fixtures\/?$/.test(pathname)) {
    return {
      topic: "Fixture availability",
      title: "Need help with availability?",
      body: "Availability should be confirmed at least 72 hours before kick-off. If you cannot play or are unsure, raise it early so SIXFL can help.",
      options: ["I can confirm we can play", "I am short of players", "I need to raise an availability issue", "I am not sure what to do", "I still need help"],
    };
  }

  if (/\/results\/?$/.test(pathname)) {
    return {
      topic: "Results, scorers and Player of the Match",
      title: "Need help with results?",
      body: "Use this page to check scores, add scorers, add Player of the Match where available, or raise an issue if something is wrong.",
      options: ["The score is wrong", "I need to add scorers", "I need to add Player of the Match", "I want to raise a result issue", "I still need help"],
    };
  }

  if (/\/match-fees\/?$/.test(pathname)) {
    return {
      topic: "Matchday squad",
      title: "Need help with the matchday squad?",
      body: "Use this page to organise who is playing in a fixture and keep track of availability before matchday.",
      options: ["I need to pick the matchday squad", "I have maybes or no responses", "A player is missing", "I am not sure what to do", "I still need help"],
    };
  }

  if (/\/payments\/?$/.test(pathname)) {
    return {
      topic: "Team payments",
      title: "Need help with team payments?",
      body: "The team payment ledger shows the actual team charges. Squad payments help you collect from players, but the captain remains responsible for the team fee being covered.",
      options: ["I do not understand the balance", "A player has paid but the team still shows outstanding", "I need a payment link", "I have a payment problem", "I still need help"],
    };
  }

  if (/\/captain-squad\/?$/.test(pathname) || /\/squad\/?$/.test(pathname)) {
    return {
      topic: "Squad management",
      title: "Need help with your squad?",
      body: "Keep player names and emails up to date so availability, matchday planning and squad payment links work properly.",
      options: ["I need to add a player", "I need to edit a player email", "A player has left", "A player is missing from payments", "I still need help"],
    };
  }

  return null;
}

function getOptionPrompt(option: string, context: HelpContext): OptionPrompt {
  if (option.includes("payment") || option.includes("Payment") || option.includes("balance") || option.includes("paid")) {
    return {
      title: "Payment help selected",
      helper: "Please include the fixture, the amount showing, who has paid and what looks wrong.",
      placeholder: "Tell us which fixture/payment this relates to, what amount is showing, who has paid, and what needs checking.",
    };
  }

  if (option.includes("Fixture") || option.includes("availability") || option.includes("short") || option.includes("confirm")) {
    return {
      title: "Fixture help selected",
      helper: "Please include the fixture, whether you can play, and what support you need.",
      placeholder: "Tell us which fixture this relates to, how many players you have available, and what you need help with.",
    };
  }

  if (option.includes("Squad") || option.includes("player") || option.includes("Player") || option.includes("email")) {
    return {
      title: "Squad or player help selected",
      helper: "Please include the player name, email if relevant, and what needs adding, editing or checking.",
      placeholder: "Tell us which player this relates to, what the issue is, and what needs changing.",
    };
  }

  if (option.includes("score") || option.includes("result") || option.includes("scorers") || option.includes("Match")) {
    return {
      title: "Result help selected",
      helper: "Please include the fixture, score, scorer details or Player of the Match issue.",
      placeholder: "Tell us which fixture this relates to, what the correct result/details should be, and what needs fixing.",
    };
  }

  return {
    title: `Selected: ${option}`,
    helper: `Your message will be sent as ${context.topic} - ${option}.`,
    placeholder: "Tell us what has happened, what you are stuck with, and what you need SIXFL to do.",
  };
}

function isOverview(pathname: string, teamId: string) {
  return pathname === `/captain/team/${teamId}` || pathname === `/captain/team/${teamId}/`;
}

export default function CaptainSupportPanel({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const context = useMemo(() => getContext(pathname), [pathname]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState("Fixture issue");

  const sent = searchParams.get("support") === "sent";
  const missingMessage = searchParams.get("support") === "missing-message";

  if (isOverview(pathname, teamId)) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4">
          <GoalOfWeekDashboardPromo
            teamId={teamId}
            href={`/goal-of-the-week?from=captain&teamId=${encodeURIComponent(teamId)}`}
          />
        </div>

        <Link
          href={`/captain/team/${teamId}/weeks-unavailable`}
          className="md:col-span-2 xl:col-span-4 rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-5 transition hover:border-amber-300/35 hover:bg-amber-500/[0.12] sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/65">Advance fixture planning</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Know a week when your team cannot play?</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/70">Your team is assumed available. Only tell SIXFL about weeks when you already know you cannot field a team, before fixtures are published.</p>
            </div>
            <span className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black">
              Tell SIXFL
            </span>
          </div>
        </Link>

        <Link href={`/captain/team/${teamId}/help`} className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 transition hover:bg-emerald-500/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">How-to help</p>
          <h2 className="mt-3 text-xl font-semibold text-white">How to use the captain area</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-50/72">Step-by-step help for squad payments, availability, results, scorers and Player of the Match.</p>
        </Link>

        <Link href={`/captain/team/${teamId}/rules`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/20 hover:bg-white/[0.07]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Match Rules</p>
          <h2 className="mt-3 text-xl font-semibold text-white">Playing rules</h2>
          <p className="mt-2 text-sm leading-6 text-white/62">Kick-ins, substitutions, goalkeeper rules, fouls, penalties, referee decisions and venue-specific rules.</p>
        </Link>

        <Link href={`/captain/team/${teamId}/guide`} className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 transition hover:bg-amber-500/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">League Rules</p>
          <h2 className="mt-3 text-xl font-semibold text-white">Captain T&Cs</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/72">Captain agreement, fixture availability, payment responsibilities, cancellations and avoidable admin fees.</p>
        </Link>

        <button type="button" onClick={() => setIsOpen((value) => !value)} className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5 text-left transition hover:bg-sky-500/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Support</p>
          <h2 className="mt-3 text-xl font-semibold text-white">Contact SIXFL</h2>
          <p className="mt-2 text-sm leading-6 text-sky-50/72">Ask for help with a fixture, payment, squad issue, result or anything else.</p>
        </button>

        {isOpen ? (
          <div className="md:col-span-2 xl:col-span-4">
            <SupportForm
              teamId={teamId}
              pathname={pathname}
              context={{
                topic: "General captain support",
                title: "Contact SIXFL",
                body: "Tell us what you need help with. Your team and page details will be included automatically.",
                options: ["Fixture issue", "Payment question", "Squad/player issue", "Result or Player of the Match issue", "Other"],
              }}
              selectedOption={selectedOption}
              setSelectedOption={setSelectedOption}
            />
          </div>
        ) : null}
      </section>
    );
  }

  if (!context) return sent ? <SuccessNotice /> : null;

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
      {sent ? <SuccessNotice /> : null}
      {missingMessage ? <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Please add a short message before sending your request.</div> : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Need help?</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{context.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-50/72">{context.body}</p>
        </div>
        <button type="button" onClick={() => setIsOpen((value) => !value)} className="inline-flex items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/15">
          {isOpen ? "Close help" : "Open help"}
        </button>
      </div>

      {isOpen ? <SupportForm teamId={teamId} pathname={pathname} context={context} selectedOption={selectedOption} setSelectedOption={setSelectedOption} /> : null}
    </section>
  );
}

function SuccessNotice() {
  return <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">Thanks — your message has been sent to SIXFL. We’ll review it and get back to you.</div>;
}

function SupportForm({ teamId, pathname, context, selectedOption, setSelectedOption }: { teamId: string; pathname: string; context: HelpContext; selectedOption: string; setSelectedOption: (value: string) => void }) {
  const activeOption = context.options.includes(selectedOption) ? selectedOption : context.options[0] ?? "Other";
  const prompt = getOptionPrompt(activeOption, context);

  return (
    <form action={sendCaptainSupportRequestAction} className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="pagePath" value={pathname} />
      <input type="hidden" name="topic" value={context.topic} />
      <input type="hidden" name="quickOption" value={activeOption} />

      <div>
        <p className="text-sm font-semibold text-white">What do you need help with?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {context.options.map((option) => {
            const active = option === activeOption;
            return (
              <button key={option} type="button" onClick={() => setSelectedOption(option)} className={["rounded-full border px-3 py-2 text-xs font-semibold transition", active ? "border-sky-300/40 bg-sky-400/20 text-sky-50" : "border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"].join(" ")}>
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 p-4">
        <p className="text-sm font-semibold text-sky-50">{prompt.title}</p>
        <p className="mt-1 text-sm leading-6 text-sky-50/70">{prompt.helper}</p>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-white">Message to SIXFL</span>
        <textarea name="message" required rows={4} placeholder={prompt.placeholder} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-sky-300/40 focus:bg-black/40" />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-white/45">Your team, page and selected help topic will be included automatically.</p>
        <button type="submit" className="inline-flex items-center justify-center rounded-full bg-sky-300 px-5 py-3 text-sm font-bold text-black transition hover:bg-sky-200">Send to SIXFL</button>
      </div>
    </form>
  );
}