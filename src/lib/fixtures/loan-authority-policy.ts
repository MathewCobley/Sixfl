export class LoanAuthorityError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export function loanAuthorityLabel(count: number) {
  return count > 0 ? `Loan authority requested: ${count}` : "";
}

export function parseLoanAuthority(value: unknown) {
  if (!value || typeof value !== "object") throw new LoanAuthorityError("Choose a fixture and team.");
  const data = value as Record<string, unknown>;
  for (const key of ["fixtureId", "teamId"]) {
    if (typeof data[key] !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(data[key] as string)) {
      throw new LoanAuthorityError("Choose a valid fixture and team.");
    }
  }
  if (typeof data.count !== "number" || !Number.isInteger(data.count) || data.count < 0 || data.count > 9) {
    throw new LoanAuthorityError("Enter between 1 and 9 loan players, or clear the request.");
  }
  if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 0) {
    throw new LoanAuthorityError("Reload the request before saving.", 409);
  }
  return { fixtureId: data.fixtureId as string, teamId: data.teamId as string, count: data.count, revision: data.revision };
}
