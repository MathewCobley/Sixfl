"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

type ExtraKitRequest = {
  id: string;
  payerName: string;
  description: string | null;
  amountPence: number;
  paidPence: number;
  outstandingPence: number;
  status: "OPEN" | "PAID" | "CANCELLED";
  paymentUrl: string | null;
  createdAt: string;
};

type ExtraKitResponse = {
  eligible?: boolean;
  legacyOffer?: boolean;
  includedKitQuantity?: number;
  extraKitPricePence?: number;
  team?: { id: string; name: string };
  members?: TeamMember[];
  requests?: ExtraKitRequest[];
  error?: string;
};

function getKitTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/kit(?:\/|$)/)?.[1] ?? null;
}

function normaliseText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function applyLegacyWording() {
  const root = document.querySelector<HTMLElement>(".captain-team-main");
  if (!root) return;

  const elements = root.querySelectorAll<HTMLElement>("div, span, p, button, a");

  elements.forEach((element) => {
    const text = normaliseText(element.textContent);

    if (text === "£70 Founding Team Kit Package") {
      element.textContent = "Free kit offer";
      return;
    }

    if (
      text ===
      "The compulsory team contribution is £70 in total — £10 for each of the seven personalised shirts. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Your free kit offer includes seven complete kits. Additional complete kits are available for £20 each.";
      return;
    }

    if (
      text ===
      "Your seven-kit order has been submitted to SIXFL. It is now locked while we review it. The £70 contribution must be paid before the supplier order is placed."
    ) {
      element.textContent =
        "Your seven-kit order has been submitted to SIXFL. It is now locked while we review and place it.";
      return;
    }

    if (
      text ===
      "The details below are read-only while SIXFL checks the order and arranges the £70 payment. Contact us if anything needs changing before production begins."
    ) {
      element.textContent =
        "The details below are read-only while SIXFL checks and places your kit order. Contact us if anything needs changing before production begins.";
      return;
    }

    if (text === "Compulsory printing contribution") {
      element.textContent = "Free kit allocation";
      return;
    }

    if (text === "£70 per team") {
      element.textContent = "Seven complete kits included";
      return;
    }

    if (
      text ===
      "This is £10 for each of the seven personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Please check every size, name and shirt number carefully before submitting. Additional complete kits are available for £20 each using the payment section above.";
      return;
    }

    if (text === "Submit £70 kit package") {
      element.textContent = "Submit free kit order";
      return;
    }

    if (
      element.tagName === "A" &&
      (text === "Read package terms" || text === "Read the Kit Package Terms")
    ) {
      element.hidden = true;
    }
  });
}

export default function LegacyFreeKitOfferCopyBridge() {
  const pathname = usePathname();
  const teamId = getKitTeamId(pathname);
  const [data, setData] = useState<ExtraKitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!teamId) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as ExtraKitResponse | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "The kit payment details could not be loaded.");
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The kit payment details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setData(null);
    setSelectedMemberIds([]);
    setMessage(null);
    setError(null);
    void load();
  }, [teamId]);

  useEffect(() => {
    if (!data?.legacyOffer) return;

    applyLegacyWording();
    const observer = new MutationObserver(applyLegacyWording);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(applyLegacyWording, 300);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [data?.legacyOffer, pathname]);

  const totalPence = quantity * (data?.extraKitPricePence ?? 2000);
  const selectedMembers = useMemo(
    () =>
      (data?.members ?? []).filter((member) => selectedMemberIds.includes(member.id)),
    [data?.members, selectedMemberIds],
  );
  const estimatedSharePence = selectedMembers.length
    ? Math.floor(totalPence / selectedMembers.length)
    : totalPence;

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  async function createRequests(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity, memberIds: selectedMemberIds }),
        },
      );
      const payload = (await response.json().catch(() => null)) as ExtraKitResponse & {
        emailsQueued?: number;
        emailsFailed?: number;
      };

      if (!response.ok) {
        throw new Error(payload?.error || "The payment links could not be created.");
      }

      setSelectedMemberIds([]);
      setData((current) =>
        current
          ? { ...current, requests: payload.requests ?? current.requests }
          : current,
      );
      setMessage(
        payload.emailsFailed
          ? `Payment links created. ${payload.emailsQueued ?? 0} email${payload.emailsQueued === 1 ? "" : "s"} queued; ${payload.emailsFailed} could not be emailed, so use the payment links shown below.`
          : `Payment link${(payload.emailsQueued ?? 0) === 1 ? "" : "s"} created and emailed successfully.`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The payment links could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!teamId || loading || !data?.eligible) return null;

  return (
    <div className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] space-y-4 sm:w-[calc(100%-5rem)]">
      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/75">
          Free kit offer
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Seven complete kits are included
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          Your team can order seven complete kits free of charge. Any additional complete kits cost £20 each.
        </p>
      </section>

      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/75">
              Additional kits
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Add more kits for £20 each
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Select one team member to pay the full amount, or select several members to split the total equally. Each selected person receives their own secure payment link by email.
            </p>

            {message ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <form onSubmit={createRequests} className="mt-5 space-y-5">
              <label className="block max-w-xs space-y-2">
                <span className="text-sm font-semibold text-white">Number of extra kits</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                  }
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-sky-400/40"
                />
                <span className="block text-xs text-white/45">
                  Total: {formatMoney(totalPence)}
                  {selectedMembers.length > 1
                    ? ` · approximately ${formatMoney(estimatedSharePence)} each`
                    : ""}
                </span>
              </label>

              <div>
                <div className="text-sm font-semibold text-white">
                  Who should receive a payment link?
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(data.members ?? []).map((member) => {
                    const disabled = !member.email;
                    const checked = selectedMemberIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${
                          checked
                            ? "border-sky-400/40 bg-sky-500/10 text-white"
                            : "border-white/10 bg-black/20 text-white/75"
                        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleMember(member.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-semibold text-white">{member.name}</span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {member.email || "No email saved — add one before selecting this player"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || selectedMemberIds.length === 0}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-sky-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creating payment links…" : "Create and email payment links"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-white">Payment requests</div>
              <button
                type="button"
                onClick={() => void load()}
                className="text-xs font-semibold text-sky-200 hover:text-sky-100"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {(data.requests ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">
                  No additional-kit payment requests yet.
                </div>
              ) : (
                (data.requests ?? []).map((request) => (
                  <div key={request.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{request.payerName}</div>
                        <div className="mt-1 text-xs text-white/45">
                          {formatMoney(request.amountPence)} requested
                        </div>
                      </div>
                      <span
                        className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          request.status === "PAID"
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                            : request.status === "CANCELLED"
                              ? "border-white/10 bg-white/[0.04] text-white/45"
                              : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                        }`}
                      >
                        {request.status === "PAID"
                          ? "Paid"
                          : request.status === "CANCELLED"
                            ? "Cancelled"
                            : `${formatMoney(request.outstandingPence)} open`}
                      </span>
                    </div>
                    {request.paymentUrl ? (
                      <a
                        href={request.paymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-xs font-semibold text-sky-200 underline decoration-sky-400/40 underline-offset-4"
                      >
                        Open payment link
                      </a>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
