"use client";

import { useActionState } from "react";
import AdminSelect from "@/components/admin/AdminSelect";
import type { CupAction, CupActionState } from "@/components/cups/types";

type Props = {
  cupId: string;
  teamId: string;
  invitationId: string;
  responseVersion: number;
  settingsVersion: number;
  response: "PENDING" | "YES" | "NO";
  action: CupAction;
};

const initialState: CupActionState = {};

export default function CupResponseEditor({ cupId, teamId, invitationId, responseVersion, settingsVersion, response, action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} aria-busy={pending} className="mt-3 max-w-sm space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <input type="hidden" name="cupId" value={cupId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="responseVersion" value={responseVersion} />
      <input type="hidden" name="settingsVersion" value={settingsVersion} />
      <AdminSelect
        key={`${invitationId}-${responseVersion}-${settingsVersion}`}
        name="response"
        label="Edit response"
        defaultValue={response}
        disabled={pending}
        options={[
          { value: "PENDING", label: "Awaiting response" },
          { value: "YES", label: "Yes — interested" },
          { value: "NO", label: "No — not this time" },
        ]}
      />
      <p className="text-xs leading-5 text-white/55">Updates the response only. No email is sent and this does not confirm or withdraw an entry.</p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save response"}
      </button>
      {state.error ? <p role="alert" className="text-xs leading-5 text-amber-200">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-xs leading-5 text-emerald-200">{state.success}</p> : null}
    </form>
  );
}
