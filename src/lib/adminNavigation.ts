// ========================================
// File: src/lib/adminNavigation.ts
// ========================================

export const adminNavigationLinks = [
  {
    name: "Overview",
    href: "/admin",
    exact: true,
    icon: "shield",
    description: "Admin dashboard",
  },
  {
    name: "Search",
    href: "/admin/search",
    icon: "search",
    description: "Find by mobile or email",
  },
  {
    name: "Teams",
    href: "/admin/teams",
    icon: "teams",
    description: "Squads and captains",
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: "users",
    description: "Names and linked accounts",
  },
  {
    name: "Leagues",
    href: "/admin/leagues",
    icon: "trophy",
    description: "League setup",
  },
  {
    name: "Venues",
    href: "/admin/venues",
    icon: "map",
    description: "Match locations",
  },
  {
    name: "Fixtures",
    href: "/admin/fixtures",
    icon: "calendar",
    description: "Schedule and results",
  },
  {
    name: "Social",
    href: "/admin/social",
    icon: "photo",
    description: "Drafts and publishing",
  },
  {
    name: "Result Disputes",
    href: "/admin/results",
    icon: "warning",
    description: "Captain-raised issues",
  },
  {
    name: "Payments",
    href: "/admin/payments",
    icon: "document",
    description: "Charges and payments",
  },
  {
    name: "Subscriptions",
    href: "/admin/payments/subscriptions",
    icon: "card",
    description: "Recurring Stripe billing",
  },
  {
    name: "Referees",
    href: "/admin/referees",
    icon: "shield",
    description: "Officials and assignments",
  },
  {
    name: "Leads",
    href: "/admin/leads",
    icon: "users",
    description: "Inbound enquiries",
  },
  {
    name: "Communications",
    href: "/admin/messaging",
    icon: "document",
    description: "Email, SMS and history",
  },
  {
    name: "Queue",
    href: "/admin/queue",
    icon: "cog",
    description: "SMS and email dispatches",
  },
  {
    name: "Templates",
    href: "/admin/templates",
    icon: "document",
    description: "Email and SMS messaging",
  },
] as const;

export type AdminNavigationIcon = (typeof adminNavigationLinks)[number]["icon"];
