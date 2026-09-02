"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

type KitPaymentRequest = {
  id: string;
  payerName: string;
  description: string | null;
  amountPence: number;
  paidPence: number;
  outstandingPence: number;
  kitFundPaidPence: number;
  externalPaidPence: number;
  status: "OPEN" | "PAID" | "CANCELLED";
  paymentUrl: string | null;
  createdAt: string;
};

type PaymentResponse = {
  members?: TeamMember[];
  requests?: KitPaymentRequest[];
  emailsQueued?: number;
  emailsFailed?: number;
  error?: string;
};

type CancelPaymentResponse = {
  ok?: boolean;
  error?: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default function StandardKitPaymentPanel({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PaymentResponse | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as PaymentResponse | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "The kit payment details could not be loaded.");
      }

      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The kit payment details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [teamId]);

  const selectedMembers = useMemo(
    () =>
      (data?.members ?? []).filter((member) =>
        selectedMemberIds.includes(member.id),
      ),
    [data?.members, selectedMemberIds],
  );

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  async function createLinks(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedMemberIds.length === 0) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberIds: selectedMemberIds }),
        },
      );
      const payload = (await response.json().catch(() => null)) as PaymentResponse | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "The kit payment links could not be created.");
      }

      setData((current) => ({
        ...current,
        ...payload,
        members: payload.members ?? current?.members,
        requests: payload.requests ?? current?.requests,
      }));
      setSelectedMemberIds([]);
      setMessage(
        payload.emailsFailed
          ? `${payload.emailsQueued ?? 0} payment email${payload.emailsQueued === 1 ? "" : "s"} queued. ${payload.emailsFailed} could not be emailed, so use the payment links shown below.`
          : `${payload.emailsQueued ?? selectedMembers.length} £20 kit payment link${(payload.emailsQueued ?? selectedMembers.length) === 1 ? "" : "s"} created and emailed.`,
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The kit payment links could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest(request: KitPaymentRequest) {
    const confirmed = window.confirm(
      `Cancel ${request.payerName}'s ${formatMoney(request.amountPence)} kit payment request?`,
    );
    if (!confirmed) return;

    setCancellingRequestId(request.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments/${encodeURIComponent(request.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as CancelPaymentResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The kit payment request could not be cancelled.");
      }

      setMessage(`${request.payerName}'s kit payment request was cancelled.`);
      await load();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The kit payment request could not be cancelled.",
      );
    } finally {
      setCancellingRequestId(null);
    }
  }

  return (
    <section className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 sm:w-[calc(100%-5rem)] sm:p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/75">
            Team kits
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Complete kits cost £20 each
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            Choose every squad member who wants a kit. Each selected player receives their own £20 payment link. When their payment is complete, a kit personalisation box becomes available below.
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

          {loading ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
              Loading squad members…
            </div>
          ) : (
            <form onSubmit={createLinks} className="mt-5 space-y-5">
              <div>
                <div className="text-sm font-semibold text-white">
                  Who wants a kit?
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(data?.members ?? []).map((member) => {
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
                          <span className="block font-semibold text-white">
                            {member.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {member.email ||
                              "No email saved — add one before sending a payment link"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={submitting || selectedMemberIds.length === 0}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-sky-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? "Creating payment links…"
                    : `Create ${selectedMemberIds.length || ""} £20 payment link${selectedMemberIds.length === 1 ? "" : "s"}`.replace("Create  £", "Create £")}
                </button>
                <span className="text-sm text-white/55">
                  {selectedMemberIds.length > 0
                    ? `${selectedMemberIds.length} kit${selectedMemberIds.length === 1 ? "" : "s"} · ${formatMoney(selectedMemberIds.length * 2000)} total`
                    : "Select the players who want one kit each."}
                </span>
              </div>
            </form>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-white">Kit payment requests</div>
            <button
              type="button"
              onClick={() => {
                void load();
                router.refresh();
              }}
              className="text-xs font-semibold text-sky-200 hover:text-sky-100"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {(data?.requests ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">
                No kit payment links have been created yet.
              </div>
            ) : (
              (data?.requests ?? []).map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">
                        {request.payerName}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {formatMoney(request.amountPence)} for one complete kit
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
                        ? "Paid — kit available"
                        : request.status === "CANCELLED"
                          ? "Cancelled"
                          : "Awaiting payment"}
                    </span>
                  </div>
                  {request.paymentUrl ||
                  (request.status === "OPEN" &&
                    (request.externalPaidPence ?? request.paidPence) <= 0) ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {request.paymentUrl ? (
                        <a
                          href={request.paymentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex text-xs font-semibold text-sky-200 underline decoration-sky-400/40 underline-offset-4"
                        >
                          Open payment link
                        </a>
                      ) : null}
                      {request.status === "OPEN" &&
                      (request.externalPaidPence ?? request.paidPence) <= 0 ? (
                        <button
                          type="button"
                          onClick={() => void cancelRequest(request)}
                          disabled={cancellingRequestId === request.id}
                          className="inline-flex text-xs font-semibold text-red-200 underline decoration-red-400/40 underline-offset-4 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cancellingRequestId === request.id
                            ? "Cancelling…"
                            : "Cancel request"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
