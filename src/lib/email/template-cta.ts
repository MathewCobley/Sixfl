/** A shared public destination, not somebody else's personal referral code. */
export const REFERRAL_PAGE_CTA_KEY = "referralPageUrl";
export const REFERRAL_PAGE_URL = "https://www.sixfl.co.uk/player/referrals";

export function getStaticEmailCtaUrl(key: string | null | undefined): string | null {
  return key?.trim() === REFERRAL_PAGE_CTA_KEY ? REFERRAL_PAGE_URL : null;
}
