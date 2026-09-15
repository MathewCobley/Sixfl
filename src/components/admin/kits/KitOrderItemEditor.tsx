"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import FormListboxField from "@/components/ui/FormListboxField";
import { TEAM_KIT_SIZE_OPTIONS, type TeamKitOrderStatus, type TeamKitSize } from "@/lib/kits/constants";
import { updateKitOrderItemAction } from "@/app/(admin)/admin/kits/item-actions";

type Item = {
  id: string;
  position: number;
  backName: string | null;
  shirtNumber: number;
  kitSize: TeamKitSize;
};

const sizeOptions = TEAM_KIT_SIZE_OPTIONS.map((option) => ({ ...option }));

export default function KitOrderItemEditor({ item, orderId, orderStatus, teamName }: {
  item: Item;
  orderId: string;
  orderStatus: TeamKitOrderStatus;
  teamName: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [previous, setPrevious] = useState({ ...item, status: orderStatus });
  const [backName, setBackName] = useState(item.backName ?? "");
  const [shirtNumber, setShirtNumber] = useState(String(item.shirtNumber));
  const [kitSize, setKitSize] = useState<string>(item.kitSize);
  const [supplierConfirmed, setSupplierConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const titleId = `kit-edit-title-${item.id}`;
  const nameId = `kit-edit-name-${item.id}`;
  const numberId = `kit-edit-number-${item.id}`;
  const supplierCheckNeeded = ["ORDERED", "FULFILLED"].includes(previous.status);
  const inputClass = "h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/50";

  function openEditor() {
    setPrevious({ ...item, status: orderStatus });
    setBackName(item.backName ?? "");
    setShirtNumber(String(item.shirtNumber));
    setKitSize(item.kitSize);
    setSupplierConfirmed(false);
    setError("");
    setNotice("");
    dialogRef.current?.showModal();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError("");
    const data = new FormData();
    data.set("itemId", item.id);
    data.set("orderId", orderId);
    data.set("backName", backName);
    data.set("shirtNumber", shirtNumber);
    data.set("kitSize", kitSize);
    data.set("previousBackName", previous.backName ?? "");
    data.set("previousShirtNumber", String(previous.shirtNumber));
    data.set("previousKitSize", previous.kitSize);
    data.set("previousStatus", previous.status);
    data.set("supplierConfirmed", supplierConfirmed ? "yes" : "no");
    try {
      const result = await updateKitOrderItemAction(data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("The save could not be confirmed. Your entries are still here. Check your connection and refresh the order before retrying.");
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        disabled={orderStatus === "CANCELLED"}
        title={orderStatus === "CANCELLED" ? "Reopen this cancelled order first" : undefined}
        aria-label={`Edit kit ${item.position} for ${teamName}`}
        className="inline-flex min-h-10 items-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Edit
      </button>
      {notice ? <p role="status" className="mt-1 text-xs text-emerald-200">{notice}</p> : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => { if (saving.current) event.preventDefault(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-6 text-white shadow-2xl backdrop:bg-black/70"
      >
        <form onSubmit={save} className="space-y-5">
          <div>
            <h2 id={titleId} className="text-xl font-semibold">Edit kit {item.position}</h2>
            <p className="mt-1 text-sm text-white/60">{teamName}</p>
            <p className="mt-2 text-sm text-white/60">Only this row’s back name, number and kit size will change. The order status and payments stay unchanged.</p>
          </div>
          <label htmlFor={nameId} className="block space-y-2 text-sm">
            <span>Back name</span>
            <input id={nameId} name="backName" value={backName} onChange={(event) => setBackName(event.target.value)} maxLength={18} autoFocus disabled={pending} placeholder="Number only" className={inputClass} />
            <span className="block text-xs text-white/45">Leave blank for number only. Printed in capitals, up to 18 characters.</span>
          </label>
          <label htmlFor={numberId} className="block space-y-2 text-sm">
            <span>Shirt number</span>
            <input id={numberId} name="shirtNumber" type="number" min={1} max={99} step={1} required value={shirtNumber} onChange={(event) => setShirtNumber(event.target.value)} disabled={pending} className={inputClass} />
          </label>
          <FormListboxField name="kitSize" label="Kit size" value={kitSize} options={sizeOptions} onValueChange={setKitSize} disabled={pending} />
          {supplierCheckNeeded ? (
            <label className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
              <input type="checkbox" checked={supplierConfirmed} onChange={(event) => setSupplierConfirmed(event.target.checked)} required disabled={pending} className="mt-1" />
              <span>I have checked this change with the supplier. This order has already been ordered or completed; saving here does not amend an order sent to the supplier.</span>
            </label>
          ) : null}
          {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => dialogRef.current?.close()} disabled={pending} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black disabled:opacity-40">{pending ? "Saving…" : "Save kit details"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
