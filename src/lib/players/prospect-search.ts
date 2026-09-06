export type SearchableProspect = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

/** Keep shared/bookmarked URLs bounded, and tolerate repeated query parameters. */
export function normaliseProspectSearch(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function fold(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019]/g, "").toLowerCase();
}

/** Include UK national/international forms without changing the stored number. */
function phoneForms(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return [];
  const forms = new Set([digits]);
  const international = digits.startsWith("0044") ? digits.slice(2) : digits;
  forms.add(international);
  if (international.startsWith("44") && international.length >= 7) {
    forms.add(`0${international.slice(2).replace(/^0/, "")}`);
  } else if (digits.startsWith("0") && !digits.startsWith("00") && digits.length >= 4) {
    forms.add(`44${digits.slice(1)}`);
  }
  return [...forms];
}

/** Pure, read-only filtering. Apply before pagination and status counts. */
export function createProspectSearchMatcher(value: unknown) {
  const query = normaliseProspectSearch(value);
  if (!query) return (_prospect: SearchableProspect) => true;
  const folded = fold(query);
  // Punctuation alone must not turn into an empty match-all term.
  if (!folded.trim()) return (_prospect: SearchableProspect) => false;
  const terms = folded.split(/\s+/);
  const phoneOnly = /^[+\d\s().-]+$/.test(query) && query.replace(/\D/g, "").length >= 3;
  const queryPhones = phoneOnly ? phoneForms(query) : [];

  return (prospect: SearchableProspect) => {
    const text = fold([prospect.firstName, prospect.lastName, prospect.email].filter(Boolean).join(" "));
    const phones = phoneForms(prospect.phone ?? "");
    if (phoneOnly) {
      return text.includes(folded) || queryPhones.some((part) => phones.some((phone) => phone.includes(part)));
    }
    return terms.every((term) => text.includes(term) || (
      /^\+?\d{3,}$/.test(term) && phoneForms(term).some((part) => phones.some((phone) => phone.includes(part)))
    ));
  };
}
