// ========================================
// File: src/lib/notifications/phone.ts
// ========================================

const DEFAULT_COUNTRY_DIAL_CODE = "44";

export function cleanPhoneInput(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[^\d+]/g, "");

  if (!compact) {
    return null;
  }

  if (compact.startsWith("+")) {
    const digits = compact.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  const digits = compact.replace(/\D/g, "");
  return digits || null;
}

export function normalizePhoneNumber(
  value?: string | null,
  options?: { defaultCountryDialCode?: string },
) {
  const cleaned = cleanPhoneInput(value);

  if (!cleaned) {
    return null;
  }

  const defaultCountryDialCode =
    options?.defaultCountryDialCode?.replace(/\D/g, "") ||
    DEFAULT_COUNTRY_DIAL_CODE;

  let candidate = cleaned;

  if (candidate.startsWith("00")) {
    candidate = `+${candidate.slice(2)}`;
  }

  if (!candidate.startsWith("+")) {
    if (candidate.startsWith("0")) {
      candidate = `+${defaultCountryDialCode}${candidate.slice(1)}`;
    } else if (candidate.startsWith(defaultCountryDialCode)) {
      candidate = `+${candidate}`;
    } else if (
      defaultCountryDialCode === "44" &&
      /^7\d{9}$/.test(candidate)
    ) {
      candidate = `+44${candidate}`;
    } else if (/^\d{8,15}$/.test(candidate)) {
      candidate = `+${candidate}`;
    } else {
      return null;
    }
  }

  const trunkPrefixedCountryCode = `+${defaultCountryDialCode}0`;
  if (candidate.startsWith(trunkPrefixedCountryCode)) {
    candidate = `+${defaultCountryDialCode}${candidate.slice(
      trunkPrefixedCountryCode.length,
    )}`;
  }

  const digits = candidate.slice(1);

  if (!/^\d{8,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}

export function getPhoneDisplayValue(value?: string | null) {
  return normalizePhoneNumber(value) ?? cleanPhoneInput(value);
}

export function requireSmsReadyPhoneNumber(value?: string | null) {
  const normalized = normalizePhoneNumber(value);

  if (!normalized) {
    throw new Error(
      "Recipient phone number is invalid. Use +447700900123 or enter a UK number like 07700900123.",
    );
  }

  return normalized;
}