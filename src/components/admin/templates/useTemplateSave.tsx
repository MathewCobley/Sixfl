"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { safeTemplateUrl, type TemplateSaveOptions, type TemplateSaveState } from "@/lib/templates/save-contract";
import { requestTemplateSave } from "@/lib/templates/save-request";

/** Local state is deliberately independent of React's Server Action/RSC transition. */
export function useTemplateSave(options: TemplateSaveOptions) {
  const [state, setState] = useState<TemplateSaveState>({});
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const submitted = useRef<FormData | null>(null);
  const navigationStarted = useRef(false);
  const savedUrl = state.ok ? safeTemplateUrl(state.redirectTo) : undefined;
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (state.message || state.error) feedbackRef.current?.focus();
    if (savedUrl && !navigationStarted.current) {
      navigationStarted.current = true;
      // Keep a visible Saved result and an ordinary link if navigation is blocked.
      try { window.location.replace(savedUrl); } catch { /* The saved link remains usable. */ }
    }
  }, [state, savedUrl]);

  async function run(data: FormData, operation: "save" | "check") {
    if (inFlight.current) return;
    inFlight.current = true;
    controller.current = new AbortController();
    setPending(true); setChecking(operation === "check");
    setState({});
    try {
      const result = await requestTemplateSave(data, options, operation, controller.current.signal);
      if (mounted.current) setState(result);
    } finally {
      inFlight.current = false;
      if (mounted.current) { setPending(false); setChecking(false); }
    }
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || state.needsCheck || savedUrl) return;
    // Capture fields before disabling anything. Keep the exact request for a read-only check.
    const data = new FormData(event.currentTarget);
    submitted.current = data;
    void run(data, "save");
  }
  function checkSave() {
    if (submitted.current) void run(submitted.current, "check");
  }
  return { state, pending, checking, savedUrl, onSubmit, checkSave, feedbackRef };
}
export function TemplateSaveControls({ save, mode }: {
  save: ReturnType<typeof useTemplateSave>;
  mode: "create" | "edit";
}) {
  const { state, pending, checking, savedUrl, checkSave, feedbackRef } = save;
  const existingUrl = safeTemplateUrl(state.existingUrl);
  return <div className="space-y-3">
    {(state.message || state.error) && <div ref={feedbackRef} tabIndex={-1}
      role={state.ok ? "status" : "alert"} aria-live="polite"
      className={`rounded-2xl border px-4 py-3 text-sm ${state.ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>
      <p>{state.error || state.message}</p>
      {savedUrl && <a className="mt-2 inline-block underline" href={savedUrl}>Open saved template</a>}
      {existingUrl && <a className="mt-2 inline-block underline" href={existingUrl}>Open existing template</a>}
      {state.signInRequired && <a className="mt-2 block underline" href="/login" target="_blank" rel="noopener noreferrer">Sign in in a new tab, then check save status here</a>}
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending || Boolean(savedUrl) || Boolean(state.needsCheck)} aria-busy={pending}
        className="inline-flex items-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60">
        {savedUrl ? "Template saved" : checking ? "Checking save..." : pending ? mode === "create" ? "Creating template..." : "Saving changes..." : mode === "create" ? "Create template" : "Save changes"}
      </button>
      {state.needsCheck && <button type="button" onClick={checkSave} disabled={pending}
        className="rounded-xl border border-emerald-400/30 px-4 py-3 text-sm text-emerald-200">Check save status</button>}
      {(state.needsCheck || existingUrl) && <a href="/admin/templates" target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 underline">View templates in a new tab</a>}
    </div>
  </div>;
}
