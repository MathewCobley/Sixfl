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

function addImport(source) {
  const importLine = 'import CommunityGoalOfWeekPanel from "@/components/goal-of-week/CommunityGoalOfWeekPanel";';
  if (source.includes(importLine)) return source;
  const anchor = 'import SixflTvFixtureMatchup from "@/components/sixfl-tv/SixflTvFixtureMatchup";';
  if (!source.includes(anchor)) throw new Error("SIXFL TV matchup import anchor changed.");
  return source.replace(anchor, `${importLine}\n${anchor}`);
}

patch(
  "src/app/player/team/[teamid]/tv/page.tsx",
  (source) => {
    source = addImport(source);
    if (!source.includes("<CommunityGoalOfWeekPanel")) {
      const anchor = `        </section>\n\n        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">`;
      if (!source.includes(anchor)) throw new Error("Player SIXFL TV section anchor changed.");
      source = source.replace(
        anchor,
        `        </section>\n\n        <CommunityGoalOfWeekPanel teamId={team.id} />\n\n        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">`,
      );
    }
    return source;
  },
  "player SIXFL TV",
);

patch(
  "src/app/captain/team/[teamid]/tv/page.tsx",
  (source) => {
    source = addImport(source);
    if (!source.includes("<CommunityGoalOfWeekPanel")) {
      const anchor = `      </section>\n\n      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">`;
      if (!source.includes(anchor)) throw new Error("Captain SIXFL TV section anchor changed.");
      source = source.replace(
        anchor,
        `      </section>\n\n      <CommunityGoalOfWeekPanel teamId={team.id} />\n\n      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">`,
      );
    }
    return source;
  },
  "captain SIXFL TV",
);

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
