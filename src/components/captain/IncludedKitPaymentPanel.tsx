"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  includedKitQuantity?: number;
  paidExtraKitQuantity?: number;
  pendingExtraKitQuantity?: number;
  totalKitQuantity?: number;
  extraKitPricePence?: number;
  team?: { id: string; name: string };
  members?: TeamMember[];
  requests?: ExtraKitRequest[];
  emailsQueued?: number;
  emailsFailed?: number;
  error?: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default function IncludedKitPaymentPanel({
  teamId,
  includedKitQuantity,
}: {
  teamId: string;
  includedKitQuantity: number;
}) {
  const router = useRouter();
  const [data, setData] = useState<ExtraKitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(refreshKitForm = false) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | ExtraKitResponse
        | null;

      if (!response.ok || !payload) {
        throw new Error(
          payload?.error || "The kit payment details could not be loaded.",
        );
      }

      if (payload.eligible === false) {
        throw new Error("This team does not have an included-kit allocation.");
      }

      setData(payload);
      if (refreshKitForm) router.refresh();
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
    setData(null);
    setSelectedMemberIds([]);
    setMessage(null);
    setError(null);
    setQuantity(1);
    void load();
  }, [teamId]);

  const members = data?.members ?? [];
  const requests = data?.requests ?? [];
  const extraKitPricePence = data?.extraKitPricePence ?? 2000;
  const displayedIncludedQuantity =
    data?.includedKitQuantity ?? includedKitQuantity;
  const paidExtraKitQuantity = data?.paidExtraKitQuantity ?? 0;
  const pendingExtraKitQuantity = data?.pendingExtraKitQuantity ?? 0;
  const currentTotalKitQuantity =
    data?.totalKitQuantity ??
    displayedIncludedQuantity + paidExtraKitQuantity;
  const selectedMembers = useMemo(
    () => members.filter((member) => selectedMemberIds.includes(member.id)),
    [members, selectedMemberIds],
  );
  const newPaymentPence = quantity * extraKitPricePence;
  const totalAfterPayment = currentTotalKitQuantity + quantity;
  const estimatedSharePence = selectedMembers.length
    ? Math.floor(newPaymentPence / selectedMembers.length)
    : newPaymentPence;

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  async function createRequests(event: React.FormEvent<HTMLFormElement>) {
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
          body: JSON.stringify({ quantity, memberIds: selectedMemberIds }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | ExtraKitResponse
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "The payment links could not be created.");
      }

      const createdQuantity = quantity;
      setQuantity(1);
      setSelectedMemberIds([]);
      setData((current) => ({
        ...(current ?? {}),
        ...payload,
        members: payload.members ?? current?.members,
        requests: payload.requests ?? current?.requests,
      }));
      setMessage(
        payload.emailsFailed
          ? `Payment request for ${createdQuantity} new kit${createdQuantity === 1 ? "" : "s"} created. ${payload.emailsQueued ?? 0} email${payload.emailsQueued === 1 ? "" : "s"} queued; ${payload.emailsFailed} could not be emailed, so use the payment links shown below.`
          : `Payment request for ${createdQuantity} new kit${createdQuantity === 1 ? "" : "s"} created and emailed successfully.`,
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The payment links could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest(request: ExtraKitRequest) {
    const confirmed = window.confirm(
      `Cancel the unpaid ${formatMoney(request.amountPence)} kit payment request for ${request.payerName}?`,
    );
    if (!confirmed) return;

    setCancellingId(request.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/extra-kit-payments/${encodeURIComponent(request.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The payment request could not be cancelled.");
      }

      setMessage(
        `${request.payerName}'s unpaid kit payment request has been cancelled. You can now create the correct new request.`,
      );
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The payment request could not be cancelled.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="w-full space-y-4">
      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/75">
          Free team kit offer
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          {displayedIncludedQuantity} complete kits are included free of charge
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          The included kits cover the shirt, shorts, socks and personalisation.
          There is no printing charge. Additional complete kits cost £20 each.
        </p>
      </section>

      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/75">
              Additional kits
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Add more complete kits for £20 each
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Choose only the new kits you are adding now. Kits already paid for
              are shown separately and are not charged again. Select one person to
              pay the full new amount, or several people to split it.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                  Included
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {displayedIncludedQuantity}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/60">
                  Extra kits paid
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {paidExtraKitQuantity}
                </div>
              </div>
              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-100/60">
                  Current order total
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {currentTotalKitQuantity}
                </div>
              </div>
            </div>

            {pendingExtraKitQuantity > 0 ? (
              <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                {pendingExtraKitQuantity} additional kit
                {pendingExtraKitQuantity === 1 ? " is" : "s are"} waiting for
                payment. New personalisation boxes unlock only when that batch is
                fully paid.
              </div>
            ) : null}

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
              <form onSubmit={createRequests} className="mt-5 space-y-5">
                <label className="block max-w-lg space-y-2">
                  <span className="text-sm font-semibold text-white">
                    New kits to add now
                  </span>
                  <select
                    value={quantity}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-sky-400/40"
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map(
                      (option) => (
                        <option key={option} value={option}>
                          Add {option} more kit{option === 1 ? "" : "s"} now —{" "}
                          {formatMoney(option * extraKitPricePence)}
                        </option>
                      ),
                    )}
                  </select>
                  <span className="block rounded-xl border border-sky-400/15 bg-sky-500/[0.06] px-3 py-2 text-sm leading-6 text-sky-50/80">
                    Current order: {currentTotalKitQuantity} kits. Adding {quantity}{" "}
                    new kit{quantity === 1 ? "" : "s"} will make {totalAfterPayment}{" "}
                    kits in total. New payment required: {formatMoney(newPaymentPence)}
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
                    {members.map((member) => {
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
                                "No email saved — add one before selecting this player"}
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
                  {submitting
                    ? "Creating payment links…"
                    : `Create payment link${selectedMemberIds.length === 1 ? "" : "s"} for ${quantity} new kit${quantity === 1 ? "" : "s"}`}
                </button>
              </form>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-white">Payment requests</div>
              <button
                type="button"
                onClick={() => void load(true)}
                className="text-xs font-semibold text-sky-200 hover:text-sky-100"
              >
                Refresh payments and kit boxes
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">
                  No additional-kit payment requests yet.
                </div>
              ) : (
                requests.map((request) => (
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
                    <div className="mt-3 flex flex-wrap gap-3">
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
                      {request.status === "OPEN" && request.paidPence <= 0 ? (
                        <button
                          type="button"
                          disabled={cancellingId === request.id}
                          onClick={() => void cancelRequest(request)}
                          className="text-xs font-semibold text-red-200 underline decoration-red-400/40 underline-offset-4 disabled:opacity-50"
                        >
                          {cancellingId === request.id
                            ? "Cancelling…"
                            : "Cancel incorrect request"}
                        </button>
                      ) : null}
                    </div>
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
