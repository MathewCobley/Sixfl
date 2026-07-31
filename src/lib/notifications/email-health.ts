// ========================================
// File: src/lib/notifications/email-health.ts
// ========================================

const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "live.com",
  "live.co.uk",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "btinternet.com",
  "sky.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
] as const;

const KNOWN_DOMAIN_TYPOS = new Map<string, string>([
  ["gmal.com", "gmail.com"],
  ["gmial.com", "gmail.com"],
  ["gmai.com", "gmail.com"],
  ["gmail.co", "gmail.com"],
  ["gmail.con", "gmail.com"],
  ["gmail.cmo", "gmail.com"],
  ["gmail.cm", "gmail.com"],
  ["gmail.om", "gmail.com"],
  ["hotmal.com", "hotmail.com"],
  ["hotmai.com", "hotmail.com"],
  ["homail.com", "hotmail.com"],
  ["hotmial.com", "hotmail.com"],
  ["hotmail.co", "hotmail.com"],
  ["hotmail.con", "hotmail.com"],
  ["outlok.com", "outlook.com"],
  ["outloo.com", "outlook.com"],
  ["outllook.com", "outlook.com"],
  ["outlook.co", "outlook.com"],
  ["outlook.con", "outlook.com"],
  ["iclod.com", "icloud.com"],
  ["icould.com", "icloud.com"],
  ["icloud.co", "icloud.com"],
  ["icloud.con", "icloud.com"],
  ["yaho.com", "yahoo.com"],
  ["yahho.com", "yahoo.com"],
  ["yahoo.co", "yahoo.com"],
  ["yahoo.con", "yahoo.com"],
  ["btinterent.com", "btinternet.com"],
  ["btinternet.co", "btinternet.com"],
  ["btinternet.con", "btinternet.com"],
]);

export function normalizeEmailAddress(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isValidEmailAddress(value: string | null | undefined) {
  const email = normalizeEmailAddress(value);
  if (!email || email.length > 254) return false;

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  if (!domain.includes(".") || domain.includes("..")) return false;

  const labels = domain.split(".");
  if (labels.some((label) => !label || label.length > 63)) return false;
  if (
    labels.some(
      (label) =>
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[a-z0-9-]+$/i.test(label),
    )
  ) {
    return false;
  }

  const topLevelDomain = labels.at(-1) ?? "";
  return /^[a-z]{2,63}$/i.test(topLevelDomain);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

function suggestDomainCorrection(domain: string) {
  const known = KNOWN_DOMAIN_TYPOS.get(domain);
  if (known) return known;

  if (domain.endsWith(".con")) {
    return `${domain.slice(0, -4)}.com`;
  }

  let best: { domain: string; distance: number } | null = null;

  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = editDistance(domain, candidate);
    const threshold = Math.max(domain.length, candidate.length) >= 10 ? 2 : 1;

    if (distance > threshold) continue;
    if (!best || distance < best.distance) {
      best = { domain: candidate, distance };
    }
  }

  return best?.domain ?? null;
}

export function suggestEmailCorrection(value: string | null | undefined) {
  const email = normalizeEmailAddress(value);
  const atIndex = email.indexOf("@");

  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return null;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const correctedDomain = suggestDomainCorrection(domain);

  if (!correctedDomain || correctedDomain === domain) return null;

  const suggestion = `${local}@${correctedDomain}`;
  return isValidEmailAddress(suggestion) ? suggestion : null;
}
