// ========================================
// File: src/lib/emailTemplates.ts
// ========================================

// ========================================
// Types
// ========================================

export type LeadEmailTemplateKey =
  | "lead-response"
  | "team-follow-up"
  | "player-follow-up"
  | "referee-follow-up";

type TemplateInput = {
  firstName?: string;
};

// ========================================
// Helpers
// ========================================

function getGreetingName(firstName?: string) {
  return firstName?.trim() || "there";
}

// ========================================
// Individual Templates
// ========================================

export function sixflLeadResponseTemplate(data: TemplateInput) {
  const name = getGreetingName(data.firstName);

  return {
    subject: "SIXFL – Thanks for your interest",
    body: `Hi ${data.firstName ? name : "{{name}}"},

Thanks for your interest in SIXFL — great to hear from you.

We’re building properly run 6-a-side leagues with:
• Fixed weekly match nights
• Qualified referees
• Reliable fixtures (no last-minute dropouts)
• Live tables, results and player stats

We’re currently organising leagues in your area and are starting to place teams and players.

To get you set up, could you quickly confirm:
• Team or individual player
• Preferred location
• Preferred night(s)

Once we’ve grouped teams in your area, we’ll send over full league details, start dates, and next steps.

If you’ve got any questions in the meantime, just reply — happy to help.

Speak soon,
Mathew
SIXFL
6-a-side football. Done properly.`,
  };
}

export function sixflTeamFollowUpTemplate(data: TemplateInput) {
  const name = getGreetingName(data.firstName);

  return {
    subject: "SIXFL – Team registration follow-up",
    body: `Hi ${data.firstName ? name : "{{name}}"},

Thanks again for your interest in SIXFL.

We’re currently building out league places and speaking with teams interested in joining our launch leagues.

To help us place you correctly, could you reply with:
• Your preferred area
• Your preferred night(s)
• Whether you already have a full team squad

Once we’ve grouped enough teams in your area, we’ll send over the next steps, league details, and proposed start date.

Any questions, just reply to this email.

Speak soon,
Mathew
SIXFL
6-a-side football. Done properly.`,
  };
}

export function sixflPlayerFollowUpTemplate(data: TemplateInput) {
  const name = getGreetingName(data.firstName);

  return {
    subject: "SIXFL – Player registration follow-up",
    body: `Hi ${data.firstName ? name : "{{name}}"},

Thanks for registering your interest in SIXFL.

We’re currently organising leagues and building player lists in each launch area.

To help us match you to the right setup, could you reply with:
• Your preferred area
• Your preferred night(s)
• Whether you’re joining with friends or on your own

As soon as we have the right numbers in your area, we’ll be in touch with the next steps.

If you’ve got any questions in the meantime, just reply.

Speak soon,
Mathew
SIXFL
6-a-side football. Done properly.`,
  };
}

export function sixflRefereeFollowUpTemplate(data: TemplateInput) {
  const name = getGreetingName(data.firstName);

  return {
    subject: "SIXFL – Referee application follow-up",
    body: `Hi ${data.firstName ? name : "{{name}}"},

Thanks for your interest in refereeing with SIXFL.

We’re building properly run 6-a-side leagues and are currently speaking with referees for upcoming launch locations.

To help us progress your application, could you reply with:
• Your location
• Your availability
• Your refereeing experience / qualifications

Once we’ve finalised league nights and venues, we’ll be back in touch with next steps.

Any questions, just reply to this email.

Best,
Mathew
SIXFL
6-a-side football. Done properly.`,
  };
}

// ========================================
// Template Selector
// ========================================

export function getSixflLeadEmailTemplate(
  templateKey: LeadEmailTemplateKey,
  data: TemplateInput
) {
  if (templateKey === "lead-response") {
    return sixflLeadResponseTemplate(data);
  }

  if (templateKey === "team-follow-up") {
    return sixflTeamFollowUpTemplate(data);
  }

  if (templateKey === "player-follow-up") {
    return sixflPlayerFollowUpTemplate(data);
  }

  return sixflRefereeFollowUpTemplate(data);
}