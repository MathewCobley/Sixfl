export type TemporaryPlayerDecisionInput = {
  teamId: string;
  fixtureId: string;
  requestId: string;
  decision: "accept" | "decline";
  amount?: string;
};

export type TemporaryPlayerDecisionResult = {
  ok: true;
  decision: "accepted" | "declined";
  player?: { displayName?: string; amountPence?: number };
};

type CompletedDecision = TemporaryPlayerDecisionInput & {
  result: TemporaryPlayerDecisionResult;
};

const pending = new Set<string>();
const listeners = new Set<(decision: CompletedDecision) => void>();

// Both captain controls subscribe to confirmed decisions, not to DOM changes.
export function subscribeToTemporaryPlayerDecisions(
  listener: (decision: CompletedDecision) => void,
) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function decideTemporaryPlayerRequest(
  input: TemporaryPlayerDecisionInput,
): Promise<TemporaryPlayerDecisionResult> {
  const key = JSON.stringify([input.teamId, input.fixtureId, input.requestId]);
  if (pending.has(key)) {
    throw new Error("This request is already being updated. Please wait.");
  }
  pending.add(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(
      `/api/captain/team/${encodeURIComponent(input.teamId)}/temporary-player-requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          fixtureId: input.fixtureId,
          requestId: input.requestId,
          decision: input.decision,
          ...(input.decision === "accept" ? { amount: input.amount } : {}),
        }),
      },
    );
    if (response.redirected) {
      throw new Error("Your session may have expired. Sign in again before responding to this request.");
    }
    const payload = await response.json().catch(() => null) as
      | (Partial<TemporaryPlayerDecisionResult> & { error?: string })
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || "The player request could not be updated. Refresh before trying again.");
    }
    const expectedDecision = input.decision === "accept" ? "accepted" : "declined";
    if (payload?.ok !== true || payload.decision !== expectedDecision) {
      throw new Error("The response could not be confirmed. Refresh before trying again.");
    }
    const result = payload as TemporaryPlayerDecisionResult;
    for (const listener of listeners) {
      try { listener({ ...input, result }); }
      catch { /* A view refresh failure must not turn a saved decision into a retry. */ }
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The response could not be confirmed. Refresh before trying again; the decision may already have been saved.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    pending.delete(key);
  }
}
