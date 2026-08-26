import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type TeamReferralPayoutDetails = {
  accountHolderName: string;
  sortCode: string;
  accountNumber: string;
};

type StoredPayoutRow = {
  payoutDetailsCiphertext: string | null;
  payoutDetailsIv: string | null;
  payoutDetailsAuthTag: string | null;
  payoutDetailsSubmittedAt: Date | null;
};

function getEncryptionKey() {
  const secret =
    process.env.REFERRAL_PAYOUT_ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "Referral payout encryption is not configured. Set REFERRAL_PAYOUT_ENCRYPTION_KEY or NEXTAUTH_SECRET.",
    );
  }

  return createHash("sha256").update(secret, "utf8").digest();
}

function normaliseAccountHolderName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    throw new Error("Enter the account holder name exactly as it appears on the bank account.");
  }
  return name;
}

function normaliseSortCode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{6}$/.test(digits)) {
    throw new Error("Enter a valid 6-digit UK sort code.");
  }
  return digits;
}

function normaliseAccountNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error("Enter a valid 8-digit UK account number.");
  }
  return digits;
}

export function validateTeamReferralPayoutDetails(input: TeamReferralPayoutDetails) {
  return {
    accountHolderName: normaliseAccountHolderName(input.accountHolderName),
    sortCode: normaliseSortCode(input.sortCode),
    accountNumber: normaliseAccountNumber(input.accountNumber),
  } satisfies TeamReferralPayoutDetails;
}

function encryptDetails(details: TeamReferralPayoutDetails) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(details), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptDetails(row: StoredPayoutRow): TeamReferralPayoutDetails | null {
  if (
    !row.payoutDetailsCiphertext ||
    !row.payoutDetailsIv ||
    !row.payoutDetailsAuthTag
  ) {
    return null;
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(row.payoutDetailsIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.payoutDetailsAuthTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.payoutDetailsCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(plaintext) as TeamReferralPayoutDetails;
  return validateTeamReferralPayoutDetails(parsed);
}

export async function saveTeamReferralPayoutDetails(input: {
  referralId: string;
  referrerUserId: string;
  details: TeamReferralPayoutDetails;
}) {
  const details = validateTeamReferralPayoutDetails(input.details);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    requiredMatches: number;
    completedMatches: number;
    paidAt: Date | null;
  }>>`
    SELECT
      referral."id",
      referral."requiredMatches",
      referral."paidAt",
      COUNT(DISTINCT fixture."id")::int AS "completedMatches"
    FROM "TeamReferral" referral
    INNER JOIN "InterestLead" lead ON lead."id" = referral."interestLeadId"
    LEFT JOIN "Team" team ON team."id" = lead."convertedTeamId"
    LEFT JOIN "Fixture" fixture
      ON (fixture."homeTeamId" = team."id" OR fixture."awayTeamId" = team."id")
      AND fixture."status" = 'COMPLETED'
      AND NOT EXISTS (
        SELECT 1
        FROM "FixtureAbandonment" abandonment
        WHERE abandonment."fixtureId" = fixture."id"
      )
    WHERE referral."id" = ${input.referralId}
      AND referral."referrerUserId" = ${input.referrerUserId}
    GROUP BY referral."id", referral."requiredMatches", referral."paidAt"
    LIMIT 1
  `;

  const referral = rows[0];
  if (!referral) throw new Error("Referral reward not found.");
  if (referral.paidAt) throw new Error("This referral reward has already been paid.");
  if (referral.completedMatches < referral.requiredMatches) {
    throw new Error("This referral reward is not ready for payment yet.");
  }

  const encrypted = encryptDetails(details);
  await prisma.$executeRaw`
    UPDATE "TeamReferral"
    SET
      "payoutDetailsCiphertext" = ${encrypted.ciphertext},
      "payoutDetailsIv" = ${encrypted.iv},
      "payoutDetailsAuthTag" = ${encrypted.authTag},
      "payoutDetailsSubmittedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.referralId}
      AND "referrerUserId" = ${input.referrerUserId}
      AND "paidAt" IS NULL
  `;

  return details;
}

export async function getTeamReferralPayoutDetails(referralId: string) {
  const rows = await prisma.$queryRaw<StoredPayoutRow[]>`
    SELECT
      "payoutDetailsCiphertext",
      "payoutDetailsIv",
      "payoutDetailsAuthTag",
      "payoutDetailsSubmittedAt"
    FROM "TeamReferral"
    WHERE "id" = ${referralId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    details: decryptDetails(row),
    submittedAt: row.payoutDetailsSubmittedAt,
  };
}

export async function clearTeamReferralPayoutSecrets(referralId: string) {
  await prisma.$executeRaw`
    UPDATE "TeamReferral"
    SET
      "payoutDetailsCiphertext" = NULL,
      "payoutDetailsIv" = NULL,
      "payoutDetailsAuthTag" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${referralId}
  `;
}

export function formatSortCode(sortCode: string) {
  const digits = sortCode.replace(/\D/g, "");
  if (digits.length !== 6) return sortCode;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

export function maskAccountNumber(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••";
}
