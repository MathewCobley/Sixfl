const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const launcher = read("src/components/admin/leads/LeadDiallerLaunchButton.tsx");
const queuePage = read("src/app/(admin)/admin/leads/call-queue/page.tsx");
const queue = read("src/components/admin/leads/LeadDiallerQueue.tsx");
const voice = read("src/app/api/twilio/lead-dialler/voice/route.ts");

test("lead dialler launch preserves the active Leads filters", () => {
  assert.match(launcher, /FILTER_KEYS = \["type", "status", "area", "night"\]/);
  assert.match(launcher, /searchParams\.get\(key\)/);
  assert.match(launcher, /`\/admin\/leads\/call-queue\?\$\{query\}`/);
  assert.match(launcher, /Call filtered leads/);
});

test("call queue applies all Leads filters before the callable-lead guard", () => {
  assert.match(queuePage, /selectedType/);
  assert.match(queuePage, /selectedStatus/);
  assert.match(queuePage, /selectedArea/);
  assert.match(queuePage, /selectedNight/);
  assert.match(queuePage, /preferredNights: \{ some: \{ night: selectedNight \} \}/);
  assert.match(queuePage, /status: \{ in: \["NEW", "CONTACTED", "QUALIFIED"\] \}/);
  assert.match(queuePage, /normalizeUkMobileNumber\(lead\.phoneNormalized \|\| lead\.phone\)/);
  assert.match(queuePage, /backHref=\{backHref\}/);
});

test("Auto Dial is progressive: one call at a time, no-answer advances, answered calls wait for outcome", () => {
  assert.match(queue, /if \(!target \|\| callRef\.current\) return/);
  assert.match(queue, /recordOutcomeForLead\(target, "NO_ANSWER"/);
  assert.match(queue, /continueAutoDial: true/);
  assert.match(queue, /if \(answered\) finishConversation\(\)/);
  assert.match(queue, /Auto Dial will continue with the next lead after you save it/);
  assert.match(queue, /Start Auto Dial/);
  assert.match(queue, /Pause Auto Dial/);
});

test("Twilio keeps the browser leg ringing until the lead answers", () => {
  assert.match(voice, /answerOnBridge: true/);
  assert.match(voice, /timeout: 25/);
  assert.match(voice, /dial\.number\(destination\)/);
});

test("voice caller ID can resolve from the Twilio account when no explicit env number is present", () => {
  assert.match(voice, /TWILIO_PHONE_NUMBER/);
  assert.match(voice, /TWILIO_FROM_NUMBER/);
  assert.match(voice, /incomingPhoneNumbers\.list/);
  assert.match(voice, /capabilities\?\.voice/);
});
