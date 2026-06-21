// ========================================
// File: src/app/(admin)/admin/users/link-prospect/page.tsx
// ========================================

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { linkAdminUserToSquadProspectAction } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Link User To Prospect | SIXFL",
};

type SearchParams = {
  email?: string;
  userId?: string;
  saved?: string;
  error?: string;
};

type UnnamedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  teamMembers: { teamId: string }[];
};

type ProspectMatch = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  teamId: string | null;
  team: {
    id: string;
    name: string;
  } | null;
};

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function getFullName(input: { firstName: string; lastName: string | null; email: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.email || "Unnamed prospect";
}

function getProspectTeamLabel(prospect: ProspectMatch) {
  return prospect.team?.name ?? "Unassigned prospect";
}

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

async function getUnnamedUnlinkedUsers() {
  const candidates = await prisma.user.findMany({
    where: {
      email: {
        not: null,
      },
    },
    orderBy: [{ email: "asc" }],
    take: 150,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      teamMembers: {
        select: {
          teamId: true,
        },
      },
    },
  });

  return candidates
    .filter((candidate) => !candidate.name?.trim() && candidate.teamMembers.length === 0)
    .slice(0, 50);
}

async function getUserForRepair(input: { userId: string; email: string | null }) {
  if (input.userId) {
    return prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        email: true,
        teamMembers: {
          select: {
            teamId: true,
            role: true,
            team: { select: { name: true } },
          },
        },
      },
    });
  }

  if (!input.email) return null;

  return prisma.user.findFirst({
    where: {
      email: {
        equals: input.email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      teamMembers: {
        select: {
          teamId: true,
          role: true,
          team: { select: { name: true } },
        },
      },
    },
  });
}

async function getProspectsForEmails(emails: string[]) {
  if (!emails.length) return [] as ProspectMatch[];

  return prisma.teamPlayerProspect.findMany({
    where: {
      email: {
        in: emails,
        mode: "insensitive",
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export default async function AdminUserProspectLinkPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const email = normalizeEmail(sp.email);
  const userId = sp.userId?.trim() || "";

  const unnamedUsers = await getUnnamedUnlinkedUsers();
  const unnamedEmails = unnamedUsers
    .map((candidate) => normalizeEmail(candidate.email))
    .filter((candidateEmail): candidateEmail is string => Boolean(candidateEmail));

  const unnamedProspectMatches = await getProspectsForEmails(unnamedEmails);
  const unnamedProspectsByEmail = new Map<string, ProspectMatch[]>();

  for (const prospect of unnamedProspectMatches) {
    const prospectEmail = normalizeEmail(prospect.email);
    if (!prospectEmail) continue;
    unnamedProspectsByEmail.set(prospectEmail, [
      ...(unnamedProspectsByEmail.get(prospectEmail) ?? []),
      prospect,
    ]);
  }

  const user = await getUserForRepair({ userId, email });
  const userEmail = normalizeEmail(user?.email ?? email);
  const prospects = await getProspectsForEmails(userEmail ? [userEmail] : []);

  const linkedTeamIds = new Set(user?.teamMembers.map((membership) => membership.teamId) ?? []);
  const from = `/admin/users/link-prospect${userEmail ? `?email=${encodeURIComponent(userEmail)}` : ""}${
    user?.id ? `&userId=${encodeURIComponent(user.id)}` : ""
  }`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Manual account repair
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Link user to squad prospect
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-white/60">
          Pick an unnamed user or search by email. Use this when a player has a user account and a matching squad prospect, but the account is not linked to the team.
        </p>

        <form action="/admin/users/link-prospect" className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            name="email"
            defaultValue={userEmail ?? ""}
            placeholder="Player email address"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Find matches
          </button>
          <Link
            href="/admin/users"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            Back to users
          </Link>
        </form>
      </section>

      {sp.saved ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {decodeURIComponent(sp.saved)}
        </div>
      ) : null}

      {sp.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Unnamed unlinked users
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Pick a user to repair</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55">
            {unnamedUsers.length} shown
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {unnamedUsers.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
              No unnamed unlinked users found.
            </div>
          ) : null}

          {unnamedUsers.map((candidate: UnnamedUser) => {
            const candidateEmail = normalizeEmail(candidate.email);
            const matches = candidateEmail ? unnamedProspectsByEmail.get(candidateEmail) ?? [] : [];
            const href = candidateEmail
              ? `/admin/users/link-prospect?email=${encodeURIComponent(candidateEmail)}&userId=${encodeURIComponent(candidate.id)}`
              : `/admin/users/link-prospect?userId=${encodeURIComponent(candidate.id)}`;

            return (
              <Link
                key={candidate.id}
                href={href}
                className={`block rounded-2xl border p-4 transition hover:bg-white/[0.06] ${
                  user?.id === candidate.id
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : matches.length
                      ? "border-amber-400/20 bg-amber-500/10"
                      : "border-white/10 bg-black/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                    {getInitials(candidate.name, candidate.email)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{candidate.name || "Unnamed user"}</div>
                    <div className="mt-1 truncate text-sm text-white/60">{candidate.email}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/65">
                        {candidate.role}
                      </span>
                      {matches.length > 0 ? (
                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">
                          {matches.length} matching prospect{matches.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/50">
                          No matching prospect
                        </span>
                      )}
                    </div>
                    {matches.length > 0 ? (
                      <div className="mt-2 text-xs text-white/55">
                        {matches.map((match) => `${getFullName(match)} · ${getProspectTeamLabel(match)}`).join(" | ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {userEmail ? (
        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Selected user account
            </p>
            {user ? (
              <>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  {user.name || "Unnamed user"}
                </h2>
                <p className="mt-2 text-sm text-white/60">{user.email}</p>
                <div className="mt-4 space-y-2">
                  {user.teamMembers.length ? (
                    user.teamMembers.map((membership) => (
                      <div
                        key={membership.teamId}
                        className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
                      >
                        Linked to {membership.team.name} · {membership.role}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      User exists but has no linked teams.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                No user account exists for {userEmail}.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Matching prospects
            </p>
            <div className="mt-4 space-y-3">
              {prospects.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/55">
                  No matching prospects found for this email.
                </div>
              ) : null}

              {prospects.map((prospect) => {
                const isLinked = prospect.teamId ? linkedTeamIds.has(prospect.teamId) : false;

                return (
                  <div key={prospect.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-white">{getFullName(prospect)}</h3>
                        <p className="mt-1 text-sm text-white/60">
                          {getProspectTeamLabel(prospect)} · {prospect.status}
                          {prospect.phone ? ` · ${prospect.phone}` : ""}
                        </p>
                      </div>

                      {user && prospect.teamId && !isLinked ? (
                        <form action={linkAdminUserToSquadProspectAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="prospectId" value={prospect.id} />
                          <input type="hidden" name="from" value={from} />
                          <button
                            type="submit"
                            className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Link existing user
                          </button>
                        </form>
                      ) : !prospect.teamId ? (
                        <span className="inline-flex rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100">
                          Assign to team first
                        </span>
                      ) : isLinked ? (
                        <span className="inline-flex rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100">
                          Already linked
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
