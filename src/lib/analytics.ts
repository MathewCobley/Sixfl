// ========================================
// File: src/lib/analytics.ts
// ========================================

import { track } from "@vercel/analytics";

export type AnalyticsEventName =
  | "register_team_click"
  | "league_card_click"
  | "social_click";

export function trackEvent(
  eventName: AnalyticsEventName,
  properties?: Record<string, string | number | boolean>
) {
  track(eventName, properties);
}