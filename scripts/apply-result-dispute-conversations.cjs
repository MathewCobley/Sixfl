const fs = require("fs");

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[result-dispute-conversations] ${path}: already patched`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[result-dispute-conversations] ${path}: patched`);
}

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`[result-dispute-conversations] Missing anchor: ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

patch("prisma/schema.prisma", (source) => {
  source = replaceOnce(
    source,
    '  createdByUser User?       @relation("ResultDisputeCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)\n\n  createdAt DateTime @default(now())',
    '  createdByUser User?       @relation("ResultDisputeCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)\n  messages      ResultDisputeMessage[]\n\n  createdAt DateTime @default(now())',
    "ResultDispute messages relation",
  );

  source = replaceOnce(
    source,
    '  @@index([createdByUserId])\n}\n\nenum PaymentChargeStatus {',
    `  @@index([createdByUserId])\n}\n\nmodel ResultDisputeMessage {\n  id String @id @default(cuid())\n\n  disputeId String\n  authorType String\n  authorName String?\n  authorUserId String?\n  body String\n\n  dispute ResultDispute @relation(fields: [disputeId], references: [id], onDelete: Cascade)\n\n  createdAt DateTime @default(now())\n\n  @@index([disputeId, createdAt])\n}\n\nenum PaymentChargeStatus {`,
    "ResultDisputeMessage model",
  );
  return source;
});

patch("src/app/(admin)/admin/results/page.tsx", (source) => {
  source = replaceOnce(
    source,
    'export default async function AdminResultsPage({',
    `async function addAdminDisputeMessageAction(formData: FormData) {\n  "use server";\n\n  const access = await requireAdmin();\n  const disputeId = String(formData.get("disputeId") ?? "").trim();\n  const body = String(formData.get("body") ?? "").trim();\n\n  if (!disputeId || !body) redirect("/admin/results?error=missing_message");\n  if (body.length > 2000) redirect("/admin/results?error=message_too_long");\n\n  const dispute = await prisma.resultDispute.findUnique({\n    where: { id: disputeId },\n    select: { status: true },\n  });\n  if (!dispute) redirect("/admin/results?error=missing_id");\n  if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {\n    redirect("/admin/results?error=closed_dispute");\n  }\n\n  await prisma.resultDisputeMessage.create({\n    data: {\n      disputeId,\n      authorType: "ADMIN",\n      authorName: access.user?.name || access.user?.email || "SIXFL",\n      authorUserId: access.user?.id ?? null,\n      body,\n    },\n  });\n\n  revalidatePath("/admin/results");\n  redirect("/admin/results?updated=1");\n}\n\nexport default async function AdminResultsPage({`,
    "admin reply action",
  );

  source = replaceOnce(
    source,
    '      createdByUser: {\n        select: {\n          id: true,\n          name: true,\n          email: true,\n        },\n      },\n    },',
    '      createdByUser: {\n        select: {\n          id: true,\n          name: true,\n          email: true,\n        },\n      },\n      messages: { orderBy: { createdAt: "asc" } },\n    },',
    "admin messages include",
  );

  source = replaceOnce(
    source,
    `                  {dispute.adminNote ? (\n                    <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">\n                      <span className="font-medium text-white">Admin note:</span>{" "}\n                      {dispute.adminNote}\n                    </div>\n                  ) : null}\n                </div>`,
    `                  <div className="mt-5 border-t border-white/10 pt-4">\n                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Conversation</h4>\n                    <div className="mt-3 space-y-3">\n                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-50">\n                        <div className="text-xs font-semibold text-amber-200">{dispute.team.name} · original dispute</div>\n                        <div className="mt-1">{dispute.description}</div>\n                      </div>\n                      {dispute.adminNote ? (\n                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">\n                          <div className="text-xs font-semibold text-emerald-200">SIXFL · earlier admin note</div>\n                          <div className="mt-1">{dispute.adminNote}</div>\n                        </div>\n                      ) : null}\n                      {dispute.messages.map((message) => (\n                        <div key={message.id} className={message.authorType === "ADMIN" ? "rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100" : "rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-sm text-sky-100"}>\n                          <div className="text-xs font-semibold">{message.authorType === "ADMIN" ? "SIXFL" : dispute.team.name} · {formatUkDateTime(message.createdAt)}</div>\n                          <div className="mt-1 whitespace-pre-wrap">{message.body}</div>\n                        </div>\n                      ))}\n                    </div>\n                    {dispute.status === "OPEN" || dispute.status === "REVIEW" ? (\n                      <form action={addAdminDisputeMessageAction} className="mt-4">\n                        <input type="hidden" name="disputeId" value={dispute.id} />\n                        <textarea name="body" rows={3} required maxLength={2000} placeholder="Reply to the team…" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40" />\n                        <button type="submit" className="mt-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200">Send reply</button>\n                      </form>\n                    ) : (\n                      <p className="mt-4 text-xs text-white/45">This dispute is closed, so the conversation is read-only.</p>\n                    )}\n                  </div>\n                </div>`,
    "admin conversation UI",
  );

  source = source.replace(
    'placeholder="Add an admin note for the captain or internal review."',
    'placeholder="Optional summary note (visible to the captain)."',
  );
  return source;
});

patch("src/app/captain/team/[teamid]/results/page.tsx", (source) => {
  source = replaceOnce(
    source,
    'export default async function CaptainResultsPage({',
    `async function addCaptainDisputeMessageAction(formData: FormData) {\n  "use server";\n\n  const teamid = String(formData.get("teamid") ?? "").trim();\n  const disputeId = String(formData.get("disputeId") ?? "").trim();\n  const body = String(formData.get("body") ?? "").trim();\n  const access = await requireCaptain(teamid);\n\n  try {\n    if (!disputeId || !body) throw new Error("Please enter a reply.");\n    if (body.length > 2000) throw new Error("Reply must be 2000 characters or fewer.");\n\n    const dispute = await prisma.resultDispute.findFirst({\n      where: { id: disputeId, teamId: teamid },\n      select: { status: true },\n    });\n    if (!dispute) throw new Error("Dispute not found.");\n    if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {\n      throw new Error("This dispute is closed and can no longer be replied to.");\n    }\n\n    await prisma.resultDisputeMessage.create({\n      data: {\n        disputeId,\n        authorType: "TEAM",\n        authorName: access.user?.name || access.user?.email || "Team captain",\n        authorUserId: access.user?.id ?? null,\n        body,\n      },\n    });\n\n    revalidatePath(\`/captain/team/\${teamid}/results\`);\n    revalidatePath("/admin/results");\n  } catch (error) {\n    redirect(\`/captain/team/\${teamid}/results?error=\${encodeURIComponent(getFriendlyErrorMessage(error))}\`);\n  }\n\n  redirect(\`/captain/team/\${teamid}/results?saved=dispute-reply\`);\n}\n\nexport default async function CaptainResultsPage({`,
    "captain reply action",
  );

  source = replaceOnce(
    source,
    '          disputes: {\n            where: { teamId: teamid },\n            orderBy: { createdAt: "desc" },\n          },',
    '          disputes: {\n            where: { teamId: teamid },\n            orderBy: { createdAt: "desc" },\n            include: { messages: { orderBy: { createdAt: "asc" } } },\n          },',
    "captain messages include",
  );

  source = replaceOnce(
    source,
    `                        {row.latestDispute.adminNote ? (\n                          <p><span className="text-white/45">Admin note:</span> {row.latestDispute.adminNote}</p>\n                        ) : null}\n                      </div>`,
    `                        <div className="mt-4 border-t border-white/10 pt-3">\n                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Conversation</p>\n                          <div className="mt-3 space-y-3">\n                            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">\n                              <div className="text-xs font-semibold text-amber-200">Your team · original dispute</div>\n                              <div className="mt-1 text-amber-50">{row.latestDispute.description}</div>\n                            </div>\n                            {row.latestDispute.adminNote ? (\n                              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">\n                                <div className="text-xs font-semibold text-emerald-200">SIXFL · earlier admin note</div>\n                                <div className="mt-1 text-emerald-50">{row.latestDispute.adminNote}</div>\n                              </div>\n                            ) : null}\n                            {row.latestDispute.messages.map((message) => (\n                              <div key={message.id} className={message.authorType === "TEAM" ? "rounded-xl border border-sky-400/20 bg-sky-500/10 p-3" : "rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3"}>\n                                <div className="text-xs font-semibold">{message.authorType === "TEAM" ? "Your team" : "SIXFL"} · {formatDateTime(message.createdAt)}</div>\n                                <div className="mt-1 whitespace-pre-wrap">{message.body}</div>\n                              </div>\n                            ))}\n                          </div>\n                          {row.latestDispute.status === "OPEN" || row.latestDispute.status === "REVIEW" ? (\n                            <form action={addCaptainDisputeMessageAction} className="mt-4">\n                              <input type="hidden" name="teamid" value={team.id} />\n                              <input type="hidden" name="disputeId" value={row.latestDispute.id} />\n                              <textarea name="body" rows={3} required maxLength={2000} placeholder="Reply to SIXFL…" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40" />\n                              <button type="submit" className="mt-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-100">Send reply</button>\n                            </form>\n                          ) : (\n                            <p className="mt-3 text-xs text-white/45">This dispute is closed, so replies are disabled.</p>\n                          )}\n                        </div>\n                      </div>`,
    "captain conversation UI",
  );

  source = replaceOnce(
    source,
    '      {filters.saved === "dispute" ? (\n        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">\n          Dispute submitted successfully. Admin can now review it.\n        </section>\n      ) : null}',
    '      {filters.saved === "dispute" ? (\n        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">\n          Dispute submitted successfully. Admin can now review it.\n        </section>\n      ) : null}\n      {filters.saved === "dispute-reply" ? (\n        <section className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">\n          Your reply has been sent to SIXFL.\n        </section>\n      ) : null}',
    "captain reply success notice",
  );
  return source;
});
