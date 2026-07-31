const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, replacements) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");

  for (const { before, after, label } of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Expected ${label} source was not found in ${filePath}`);
    }
    source = source.replace(before, after);
  }

  fs.writeFileSync(absolutePath, source, "utf8");
}

const captainLayoutPath = "src/app/captain/team/[teamid]/layout.tsx";
const redirectFixPath = "src/components/captain/CaptainRedirectErrorNoticeFix.tsx";
const kitPagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const kitActionsPath = "src/app/captain/team/[teamid]/kit/actions.ts";

patchFile(captainLayoutPath, [
  {
    label: "captain team free-kit field",
    before: [
      "      logoUrl: true,",
      "      teamMode: true,",
      "      league: {",
    ].join("\n"),
    after: [
      "      logoUrl: true,",
      "      teamMode: true,",
      "      wantsFreeKit: true,",
      "      league: {",
    ].join("\n"),
  },
  {
    label: "free-kit-only captain navigation",
    before: [
      '    { href: `/captain/team/${teamid}/player-payments`, label: "Squad payments" },',
      '    { href: `/captain/team/${teamid}/match-fees`, label: "Matchday squad" },',
    ].join("\n"),
    after: [
      '    { href: `/captain/team/${teamid}/player-payments`, label: "Squad payments" },',
      "    ...(team.wantsFreeKit",
      '      ? [{ href: `/captain/team/${teamid}/kit`, label: "Team kit" }]',
      "      : []),",
      '    { href: `/captain/team/${teamid}/match-fees`, label: "Matchday squad" },',
    ].join("\n"),
  },
]);

patchFile(redirectFixPath, [
  {
    label: "remove obsolete kit navigation pathname import",
    before: [
      'import { useEffect } from "react";',
      'import { usePathname } from "next/navigation";',
    ].join("\n"),
    after: 'import { useEffect } from "react";',
  },
  {
    label: "remove unconditional client-side kit navigation",
    before: [
      "const kitNavBaseClass =",
      '  "rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100";',
      "",
      "function getTeamId(pathname: string) {",
      "  return pathname.match(/\\/captain\\/team\\/([^/]+)(?:\\/|$)/)?.[1] ?? null;",
      "}",
      "",
      "function injectKitNavigation(pathname: string) {",
      "  const teamId = getTeamId(pathname);",
      "  if (!teamId) return false;",
      "",
      '  const nav = document.querySelector<HTMLElement>(".captain-team-nav");',
      "  if (!nav) return false;",
      "",
      '  let link = nav.querySelector<HTMLAnchorElement>("a[data-team-kit-nav=\'true\']");',
      "",
      "  if (!link) {",
      '    link = document.createElement("a");',
      '    link.dataset.teamKitNav = "true";',
      '    link.textContent = "Team kit";',
      "    nav.appendChild(link);",
      "  }",
      "",
      "  link.href = `/captain/team/${encodeURIComponent(teamId)}/kit`;",
      "  link.className = [",
      "    kitNavBaseClass,",
      "    pathname === `/captain/team/${teamId}/kit` ||",
      "    pathname.startsWith(`/captain/team/${teamId}/kit/`)",
      '      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"',
      '      : "",',
      '  ].join(" ");',
      "",
      "  return true;",
      "}",
      "",
    ].join("\n"),
    after:
      "// Team kit navigation is rendered by the server layout only for eligible teams.\n",
  },
  {
    label: "remove obsolete kit navigation effect",
    before: [
      "  const pathname = usePathname();",
      "",
      "  useEffect(() => {",
      "    if (injectKitNavigation(pathname)) return;",
      "",
      "    const observer = new MutationObserver(() => {",
      "      if (injectKitNavigation(pathname)) observer.disconnect();",
      "    });",
      "",
      "    observer.observe(document.body, { childList: true, subtree: true });",
      "    return () => observer.disconnect();",
      "  }, [pathname]);",
      "",
    ].join("\n"),
    after:
      "  // Team kit navigation eligibility is handled by the server-rendered layout.\n",
  },
]);

patchFile(kitPagePath, [
  {
    label: "kit page free-kit eligibility field",
    before: [
      "      id: true,",
      "      name: true,",
      "      league: {",
    ].join("\n"),
    after: [
      "      id: true,",
      "      name: true,",
      "      wantsFreeKit: true,",
      "      league: {",
    ].join("\n"),
  },
  {
    label: "kit page eligibility guard",
    before: "  if (!team) notFound();",
    after: "  if (!team || !team.wantsFreeKit) notFound();",
  },
]);

patchFile(kitActionsPath, [
  {
    label: "kit order eligibility guard",
    before: [
      "  const access = await requireCaptain(teamId);",
      "  const existingOrder = await getTeamKitOrder(teamId);",
    ].join("\n"),
    after: [
      "  const access = await requireCaptain(teamId);",
      "  const team = await prisma.team.findUnique({",
      "    where: { id: teamId },",
      "    select: { wantsFreeKit: true },",
      "  });",
      "",
      "  if (!team?.wantsFreeKit) {",
      "    redirect(`/captain/team/${teamId}`);",
      "  }",
      "",
      "  const existingOrder = await getTeamKitOrder(teamId);",
    ].join("\n"),
  },
]);

console.log(
  "Applied free-kit eligibility guard to captain navigation, kit page and kit order action.",
);
