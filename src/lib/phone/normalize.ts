// ========================================
// File: src/lib/phone/normalize.ts
// ========================================

export function normalizeUkMobileNumber(
    value: string | null | undefined,
  ): string | null {
    const raw = String(value ?? "").trim();
  
    if (!raw) {
      return null;
    }
  
    let cleaned = raw.replace(/[^\d+]/g, "");
  
    if (cleaned.startsWith("00")) {
      cleaned = `+${cleaned.slice(2)}`;
    }
  
    if (cleaned.startsWith("+")) {
      const digits = cleaned.slice(1).replace(/\D/g, "");
  
      if (/^447\d{9}$/.test(digits)) {
        return `+${digits}`;
      }
  
      return null;
    }
  
    const digits = cleaned.replace(/\D/g, "");
  
    if (/^07\d{9}$/.test(digits)) {
      return `+44${digits.slice(1)}`;
    }
  
    if (/^447\d{9}$/.test(digits)) {
      return `+${digits}`;
    }
  
    return null;
  }
  
  export function formatUkMobileForDisplay(
    value: string | null | undefined,
  ): string | null {
    const normalized = normalizeUkMobileNumber(value);
  
    if (!normalized) {
      return null;
    }
  
    return `0${normalized.slice(3)}`;
  }