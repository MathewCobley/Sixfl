const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, filePath) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected Goal of the Week source was not found in ${filePath}`);
  }
  return source.replace(before, after);
}

function patchAdminPage() {
  const filePath = "src/app/(admin)/admin/sixfl-tv/page.tsx";
  let source = read(filePath);

  const adminPanelImport =
    'import GoalOfWeekAdminPanel from "@/components/admin/sixfl-tv/GoalOfWeekAdminPanel";';
  if (!source.includes(adminPanelImport)) {
    source = replaceRequired(
      source,
      'import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";',
      'import { queueSixflTvFixtureUploadedEmailsOnce } from "@/lib/sixfl-tv/notifications";\n' +
        adminPanelImport,
      filePath,
    );
  }

  source = replaceRequired(
    source,
    'searchParams?: Promise<{ saved?: string; error?: string }>;',
    'searchParams?: Promise<{ saved?: string; error?: string; goalSaved?: string; goalError?: string }>;',
    filePath,
  );

  source = replaceRequired(
    source,
    '    <div className="space-y-6">\n      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">',
    '    <div className="space-y-6">\n      <GoalOfWeekAdminPanel searchParams={sp} />\n\n      <div className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6">',
    filePath,
  );

  write(filePath, source);
}

function patchHomepageSection() {
  const filePath = "src/components/home/SixflTvHomepageSection.tsx";
  let source = read(filePath);

  const homepageFeatureImport =
    'import GoalOfWeekHomepageFeature from "@/components/home/GoalOfWeekHomepageFeature";';
  if (!source.includes(homepageFeatureImport)) {
    const latestLinksImport =
      'import HomepageSixflTvLatestLinks from "@/components/home/HomepageSixflTvLatestLinks";';
    if (source.includes(latestLinksImport)) {
      source = source.replace(
        latestLinksImport,
        `${homepageFeatureImport}\n${latestLinksImport}`,
      );
    } else {
      source = replaceRequired(
        source,
        'const SIXFL_TV_CHANNEL_URL =',
        `${homepageFeatureImport}\n\nconst SIXFL_TV_CHANNEL_URL =`,
        filePath,
      );
    }
  }

  if (!source.includes("<GoalOfWeekHomepageFeature")) {
    const startMarker = [
      "          <a",
      "            href={SIXFL_TV_CHANNEL_URL}",
      '            target="_blank"',
      '            rel="noopener noreferrer"',
      '            className="group flex min-h-[330px]',
    ].join("\n");
    const endMarker = "          </a>\n\n          <div>";
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);

    if (start === -1 || end === -1) {
      throw new Error(`Expected SIXFL TV homepage card was not found in ${filePath}`);
    }

    source =
      source.slice(0, start) +
      "          <GoalOfWeekHomepageFeature channelUrl={SIXFL_TV_CHANNEL_URL} />\n\n          <div>" +
      source.slice(end + endMarker.length);
  }

  source = source.replace(
    "Watch SIXFL matches, highlights and goals.",
    "Watch the Goal of the Week and every SIXFL highlight.",
  );
  source = source.replace(
    "Selected SIXFL fixtures are recorded and uploaded to SIXFL TV, giving teams and players the chance to watch matches back, relive the best goals and share matchday highlights.",
    "See the latest Goal of the Week, then explore recorded fixtures, highlights and matchday moments from across SIXFL.",
  );
  source = source.replace(
    '[\n                "Recorded matches",',
    '[\n                "Goal of the Week",\n                "Recorded matches",',
  );

  write(filePath, source);
}

patchAdminPage();
patchHomepageSection();

console.log("Applied Goal of the Week admin and homepage integration.");
