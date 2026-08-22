export const TEAM_NAME_REVIEW_MARKER = "[TEAM NAME REVIEW REQUIRED]";

export type TeamNameSuitabilityReview = {
  requiresReview: boolean;
  category: string | null;
};

type ReviewRule = {
  category: string;
  pattern: RegExp;
};

const REVIEW_RULES: ReviewRule[] = [
  {
    category: "potential disability slur",
    pattern: /\b(?:mong|mongs|mongoid|mongoids|retard|retards|retarded|spastic|spastics)\b/i,
  },
  {
    category: "potential racial or ethnic slur",
    pattern: /\b(?:nigger|niggers|nigga|niggas|chink|chinks|paki|pakis|gook|gooks|coon|coons)\b/i,
  },
  {
    category: "potential homophobic or transphobic slur",
    pattern: /\b(?:fag|fags|faggot|faggots|tranny|trannies)\b/i,
  },
  {
    category: "potentially obscene public branding",
    pattern: /\b(?:cunt|cunts|motherfucker|motherfuckers|fucker|fuckers|fucking)\b/i,
  },
  {
    category: "potential extremist branding",
    pattern: /\b(?:nazi|nazis|kkk|isis)\b/i,
  },
];

function normaliseForReview(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assessTeamNameSuitability(
  teamName: string | null | undefined,
): TeamNameSuitabilityReview {
  const normalised = normaliseForReview(teamName ?? "");
  if (!normalised) return { requiresReview: false, category: null };

  for (const rule of REVIEW_RULES) {
    if (rule.pattern.test(normalised)) {
      return { requiresReview: true, category: rule.category };
    }
  }

  return { requiresReview: false, category: null };
}

export function buildTeamNameReviewMessage(input: {
  message?: string | null;
  review: TeamNameSuitabilityReview;
}) {
  const message = input.message?.trim() ?? "";
  if (!input.review.requiresReview) return message;

  const reviewNote = [
    TEAM_NAME_REVIEW_MARKER,
    `Reason: ${input.review.category ?? "public branding suitability"}.`,
    "Hold for SIXFL admin review before the team name or badge is used publicly. This is a review trigger, not an automatic rejection.",
  ].join("\n");

  return message ? `${reviewNote}\n\n${message}` : reviewNote;
}

export function isTeamNameReviewMessage(message: string | null | undefined) {
  return Boolean(message?.includes(TEAM_NAME_REVIEW_MARKER));
}
