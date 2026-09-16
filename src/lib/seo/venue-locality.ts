type VenueLocationInput = {
  name: string;
  address: string | null;
  postcode: string | null;
};

/** Presentation only: derive a locality from explicit place names already in
 * the saved address/name. Never turn "Yorkshire" into the city of York or
 * infer a league night, launch status, or town from a postcode prefix.
 */
export function getVenueLocality(venue: VenueLocationInput): string {
  const locations: ReadonlyArray<readonly [RegExp, string]> = [
    [/\btopcliffe\b/i, "Topcliffe"],
    [/\bapperley\s+bridge\b/i, "Apperley Bridge"],
    [/\bcolburn\b/i, "Colburn"],
    [/\bcatterick\s+garrison\b/i, "Catterick Garrison"],
    [/\bcatterick\b/i, "Catterick"],
    [/\bthirsk\b/i, "Thirsk"],
    [/\brawdon\b/i, "Rawdon"],
    [/\brichmond\b/i, "Richmond"],
    [/\bnorthallerton\b/i, "Northallerton"],
    [/\bharrogate\b/i, "Harrogate"],
    [/\bripon\b/i, "Ripon"],
    [/\bknaresborough\b/i, "Knaresborough"],
    [/\bboston\s+spa\b|\bwetherby\b/i, "Wetherby"],
    [/\bleeds\b/i, "Leeds"],
    [/\bbradford\b/i, "Bradford"],
    [/\byork\b/i, "York"],
  ];
  // A specific saved address takes precedence over a venue's brand/name.
  for (const text of [venue.address, venue.name]) {
    if (!text) continue;
    const match = locations.find(([pattern]) => pattern.test(text));
    if (match) return match[1];
  }
  return "SIXFL venue";
}
