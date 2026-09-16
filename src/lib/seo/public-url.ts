// Search metadata must agree with the existing www -> apex host redirect.
// Do not derive this from payment/auth/email or preview deployment variables.
export const PUBLIC_SITE_ORIGIN = "https://sixfl.co.uk";

/** A preferred public page URL, excluding tracking and registration parameters.
 * Call this only with an owned public route, not an arbitrary request URL.
 * Distinct routes (including league fixtures/stats/news) stay distinct.
 */
export function publicCanonicalUrl(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) {
    throw new Error("A public canonical URL requires a root-relative SIXFL route.");
  }
  const url = new URL(pathname, PUBLIC_SITE_ORIGIN);
  url.search = "";
  url.hash = "";
  return url.toString();
}
