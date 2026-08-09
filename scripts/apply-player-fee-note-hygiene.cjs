const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/player-payments/actions.ts",
);
let source = fs.readFileSync(filePath, "utf8");

const appendNoteBlock = [
  "function appendNote(input: { existingNote: string | null; note: string }) {",
  "  const existingNote = input.existingNote?.trim();",
  "  if (!existingNote) return input.note;",
  "  if (existingNote.includes(input.note)) return existingNote;",
  "  return `${existingNote}\\n${input.note}`;",
  "}",
].join("\n");

const collectionNoteHelper = [
  appendNoteBlock,
  "",
  "const COLLECTION_NOTE_PREFIXES = [",
  '  "SIXFL player payment link:",',
  '  "No individual player payment link:",',
  '  "No player link needed:",',
  "  ZERO_FEE_WAIVER_NOTE,",
  "] as const;",
  "",
  "function replaceCollectionNote(existingNote: string | null, nextNote: string) {",
  "  const preservedLines = (existingNote ?? \"\")",
  "    .split(/\\r?\\n/)",
  "    .filter((line) => {",
  "      const trimmed = line.trim();",
  "      return (",
  "        Boolean(trimmed) &&",
  "        !COLLECTION_NOTE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))",
  "      );",
  "    });",
  "",
  '  if (!nextNote.startsWith("SIXFL player payment link:")) {',
  "    preservedLines.push(nextNote);",
  "  }",
  "",
  "  return preservedLines.length > 0 ? preservedLines.join(\"\\n\") : null;",
  "}",
].join("\n");

if (!source.includes("function replaceCollectionNote(")) {
  if (!source.includes(appendNoteBlock)) {
    throw new Error("Expected appendNote helper was not found in player-payment actions.");
  }
  source = source.replace(appendNoteBlock, collectionNoteHelper);
}

const oldNoteAssignment =
  "note: existing ? appendNote({ existingNote: existing.note, note }) : note,";
const newNoteAssignment =
  "note: replaceCollectionNote(existing?.note ?? null, note),";

if (source.includes(oldNoteAssignment)) {
  source = source.split(oldNoteAssignment).join(newNoteAssignment);
}

if (
  !source.includes("function replaceCollectionNote(") ||
  source.includes(oldNoteAssignment) ||
  (source.match(/note: replaceCollectionNote\(existing\?\.note \?\? null, note\),/g) ?? [])
    .length < 2
) {
  throw new Error("Player fee collection-note hygiene patch did not complete.");
}

fs.writeFileSync(filePath, source, "utf8");
console.log(
  "Player fee notes now keep audit notes without accumulating obsolete payment-link amounts.",
);
