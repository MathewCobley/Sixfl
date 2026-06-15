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
    exact: false,
    icon: "search",
    description: "Find by mobile or email",
  },
  {
    name: "Teams",
    href: "/admin/teams",
    exact: false,
    icon: "teams",
    description: "Squads and captains",
  },
  {
    name: "Users",
    href: "/admin/users",
    exact: false,
    icon: "users",
    description: "Names and linked accounts",
  },
  {
    name: "Leagues",
    href: "/admin/leagues",
    exact: false,
    icon: "trophy",
    description: "League setup",
  },
  {
    name: "Venues",
    href: "/admin/venues",
    exact: false,
    icon: "map",
    description: "Match locations",
  },
  {
    name: "Fixtures",
    href: "/admin/fixtures",
    exact: false,
    icon: "calendar",
    description: "Schedule and results",
  },
  {
    name: "Social",
    href: "/admin/social",
    exact: false,
    icon: "photo",
    description: "Drafts and publishing",
  },
  {
    name: "Result Disputes",
    href: "/admin/results",
    exact: false,
    icon: "warning",
    description: "Captain-raised issues",
  },
  {
    name: "Payments",
    href: "/admin/payments",
    exact: false,
    icon: "document",
    description: "Charges and payments",
  },
  {
    name: "Subscriptions",
    href: "/admin/payments/subscriptions",
    exact: false,
    icon: "card",
    description: "Recurring Stripe billing",
  },
  {
    name: "Referees",
    href: "/admin/referees",
    exact: false,
    icon: "shield",
    description: "Officials and assignments",
  },
  {
    name: "Leads",
    href: "/admin/leads",
    exact: false,
    icon: "users",
    description: "Inbound enquiries",
  },
  {
    name: "Communications",
    href: "/admin/messaging",
    exact: false,
    icon: "document",
    description: "Email, SMS and history",
  },
  {
    name: "Queue",
    href: "/admin/queue",
    exact: false,
    icon: "cog",
    description: "SMS and email dispatches",
  },
  {
    name: "Templates",
    href: "/admin/templates",
    exact: false,
    icon: "document",
    description: "Email and SMS messaging",
  },
] as const;

export type AdminNavigationIcon = (typeof adminNavigationLinks)[number]["icon"];
