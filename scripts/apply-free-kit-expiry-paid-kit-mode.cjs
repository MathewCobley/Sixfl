const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patchFile(filePath, before, after, label) {
  const absolutePath = path.join(root, filePath);
  let source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }

  source = source.replace(before, after);
  fs.writeFileSync(absolutePath, source, "utf8");
}

const quantityPath = "src/lib/kits/extra-kit-quantity.ts";
const oldIncludedQuantity = `async function getIncludedKitQuantity(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{ included: boolean }>>(Prisma.sql\`
    SELECT (
      EXISTS (
        SELECT 1
        FROM "InterestLead" lead
        WHERE lead."convertedTeamId" = \${teamId}
          AND lead."wantsFreeKit" = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM "Team" kit_team
        WHERE kit_team."id" = \${teamId}
          AND kit_team."wantsFreeKit" = TRUE
      )
    ) AS "included"
  \`);

  return rows[0]?.included ? TEAM_KIT_QUANTITY : 0;
}`;
const newIncludedQuantity = `async function getIncludedKitQuantity(teamId: string) {
  const rows = await prisma.$queryRaw<Array<{ included: boolean }>>(Prisma.sql\`
    SELECT (
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = \${teamId}
            AND lead."wantsFreeKit" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" kit_team
          WHERE kit_team."id" = \${teamId}
            AND kit_team."wantsFreeKit" = TRUE
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM "Team" suppressed_team
          WHERE suppressed_team."id" = \${teamId}
            AND suppressed_team."freeKitOfferExpiredAt" IS NOT NULL
        )
        OR EXISTS (
          SELECT 1
          FROM "TeamKitOrder" current_order
          WHERE current_order."teamId" = \${teamId}
        )
      )
    ) AS "included"
  \`);

  return rows[0]?.included ? TEAM_KIT_QUANTITY : 0;
}`;
patchFile(
  quantityPath,
  oldIncludedQuantity,
  newIncludedQuantity,
  "free-kit included quantity eligibility",
);

const paymentRoutePath =
  "src/app/api/captain/team/[teamid]/extra-kit-payments/route.ts";
const oldEligibility = `async function getKitEligibility(teamId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ eligible: boolean; legacyOffer: boolean }>
  >\`
    SELECT
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = \${teamId}
            AND lead."wantsFreeKit" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" kit_team
          WHERE kit_team."id" = \${teamId}
            AND kit_team."wantsFreeKit" = TRUE
        )
      ) AS "eligible",
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = \${teamId}
            AND lead."wantsFreeKit" = TRUE
            AND lead."createdAt" < \${KIT_PACKAGE_CHANGEOVER_AT}
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" legacy_team
          WHERE legacy_team."id" = \${teamId}
            AND legacy_team."wantsFreeKit" = TRUE
            AND legacy_team."createdAt" < \${KIT_PACKAGE_CHANGEOVER_AT}
        )
      ) AS "legacyOffer"
  \`;

  return {
    eligible: Boolean(rows[0]?.eligible),
    legacyOffer: Boolean(rows[0]?.legacyOffer),
  };
}`;
const newEligibility = `async function getKitEligibility(teamId: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      requestedFreeKit: boolean;
      legacyOffer: boolean;
      freeKitOfferExpired: boolean;
      hasExistingOrder: boolean;
    }>
  >\`
    SELECT
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = \${teamId}
            AND lead."wantsFreeKit" = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" kit_team
          WHERE kit_team."id" = \${teamId}
            AND kit_team."wantsFreeKit" = TRUE
        )
      ) AS "requestedFreeKit",
      (
        EXISTS (
          SELECT 1
          FROM "InterestLead" lead
          WHERE lead."convertedTeamId" = \${teamId}
            AND lead."wantsFreeKit" = TRUE
            AND lead."createdAt" < \${KIT_PACKAGE_CHANGEOVER_AT}
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" legacy_team
          WHERE legacy_team."id" = \${teamId}
            AND legacy_team."wantsFreeKit" = TRUE
            AND legacy_team."createdAt" < \${KIT_PACKAGE_CHANGEOVER_AT}
        )
      ) AS "legacyOffer",
      EXISTS (
        SELECT 1
        FROM "Team" suppressed_team
        WHERE suppressed_team."id" = \${teamId}
          AND suppressed_team."freeKitOfferExpiredAt" IS NOT NULL
      ) AS "freeKitOfferExpired",
      EXISTS (
        SELECT 1
        FROM "TeamKitOrder" current_order
        WHERE current_order."teamId" = \${teamId}
      ) AS "hasExistingOrder"
  \`;

  const row = rows[0];
  const requestedFreeKit = Boolean(row?.requestedFreeKit);
  const hasExistingOrder = Boolean(row?.hasExistingOrder);
  const freeKitOfferExpired = Boolean(row?.freeKitOfferExpired);

  return {
    eligible:
      requestedFreeKit && (!freeKitOfferExpired || hasExistingOrder),
    legacyOffer: Boolean(row?.legacyOffer),
  };
}`;
patchFile(
  paymentRoutePath,
  oldEligibility,
  newEligibility,
  "free-kit eligibility with paid-kit fallback",
);

const quantitySource = fs.readFileSync(path.join(root, quantityPath), "utf8");
const paymentRouteSource = fs.readFileSync(path.join(root, paymentRoutePath), "utf8");
if (
  !quantitySource.includes('suppressed_team."freeKitOfferExpiredAt" IS NOT NULL') ||
  !quantitySource.includes('FROM "TeamKitOrder" current_order') ||
  !paymentRouteSource.includes("requestedFreeKit && (!freeKitOfferExpired || hasExistingOrder)") ||
  !paymentRouteSource.includes("const purchaseOnly = !eligibility.eligible;")
) {
  throw new Error("Free-kit expiry paid-kit fallback was not applied correctly.");
}

console.log(
  "Expired unclaimed free-kit offers now fall back to the normal paid £20 kit flow; existing kit orders keep their entitlement.",
);
