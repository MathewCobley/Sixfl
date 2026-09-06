# Search player prospects

On **Admin → Player prospects**, the **Search players** box accepts all or part of a name, email address or mobile number. Press **Enter** or **Search**. Name and email searches ignore case; name accents and apostrophes are tolerated. UK mobile searches accept spaces, punctuation and national/international prefixes.

Filtering runs on the server over all prospects before calculating status counts or selecting a page. It is not limited to the twelve currently visible cards. The existing league filter also applies. **Open pipeline**, **Active players**, **Duplicates** and **Not interested** each show the number of matches in that status. Switching status or page preserves the search. A new form submission starts on page one.

**Clear search** removes the name/email/mobile filter while preserving the selected league and status. **Clear league** keeps the search and status. Empty results distinguish matches in another status from no matches under the current search and league.

The search is a read-only GET form on the existing admin-protected page. It does not create, move or merge players, send invitations or alter payment records. No new database table, dependency or preparation script is required.

The regression workflow tests matching plus the actual server page after the complete production preparation chain with isolated data/auth fixtures: later-page matches, league/status filtering, URL continuity, pagination reset, empty results, safe escaping and admin access. A negative control removes the real search predicate and requires the later-page test to fail. Existing application type checks and build workflows also run.
