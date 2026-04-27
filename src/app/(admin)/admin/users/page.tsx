// ========================================
// File: src/app/(admin)/admin/users/page.tsx
// ========================================

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateAdminUserProfileAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Admin Users | SIXFL",
};

type SearchParams = {
  q?: string;
  saved?: string;
  error?: string;
};

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function formatProvider(value: string) {
  if (value === "email") return "Magic email login";
  return value;
}

function OriginPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warning" | "info" }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-100"
        : tone === "info"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100"
          : "border-white/10 bg-white/[0.04] text-white/65";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const query = (sp.q ?? "").trim();
  const where = query
    ? {
        OR: [
          {
            name: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            email: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : undefined;

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdFromLeadId: true,
      accounts: {
        select: {
          id: true,
          provider: true,
          type: true,
          providerAccountId: true,
        },
      },
      teamMembers: {
        select: {
          id: true,
          role: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const userEmails = users
    .map((user) => normalizeEmail(user.email))
    .filter((email): email is string => Boolean(email));

  const createdLeadIds = users
    .map((user) => user.createdFromLeadId)
    .filter((id): id is string => Boolean(id));

  const [createdFromLeads, matchingLeads, matchingProspects, matchingRecipients, matchingThreads] = await Promise.all([
    createdLeadIds.length
      ? prisma.interestLead.findMany({
          where: {
            id: {
              in: createdLeadIds,
            },
          },
          select: {
            id: true,
            contactName: true,
            email: true,
            interestType: true,
            status: true,
            teamName: true,
            createdAt: true,
            convertedTeam: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [],
    userEmails.length
      ? prisma.interestLead.findMany({
          where: {
            email: {
              in: userEmails,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            contactName: true,
            email: true,
            interestType: true,
            status: true,
            teamName: true,
            createdAt: true,
            convertedTeam: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [],
    userEmails.length
      ? prisma.teamPlayerProspect.findMany({
          where: {
            email: {
              in: userEmails,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [],
    userEmails.length
      ? prisma.notificationRecipient.findMany({
          where: {
            OR: [
              {
                emailNormalized: {
                  in: userEmails,
                },
              },
              {
                email: {
                  in: userEmails,
                  mode: "insensitive",
                },
              },
            ],
          },
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            audience: true,
            displayName: true,
            email: true,
            emailNormalized: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [],
    userEmails.length
      ? prisma.messageThread.findMany({
          where: {
            OR: [
              {
                emailNormalized: {
                  in: userEmails,
                },
              },
              {
                contactEmail: {
                  in: userEmails,
                  mode: "insensitive",
                },
              },
            ],
          },
          select: {
            id: true,
            channel: true,
            status: true,
            contactName: true,
            contactEmail: true,
            emailNormalized: true,
            latestMessageAt: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [],
  ]);

  const createdLeadById = new Map(createdFromLeads.map((lead) => [lead.id, lead]));

  const leadsByEmail = new Map<string, typeof matchingLeads>();
  for (const lead of matchingLeads) {
    const email = normalizeEmail(lead.email);
    if (!email) continue;
    leadsByEmail.set(email, [...(leadsByEmail.get(email) ?? []), lead]);
  }

  const prospectsByEmail = new Map<string, typeof matchingProspects>();
  for (const prospect of matchingProspects) {
    const email = normalizeEmail(prospect.email);
    if (!email) continue;
    prospectsByEmail.set(email, [...(prospectsByEmail.get(email) ?? []), prospect]);
  }

  const recipientsByEmail = new Map<string, typeof matchingRecipients>();
  for (const recipient of matchingRecipients) {
    const email = normalizeEmail(recipient.emailNormalized ?? recipient.email);
    if (!email) continue;
    recipientsByEmail.set(email, [...(recipientsByEmail.get(email) ?? []), recipient]);
  }

  const threadsByEmail = new Map<string, typeof matchingThreads>();
  for (const thread of matchingThreads) {
    const email = normalizeEmail(thread.emailNormalized ?? thread.contactEmail);
    if (!email) continue;
    threadsByEmail.set(email, [...(threadsByEmail.get(email) ?? []), thread]);
  }

  const unnamedUsers = users.filter((user) => !user.name?.trim()).length;
  const linkedUsers = users.filter((user) => user.teamMembers.length > 0).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Identity management
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Users
          </h1>
          <p className="max-w-3xl text-sm text-white/60 sm:text-base">
            Search users, fix missing names, see linked teams, and investigate where each account came from.
          </p>
        </div>

        <form action="/admin/users" className="flex w-full max-w-xl gap-3">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by name or email"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
          />
          <button
            type="submit"
            className="inline-flex items-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Search
          </button>
        </form>
      </div>

      {sp.saved === "1" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          User name updated.
        </div>
      ) : null}

      {sp.error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Results</div>
          <div className="mt-3 text-3xl font-semibold text-white">{users.length}</div>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Unnamed</div>
          <div className="mt-3 text-3xl font-semibold text-white">{unnamedUsers}</div>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Linked to teams</div>
          <div className="mt-3 text-3xl font-semibold text-white">{linkedUsers}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              User records
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Search results</h2>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {users.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">No users found.</div>
          ) : (
            users.map((user) => {
              const normalizedEmail = normalizeEmail(user.email);
              const createdLead = user.createdFromLeadId ? createdLeadById.get(user.createdFromLeadId) ?? null : null;
              const emailLeads = normalizedEmail ? leadsByEmail.get(normalizedEmail) ?? [] : [];
              const emailProspects = normalizedEmail ? prospectsByEmail.get(normalizedEmail) ?? [] : [];
              const emailRecipients = normalizedEmail ? recipientsByEmail.get(normalizedEmail) ?? [] : [];
              const emailThreads = normalizedEmail ? threadsByEmail.get(normalizedEmail) ?? [] : [];

              const originStatus = user.teamMembers.length
                ? "Linked account"
                : emailProspects.length
                  ? "Matching prospect not linked"
                  : emailLeads.length || createdLead
                    ? "Lead-related account"
                    : user.accounts.length
                      ? "Login-only account"
                      : "Unknown origin";

              return (
                <div key={user.id} className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white/70">
                      {getInitials(user.name, user.email)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold text-white">
                          {user.name || "Unnamed user"}
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
                          {user.role}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-white/65">{user.email || "No email"}</div>

                      {user.teamMembers.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {user.teamMembers.map((membership) => (
                            <Link
                              key={membership.id}
                              href={`/admin/teams/${membership.team.id}`}
                              className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                            >
                              {membership.team.name} · {membership.role}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-white/45">No linked teams.</div>
                      )}

                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                            Origin trail
                          </div>
                          <OriginPill tone={originStatus === "Unknown origin" ? "warning" : "info"}>{originStatus}</OriginPill>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {user.accounts.length > 0 ? (
                            user.accounts.map((account) => (
                              <OriginPill key={account.id}>
                                {formatProvider(account.provider)} · {account.type}
                              </OriginPill>
                            ))
                          ) : (
                            <OriginPill tone="warning">No auth provider record</OriginPill>
                          )}

                          {createdLead ? (
                            <OriginPill tone="good">
                              Created from lead: {createdLead.contactName} · {createdLead.interestType}
                            </OriginPill>
                          ) : user.createdFromLeadId ? (
                            <OriginPill tone="warning">Created lead id missing: {user.createdFromLeadId}</OriginPill>
                          ) : null}

                          {emailLeads.length > 0 ? (
                            <OriginPill tone="info">{emailLeads.length} matching lead{emailLeads.length === 1 ? "" : "s"}</OriginPill>
                          ) : null}

                          {emailProspects.length > 0 ? (
                            <OriginPill tone={user.teamMembers.length ? "good" : "warning"}>
                              {emailProspects.length} matching squad prospect{emailProspects.length === 1 ? "" : "s"}
                            </OriginPill>
                          ) : null}

                          {emailRecipients.length > 0 ? (
                            <OriginPill tone="info">{emailRecipients.length} notification recipient record{emailRecipients.length === 1 ? "" : "s"}</OriginPill>
                          ) : null}

                          {emailThreads.length > 0 ? (
                            <OriginPill tone="info">{emailThreads.length} message thread{emailThreads.length === 1 ? "" : "s"}</OriginPill>
                          ) : null}
                        </div>

                        {emailProspects.length > 0 ? (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Matching prospects</div>
                            {emailProspects.map((prospect) => (
                              <Link
                                key={prospect.id}
                                href={`/admin/teams/${prospect.team.id}/prospects`}
                                className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65 transition hover:bg-white/[0.06]"
                              >
                                {[prospect.firstName, prospect.lastName].filter(Boolean).join(" ")} · {prospect.team.name} · {prospect.status}
                                {prospect.phone ? ` · ${prospect.phone}` : ""}
                              </Link>
                            ))}
                          </div>
                        ) : null}

                        {emailLeads.length > 0 ? (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Matching leads</div>
                            {emailLeads.map((lead) => (
                              <Link
                                key={lead.id}
                                href={`/admin/leads/${lead.id}`}
                                className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65 transition hover:bg-white/[0.06]"
                              >
                                {lead.contactName} · {lead.interestType} · {lead.status}
                                {lead.teamName ? ` · ${lead.teamName}` : ""}
                                {lead.convertedTeam ? ` · converted to ${lead.convertedTeam.name}` : ""}
                              </Link>
                            ))}
                          </div>
                        ) : null}

                        {emailThreads.length > 0 ? (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Matching message threads</div>
                            {emailThreads.map((thread) => (
                              <Link
                                key={thread.id}
                                href={`/admin/messaging?thread=${thread.id}&filter=all`}
                                className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65 transition hover:bg-white/[0.06]"
                              >
                                {thread.channel} · {thread.status}
                                {thread.team ? ` · ${thread.team.name}` : ""}
                                {thread.latestMessageAt ? ` · latest ${thread.latestMessageAt.toLocaleDateString("en-GB")}` : ""}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <form action={updateAdminUserProfileAction} className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="from" value={`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`} />

                    <div className="space-y-2">
                      <label className="text-sm text-white/60">Display name</label>
                      <input
                        name="name"
                        type="text"
                        defaultValue={user.name ?? ""}
                        placeholder="Enter full name"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-white/60">Email</label>
                      <input
                        value={user.email ?? ""}
                        disabled
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white/50 outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Save name
                    </button>
                  </form>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
