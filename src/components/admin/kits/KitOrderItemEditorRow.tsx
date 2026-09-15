import {
  TEAM_KIT_SIZE_OPTIONS,
  TEAM_KIT_SOCK_SIZE_OPTIONS,
  type TeamKitSize,
  type TeamKitSockSize,
} from "@/lib/kits/constants";
import { updateKitOrderItemAction } from "@/app/(admin)/admin/kits/item-actions";

type EditableKitItem = {
  id: string;
  position: number;
  backName: string | null;
  shirtNumber: number;
  kitSize: TeamKitSize;
  sockSize: TeamKitSockSize;
};

export default function KitOrderItemEditorRow({
  item,
  teamName,
}: {
  item: EditableKitItem;
  teamName: string;
}) {
  const formId = `kit-item-${item.id}`;

  const fieldClass =
    "h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white outline-none focus:border-emerald-400/40";

  return (
    <tr className="text-white/65">
      <td className="px-3 py-3 text-white/35">{item.position}</td>
      <td className="px-3 py-3">
        <input
          form={formId}
          name="backName"
          defaultValue={item.backName ?? ""}
          maxLength={30}
          placeholder="Number only"
          className={`${fieldClass} min-w-32 w-full font-semibold`}
        />
      </td>
      <td className="px-3 py-3">
        <input
          form={formId}
          name="shirtNumber"
          type="number"
          min={0}
          max={99}
          required
          defaultValue={item.shirtNumber}
          className={`${fieldClass} w-20`}
        />
      </td>
      <td className="px-3 py-3">
        <select
          form={formId}
          name="kitSize"
          defaultValue={item.kitSize}
          className={`${fieldClass} min-w-36`}
        >
          {TEAM_KIT_SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <select
          form={formId}
          name="sockSize"
          defaultValue={item.sockSize}
          className={`${fieldClass} min-w-48`}
        >
          {TEAM_KIT_SOCK_SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <form id={formId} action={updateKitOrderItemAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="teamName" value={teamName} />
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-400 px-3 text-xs font-semibold text-black transition hover:bg-emerald-300"
          >
            Save
          </button>
        </form>
      </td>
    </tr>
  );
}
