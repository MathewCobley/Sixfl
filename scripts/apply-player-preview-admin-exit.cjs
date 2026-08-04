const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/player/team/[teamid]/page.tsx",
);
let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in player team page.`);
  }
  source = source.replace(before, after);
}

const pageContainer =
  '      <div className="mx-auto max-w-6xl space-y-8">';
const pageContainerWithAdminPreview = [
  pageContainer,
  "        {previewMembershipId ? (",
  '          <section className="sticky top-3 z-50 rounded-2xl border border-violet-300/35 bg-[#171027]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur sm:p-5">',
  '            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">',
  '              <div className="min-w-0">',
  '                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/75">',
  "                  Admin player preview",
  "                </p>",
  '                <h2 className="mt-1.5 text-lg font-semibold text-white">',
  "                  You are viewing {membership?.user.name || membership?.user.email || \"this player\"} as a player",
  "                </h2>",
  '                <p className="mt-1 text-sm text-violet-100/65">',
  "                  Preview mode does not remove your admin access. Use one of the buttons to return directly to the admin tools.",
  "                </p>",
  "              </div>",
  '              <div className="flex flex-wrap gap-2">',
  "                <Link",
  "                  href={`/captain/team/${teamid}/squad`}",
  '                  className="inline-flex items-center rounded-xl bg-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-950 transition hover:bg-white"',
  "                >",
  "                  Return to squad",
  "                </Link>",
  "                <Link",
  "                  href={`/admin/teams/${teamid}/squad`}",
  '                  className="inline-flex items-center rounded-xl border border-violet-300/25 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/20"',
  "                >",
  "                  Full admin squad console",
  "                </Link>",
  "                <Link",
  '                  href="/admin"',
  '                  className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"',
  "                >",
  "                  Admin home",
  "                </Link>",
  "              </div>",
  "            </div>",
  "          </section>",
  "        ) : null}",
].join("\n");

if (!source.includes("Admin player preview")) {
  replaceRequired(
    pageContainer,
    pageContainerWithAdminPreview,
    "player page container for admin preview banner",
  );
} else if (source.includes("Return to managed squad")) {
  source = source.replace("Return to managed squad", "Return to squad");
}

const signOutLink = [
  "              <Link",
  '                href="/api/auth/signout"',
  '                className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"',
  "              >",
  "                Sign out",
  "              </Link>",
].join("\n");

const previewExitOrSignOut = [
  "              {previewMembershipId ? (",
  "                <Link",
  "                  href={`/captain/team/${teamid}/squad`}",
  '                  className="inline-flex items-center rounded-xl border border-violet-300/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/20"',
  "                >",
  "                  Exit preview to squad admin",
  "                </Link>",
  "              ) : (",
  "                <Link",
  '                  href="/api/auth/signout"',
  '                  className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"',
  "                >",
  "                  Sign out",
  "                </Link>",
  "              )}",
].join("\n");

if (!source.includes("Exit preview to squad admin")) {
  replaceRequired(
    signOutLink,
    previewExitOrSignOut,
    "player preview sign-out control",
  );
}

fs.writeFileSync(pagePath, source, "utf8");

if (
  !source.includes("Admin player preview") ||
  !source.includes("Return to squad") ||
  !source.includes("Full admin squad console") ||
  !source.includes("Exit preview to squad admin") ||
  source.includes("Return to managed squad")
) {
  throw new Error("Player preview admin exit controls were not applied correctly.");
}

console.log(
  "Admin player preview now has persistent links back to the squad, the full admin squad console and admin home.",
);
