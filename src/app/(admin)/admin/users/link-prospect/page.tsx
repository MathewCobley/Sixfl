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

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function getFullName(input: { firstName: string; lastName: string | null; email: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.email || "Unnamed prospect";
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

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
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
      })
    : email
      ? await prisma.user.findUnique({
          where: { email },
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
        })
      : null;

  const userEmail = normalizeEmail(user?.email ?? email);

  const prospects = userEmail
    ? await prisma.teamPlayerProspect.findMany({
        where: {
          email: {
            equals: userEmail,
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
          updatedAt: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    : [];

  const linkedTeamIds = new Set(user?.teamMembers.map((membership) => membership.teamId) ?? []);
  const from = `/admin/users/link-prospect${userEmail ? `?email=${encodeURIComponent(userEmail)}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Manual account repair
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Link user to squad prospect
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-white/60">
          Use this when a player has a user account and a matching squad prospect, but the account is not linked to the team.
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

      {userEmail ? (
        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              User account
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
                const isLinked = linkedTeamIds.has(prospect.teamId);

                return (
                  <div key={prospect.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-white">{getFullName(prospect)}</h3>
                        <p className="mt-1 text-sm text-white/60">
                          {prospect.team.name} · {prospect.status}
                          {prospect.phone ? ` · ${prospect.phone}` : ""}
                        </p>
                      </div>

                      {user && !isLinked ? (
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
