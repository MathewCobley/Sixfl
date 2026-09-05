export class GuestApprovalError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "GuestApprovalError";
  }
}

export type GuestApprovalAccess = {
  session: unknown;
  user: { id: string; role: string } | null;
  isAdmin: boolean;
  isCaptain: boolean;
  accessMode: string;
};

export function canManageGuestApprovals(access: GuestApprovalAccess) {
  return Boolean(access.session && access.user?.id && access.user.role === "ADMIN" &&
    access.isAdmin && access.accessMode === "captain");
}

export function assertGuestApprovalAccess(access: GuestApprovalAccess, write = false) {
  if (!access.session || !access.user?.id || (!access.isAdmin && !access.isCaptain)) {
    throw new GuestApprovalError("Sign in with access to this team.", 403);
  }
  if (write && !canManageGuestApprovals(access)) {
    throw new GuestApprovalError("Only SIXFL administrators in full admin view can approve or revoke guests.", 403);
  }
}

export type GuestDecisionInput = {
  fixtureId: string;
  playerUserId: string;
  decision: "approve" | "revoke";
  reason: string;
  expectedRevision: number | null;
  expectedKickoffAt: string;
};

export function parseGuestDecision(value: unknown): GuestDecisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GuestApprovalError("Choose a player and fixture first.");
  }
  const data = value as Record<string, unknown>;
  const id = (key: string) => {
    const v = data[key];
    if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(v)) {
      throw new GuestApprovalError("Choose a valid player and fixture first.");
    }
    return v;
  };
  if (data.decision !== "approve" && data.decision !== "revoke") {
    throw new GuestApprovalError("Choose approve or revoke.");
  }
  if (typeof data.reason !== "string" || data.reason.length > 500) {
    throw new GuestApprovalError("Keep the approval note or reason within 500 characters.");
  }
  const reason = data.reason.trim();
  if (data.decision === "revoke" && reason.length < 3) {
    throw new GuestApprovalError("Give a short reason for revoking this approval.");
  }
  if (data.expectedRevision !== null &&
      (typeof data.expectedRevision !== "number" || !Number.isInteger(data.expectedRevision) || data.expectedRevision < 1)) {
    throw new GuestApprovalError("Reload the guest approvals before making a change.", 409);
  }
  if (typeof data.expectedKickoffAt !== "string" || !Number.isFinite(Date.parse(data.expectedKickoffAt))) {
    throw new GuestApprovalError("Reload the fixture before making a change.", 409);
  }
  return {
    fixtureId: id("fixtureId"), playerUserId: id("playerUserId"),
    decision: data.decision, reason,
    expectedRevision: data.expectedRevision as number | null,
    expectedKickoffAt: data.expectedKickoffAt,
  };
}

export function assertGuestApprovalOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = [new URL(request.url).origin];
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (value) { try { allowed.push(new URL(value).origin); } catch { /* Ignore invalid deployment settings. */ } }
  }
  if (!origin || !allowed.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new GuestApprovalError("Open this page on the SIXFL website before saving.", 403);
  }
}

export async function readGuestDecision(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new GuestApprovalError("Send a JSON approval request.", 415);
  }
  const limit = 8192;
  if (Number(request.headers.get("content-length")) > limit) {
    throw new GuestApprovalError("The approval request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new GuestApprovalError("The approval request is empty.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new GuestApprovalError("The approval request is too large.", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new GuestApprovalError("The approval request could not be read."); }
  return parseGuestDecision(value);
}
