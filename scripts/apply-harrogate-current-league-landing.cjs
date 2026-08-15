const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "harrogate-6-a-side-football",
  "page.tsx",
);

if (!fs.existsSync(filePath)) {
  throw new Error("Harrogate landing page was not found.");
}

let source = fs.readFileSync(filePath, "utf8");

const prismaImport = 'import { prisma } from "@/lib/prisma";';
const currentLeagueImport = 'import { getCurrentLeagueOptions } from "@/lib/current-leagues";';
if (!source.includes(currentLeagueImport)) {
  if (!source.includes(prismaImport)) {
    throw new Error("Harrogate landing Prisma import was not found.");
  }
  source = source.replace(
    prismaImport,
    `${currentLeagueImport}\n${prismaImport}`,
  );
}

source = source.replace(
  'const HARROGATE_LEAGUE_SLUG = "rossett-mens-tuesday";',
  'const HARROGATE_LEAGUE_FALLBACK_SLUG = "rossett-mens-tuesday";',
);

const oldLeagueLookup = `  const league = await prisma.league.findFirst({
    where: { slug: HARROGATE_LEAGUE_SLUG, isActive: true },`;

const newLeagueLookup = `  const currentLeagueOptions = await getCurrentLeagueOptions();
  const currentHarrogateLeague = currentLeagueOptions.find((option) => {
    const haystack = [option.name, option.area, option.venueName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      option.dayOfWeek === "TUESDAY" &&
      (haystack.includes("harrogate") || haystack.includes("rossett"))
    );
  });

  const league = await prisma.league.findFirst({
    where: currentHarrogateLeague
      ? { id: currentHarrogateLeague.id }
      : { slug: HARROGATE_LEAGUE_FALLBACK_SLUG, isActive: true },`;

if (!source.includes(newLeagueLookup)) {
  if (!source.includes(oldLeagueLookup)) {
    throw new Error("Harrogate landing fixed-slug league lookup was not found.");
  }
  source = source.replace(oldLeagueLookup, newLeagueLookup);
}

if (
  !source.includes(currentLeagueImport) ||
  !source.includes("const currentHarrogateLeague = currentLeagueOptions.find") ||
  !source.includes("currentHarrogateLeague.id") ||
  source.includes("HARROGATE_LEAGUE_SLUG")
) {
  throw new Error("Harrogate landing current-season league lookup was not applied correctly.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log(
  "Harrogate public landing now follows the current Harrogate/Rossett Tuesday league instead of a fixed historical season slug.",
);
