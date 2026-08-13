const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath =
  "src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx";
const absolutePath = path.join(root, pagePath);
let source = fs.readFileSync(absolutePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${pagePath}`);
  }
  source = source.replace(before, after);
}

// Keep this compatibility patch deliberately small. The squad-payment page is
// changed by several older preparation scripts, so replacing an entire player
// row makes this patch needlessly dependent on unrelated presentation markup.
replaceRequired(
  '  return "Unknown player";',
  '  return "Unlinked player payment";',
  "unlinked player fallback label",
);

if (!source.includes("function isTemporaryPlayerPassFee(")) {
  const helperAnchor = "function playerContact(input: {";
  if (!source.includes(helperAnchor)) {
    throw new Error(`Expected player contact helper was not found in ${pagePath}`);
  }

  const helpers = `function isTemporaryPlayerPassFee(note?: string | null) {
  const normalised = note?.toLowerCase() ?? "";
  return (
    normalised.includes("temporary player") &&
    (normalised.includes("one-time pass") || normalised.includes("temporary-player"))
  );
}

function UnlinkedPlayerPaymentExplanation({
  fee,
}: {
  fee: { id: string; note: string | null; createdAt: Date };
}) {
  const temporaryPlayer = isTemporaryPlayerPassFee(fee.note);

  return (
    <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-50/80">
      <div className="font-semibold text-amber-100">
        {temporaryPlayer ? "Temporary player payment" : "Player record no longer linked"}
      </div>
      <div className="mt-1">
        {temporaryPlayer
          ? "This fee belongs to a temporary player who joined this fixture using a one-time pass. Temporary players are not added to the permanent squad, so there is no squad player record attached here."
          : "This payment no longer has a linked squad or prospect record. The fee is kept here so the fixture payment history remains accurate."}
      </div>
      <div className="mt-1 text-amber-100/55">
        Reference {fee.id.slice(-8).toUpperCase()} · created {formatDateTime(fee.createdAt)}
      </div>
    </div>
  );
}

`;

  source = source.replace(helperAnchor, `${helpers}${helperAnchor}`);
}

const playerLabelBefore =
  '                  <div className="font-semibold text-white">{playerName(fee)}</div>';
const playerLabelAfter = `                  <div className="font-semibold text-white">
                    {!fee.teamMember && !fee.prospect && isTemporaryPlayerPassFee(fee.note)
                      ? "Temporary player"
                      : playerName(fee)}
                  </div>`;

replaceRequired(
  playerLabelBefore,
  playerLabelAfter,
  "temporary player display label",
);

// Add the explanation beside the player identity rather than matching the full
// amount/team detail row. Earlier build patches are allowed to evolve that detail
// copy, so using it as an anchor made deployments fail even though the actual
// unlinked-player responsibility had not changed.
if (!source.includes("<UnlinkedPlayerPaymentExplanation fee={fee} />")) {
  if (!source.includes(playerLabelAfter)) {
    throw new Error(`Expected temporary player label was not found in ${pagePath}`);
  }

  source = source.replace(
    playerLabelAfter,
    `${playerLabelAfter}
                  {!fee.teamMember && !fee.prospect ? (
                    <UnlinkedPlayerPaymentExplanation fee={fee} />
                  ) : null}`,
  );
}

fs.writeFileSync(absolutePath, source, "utf8");

if (
  !source.includes("function isTemporaryPlayerPassFee(") ||
  !source.includes("Temporary player payment") ||
  !source.includes("Player record no longer linked") ||
  !source.includes("<UnlinkedPlayerPaymentExplanation fee={fee} />") ||
  source.includes('return "Unknown player";') ||
  source.includes("The original squad or prospect record has been removed")
) {
  throw new Error("Clear unlinked player payment details were not applied correctly.");
}

console.log(
  "Unlinked player payment rows now use a small, idempotent native-page compatibility patch with clear temporary-player wording.",
);
