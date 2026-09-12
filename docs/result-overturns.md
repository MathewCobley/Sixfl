# Overturned results and predictor score policy

Admin → Fixtures → result → **Overturn result — competition decision**. Admin Results disputes also link here.

A real authenticated ADMIN chooses the awarded winner, reason, applicable rule version/sections, and records the evidence and opportunity to respond. A separate acknowledgement confirms the saved score is the actual result of a completed played match. No player-limit finding or sanction is inferred from a non-response. No real result changes on deployment; the administrator must submit the explicit decision.

The new immutable MatchResultOverturn audit keeps the original score, original entry time, both team identities/names, awarded score, reason, private evidence, rule basis, administrator and date. The existing MatchResult score becomes the official 3–0/0–3 competition result so the existing league table remains authoritative. The change is atomic and checked against the original form version. Duplicate submission of the same decision is idempotent; competing/stale decisions are rejected. Ordinary result edits/deletes cannot erase or overwrite an award. A further decision requires a separately designed audited review rather than silently editing history.

Predictor history, Elo, form, scoring rates, head-to-head and common opponents resolve to the preserved on-pitch score. Prediction loaders, historical recovery, accuracy monitoring and backtesting all retain/use that score; entry-time cutoffs are preserved. The award is never used to manufacture a sporting performance. No existing frozen predictions are rewritten by recording an overturn. New predictions and dynamically calculated probabilities use the on-pitch history.

Public league fixtures/results label the awarded result and show the original score. Internal evidence/administrator details are selected only by the admin result page. Existing player scorers and disputes are not automatically altered/closed; no payment, refund, charge, fine, notification or provider request is made. Communicate the decision to both captains separately.

This control is for completed played fixtures; abandoned/no-show fixtures are refused and stay in their existing separate workflow. A prediction input explicitly marked overturned but missing valid original scores is ignored, never guessed from the awarded score. There is no heuristic excluding genuine on-pitch 3–0 results and no retrospective reconstruction of scores already overwritten before this feature existed.
