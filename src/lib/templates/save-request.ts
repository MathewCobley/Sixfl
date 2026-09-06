import type { TemplateSaveOptions, TemplateSaveState } from "./save-contract";

export const TEMPLATE_SAVE_TIMEOUT_MS = 20_000;

/** A timeout means unknown outcome, NOT a rollback. Never automatically retry a write. */
export async function requestTemplateSave(
  values: FormData,
  options: TemplateSaveOptions,
  operation: "save" | "check",
  signal?: AbortSignal,
): Promise<TemplateSaveState> {
  const body = new FormData();
  values.forEach((value, key) => body.append(key, value));
  for (const [key, value] of Object.entries({ ...options, operation })) body.set(key, value);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (signal?.aborted) throw new Error("Aborted");
    const request = async () => {
      const response = await fetch("/api/admin/templates/save", {
        method: "POST", body, credentials: "same-origin", cache: "no-store",
        headers: { "X-SIXFL-Template-Request": "1" }, signal: controller.signal,
      });
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Save returned no JSON confirmation");
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || typeof (payload as TemplateSaveState).ok !== "boolean") {
        throw new Error("Invalid save confirmation");
      }
      if (!response.ok && (payload as TemplateSaveState).ok) throw new Error("Invalid status");
      return payload as TemplateSaveState;
    };
    return await Promise.race([
      request(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Save timed out")); }, TEMPLATE_SAVE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return {
      ok: false, needsCheck: true,
      error: "The save could not be confirmed. Your text is still here. Use Check save status before trying again; the template may already have been saved.",
    };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
