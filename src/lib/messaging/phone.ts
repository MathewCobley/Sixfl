// ========================================
// File: src/lib/messaging/phone.ts
// ========================================

export function normalizePhoneNumber(input: string | null | undefined): string | null {
    if (!input) return null;
  
    const trimmed = input.trim();
    if (!trimmed) return null;
  
    let cleaned = trimmed.replace(/[^\d+]/g, "");
  
    if (cleaned.startsWith("00")) {
      cleaned = `+${cleaned.slice(2)}`;
    }
  
    if (cleaned.startsWith("0")) {
      cleaned = `+44${cleaned.slice(1)}`;
    }
  
    if (!cleaned.startsWith("+")) {
      if (cleaned.startsWith("44")) {
        cleaned = `+${cleaned}`;
      } else {
        cleaned = `+44${cleaned}`;
      }
    }
  
    const digitsOnly = cleaned.replace(/[^\d]/g, "");
    if (digitsOnly.length < 10) {
      return null;
    }
  
    return `+${digitsOnly}`;
  }
  
  export function formatPhoneNumberForDisplay(input: string | null | undefined): string {
    if (!input) return "—";
  
    const normalized = normalizePhoneNumber(input);
    if (!normalized) return input;
  
    if (normalized.startsWith("+44") && normalized.length === 13) {
      const national = `0${normalized.slice(3)}`;
      return `${national.slice(0, 5)} ${national.slice(5, 8)} ${national.slice(8)}`;
    }
  
    return normalized;
  }
  
  export function phoneNumbersMatch(
    a: string | null | undefined,
    b: string | null | undefined,
  ): boolean {
    const normalizedA = normalizePhoneNumber(a);
    const normalizedB = normalizePhoneNumber(b);
  
    if (!normalizedA || !normalizedB) return false;
  
    return normalizedA === normalizedB;
  }