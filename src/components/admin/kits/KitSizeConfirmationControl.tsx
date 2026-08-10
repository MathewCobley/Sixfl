import { Prisma } from "@prisma/client";

import { updateKitOrderSizesConfirmedAction } from "@/app/(admin)/admin/kits/actions";
import { prisma } from "@/lib/prisma";

export default async function KitSizeConfirmationControl({
  orderId,
  teamName,
}: {
  orderId: string;
  teamName: string;
}) {
  const rows = await prisma
    .$queryRaw<Array<{ sizesConfirmed: boolean }>>(Prisma.sql`
      SELECT "sizesConfirmed"
      FROM "TeamKitOrder"
      WHERE "id" = ${orderId}
      LIMIT 1
    `)
    .catch(() => [] as Array<{ sizesConfirmed: boolean }>);

  const sizesConfirmed = rows[0]?.sizesConfirmed ?? false;

  return (
    <form
      action={updateKitOrderSizesConfirmedAction}
      className="rounded-2xl border border-amber-300/20 bg-amber-500/[0.07] p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="teamName" value={teamName} />
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="sizesConfirmed"
          defaultChecked={sizesConfirmed}
          className="mt-1 h-5 w-5 shrink-0 rounded border-white/20 bg-black text-emerald-400"
        />
        <span>
          <span className="block text-sm font-semibold text-white">Sizes confirmed</span>
          <span className="mt-1 block text-xs leading-5 text-white/50">
            Tick this after the team has tried on a sample shirt and confirmed its sizes.
          </span>
        </span>
      </label>
      <button
        type="submit"
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/15"
      >
        Save size check
      </button>
    </form>
  );
}
