const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "src/lib/players/add-player-without-duplicates.ts");
let source = fs.readFileSync(file, "utf8");

if (source.includes('code: "PLAYING_RESTRICTED"') && !source.includes('| "PLAYING_RESTRICTED";')) {
  const preferred = '    | "SHARED_EMAIL_DIFFERENT_PLAYER";';
  const fallback = '    | "EMAIL_CONFLICT";';

  if (source.includes(preferred)) {
    source = source.replace(
      preferred,
      '    | "SHARED_EMAIL_DIFFERENT_PLAYER"\n    | "PLAYING_RESTRICTED";',
    );
  } else if (source.includes(fallback)) {
    source = source.replace(
      fallback,
      '    | "EMAIL_CONFLICT"\n    | "PLAYING_RESTRICTED";',
    );
  } else {
    throw new Error("Could not extend AddPlayerWithoutDuplicatesResult for PLAYING_RESTRICTED.");
  }

  fs.writeFileSync(file, source, "utf8");
  console.log("Extended duplicate-player result type for playing restrictions.");
}
