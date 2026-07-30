const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

replaceOnce(
  "src/components/admin/fixtures/FixtureMatchupGrid.tsx",
  'function canChase(status: ConfirmationStatus) {\n  return status !== "CONFIRMED" && status !== "ISSUE_RAISED";\n}',
  'function canChase(status: ConfirmationStatus) {\n  return status !== "CONFIRMED";\n}',
);

replaceOnce(
  "src/lib/fixtures/confirmation-reminders.ts",
  '  if (existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED) {\n    return { ok: false, status: "issue_raised", teamName: team.name };\n  }',
  '  if (\n    input.mode !== "manual" &&\n    existingConfirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED\n  ) {\n    return { ok: false, status: "issue_raised", teamName: team.name };\n  }',
);

replaceOnce(
  "src/app/api/admin/night-board/pitch-tally-sheets/route.ts",
  '  ctx.font = font(9.5, true);\n  write(\n    ctx,\n    fit(ctx, input.teamName, teamWidth - 27),\n    input.x + 23,\n    input.y + 25,\n    { font: font(9.5, true) },\n  );',
  '  ctx.font = font(9, true);\n  write(\n    ctx,\n    fit(ctx, input.teamName, teamWidth - 27),\n    input.x + 23,\n    input.y + 17,\n    { font: font(9, true) },\n  );\n\n  const shinPadBoxX = input.x + 23;\n  const shinPadBoxY = input.y + 23;\n  ctx.fillStyle = "#ffffff";\n  ctx.strokeStyle = "#111111";\n  ctx.lineWidth = 0.8;\n  ctx.fillRect(shinPadBoxX, shinPadBoxY, 9, 9);\n  ctx.strokeRect(shinPadBoxX, shinPadBoxY, 9, 9);\n  write(ctx, "SHIN PADS", shinPadBoxX + 13, shinPadBoxY + 8, {\n    font: font(5.8, true),\n    fill: "#555555",\n  });',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  'type SearchParams = {\n  page?: string;\n};',
  'type SearchParams = {\n  page?: string;\n  filter?: string;\n};',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());\n\n  const totalPages = Math.max(1, Math.ceil(timeline.length / PAGE_SIZE));',
  '  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());\n\n  const inboundOnly = sp.filter === "inbound";\n  const filteredTimeline = inboundOnly\n    ? timeline.filter((item) => item.direction === "Inbound")\n    : timeline;\n  const totalPages = Math.max(1, Math.ceil(filteredTimeline.length / PAGE_SIZE));',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '  const visibleTimeline = timeline.slice(start, start + PAGE_SIZE);',
  '  const visibleTimeline = filteredTimeline.slice(start, start + PAGE_SIZE);',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '  const pageHref = (page: number) =>\n    `/admin/teams/${team.id}/communications?page=${page}`;',
  '  const pageHref = (page: number) =>\n    `/admin/teams/${team.id}/communications?${inboundOnly ? "filter=inbound&" : ""}page=${page}`;\n  const allMessagesHref = `/admin/teams/${team.id}/communications`;\n  const inboundMessagesHref = `/admin/teams/${team.id}/communications?filter=inbound`;',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '            <h2 className="text-xl font-semibold text-white">Timeline</h2>',
  '            <h2 className="text-xl font-semibold text-white">\n              {inboundOnly ? "Inbound messages" : "Timeline"}\n            </h2>',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '              Showing {timeline.length === 0 ? 0 : start + 1}–\n              {Math.min(start + PAGE_SIZE, timeline.length)} of {timeline.length}.',
  '              Showing {filteredTimeline.length === 0 ? 0 : start + 1}–\n              {Math.min(start + PAGE_SIZE, filteredTimeline.length)} of {filteredTimeline.length}.',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '          <div className="flex items-center gap-2">\n            <Link\n              href={pageHref(Math.max(1, currentPage - 1))}',
  '          <div className="flex flex-wrap items-center gap-2">\n            <Link\n              href={allMessagesHref}\n              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm font-medium transition ${\n                !inboundOnly\n                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"\n                  : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"\n              }`}\n            >\n              All messages\n            </Link>\n            <Link\n              href={inboundMessagesHref}\n              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm font-medium transition ${\n                inboundOnly\n                  ? "border-sky-400/30 bg-sky-500/15 text-sky-100"\n                  : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"\n              }`}\n            >\n              Inbound only ({inboundCount})\n            </Link>\n            <span className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />\n            <Link\n              href={pageHref(Math.max(1, currentPage - 1))}',
);

replaceOnce(
  "src/components/admin/teams/TeamCommunicationsPage.tsx",
  '            No communications have been logged for this team yet.',
  '            {inboundOnly\n              ? "No inbound messages have been logged for this team yet."\n              : "No communications have been logged for this team yet."}',
);

console.log("Applied fixture confirmation chase, tally-sheet shin pad checkbox and inbound communications filter.");
