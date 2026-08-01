const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/components/captain/ManagedSquadEditLinks.tsx",
);
let source = fs.readFileSync(filePath, "utf8");

source = source.replace(
  "const removeDuplicateClassName =",
  "const mergePlayerClassName =",
);

source = source.replace(
  /async function markPlayerDuplicate\([\s\S]*?\n}\n\nfunction wireNotInterestedForm/,
  `function openPlayerMerge(input: { teamId: string; membershipId: string }) {
  window.location.href =
    \`/admin/players/merge/member/\${encodeURIComponent(input.membershipId)}?teamId=\${encodeURIComponent(input.teamId)}\`;
}

function wireNotInterestedForm`,
);

source = source.replace(
  /    const existingDuplicateButton = actionsContainer\.querySelector\([\s\S]*?    }\n\n    wireNotInterestedForm/,
  `    const existingMergeButton = actionsContainer.querySelector(
      \`button[data-managed-squad-merge-link="\${membershipId}"]\`,
    );

    if (!existingMergeButton) {
      const mergeButton = document.createElement("button");
      mergeButton.type = "button";
      mergeButton.textContent = "Merge player";
      mergeButton.dataset.managedSquadMergeLink = membershipId;
      mergeButton.className = mergePlayerClassName;
      mergeButton.addEventListener("click", () => {
        openPlayerMerge({ teamId, membershipId });
      });

      actionsContainer.insertBefore(mergeButton, removeForm ?? null);
    }

    wireNotInterestedForm`,
);

fs.writeFileSync(filePath, source, "utf8");

if (
  !source.includes("/admin/players/merge/member/") ||
  !source.includes('mergeButton.textContent = "Merge player"') ||
  source.includes('duplicateButton.textContent = "Remove duplicate"')
) {
  throw new Error("Managed squad Merge player control was not applied correctly.");
}

console.log(
  "Replaced the managed-squad remove-duplicate action with the full player-account merge workflow.",
);
