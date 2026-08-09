const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function patch(relativePath, transform, label) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`[community-gotw] Missing ${label}.`);
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after, "utf8");
    console.log(`[community-gotw] Patched ${label}.`);
  } else {
    console.log(`[community-gotw] ${label} already patched.`);
  }
}

function assertCentralGoalOfWeek() {
  const publicPage = path.join(
    root,
    "src/app/(public)/goal-of-the-week/page.tsx",
  );
  const panel = path.join(
    root,
    "src/components/goal-of-week/CommunityGoalOfWeekPanel.tsx",
  );

  if (!fs.existsSync(publicPage)) {
    throw new Error("Central /goal-of-the-week page is missing.");
  }
  if (!fs.existsSync(panel)) {
    throw new Error("Community Goal of the Week panel is missing.");
  }

  for (const relativePath of [
    "src/app/player/team/[teamid]/tv/page.tsx",
    "src/app/captain/team/[teamid]/tv/page.tsx",
  ]) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    if (source.includes("CommunityGoalOfWeekPanel")) {
      throw new Error(
        `Goal of the Week must live on /goal-of-the-week, not inside ${relativePath}.`,
      );
    }
  }

  console.log("[community-gotw] Central Goal of the Week route verified.");
}

assertCentralGoalOfWeek();

patch(
  "src/app/(admin)/admin/sixfl-tv/page.tsx",
  (source) => {
    if (source.includes('href="/admin/sixfl-tv/goal-of-week"')) return source;

    const anchor = `          <Link\n            href="/admin/night-board"\n            className="inline-flex rounded-2xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-black/35"\n          >\n            Back to Night Board\n          </Link>`;
    if (!source.includes(anchor)) throw new Error("Admin SIXFL TV navigation anchor changed.");

    return source.replace(
      anchor,
      `${anchor}\n          <Link\n            href="/admin/sixfl-tv/goal-of-week"\n            className="inline-flex rounded-2xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/20"\n          >\n            Player nominations & voting\n          </Link>`,
    );
  },
  "admin SIXFL TV navigation",
);

require("./fix-community-goal-of-week-payload-narrowing.cjs");
