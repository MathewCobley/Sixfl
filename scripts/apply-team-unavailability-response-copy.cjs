const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(filePath, before, after) {
  const absolutePath = path.join(root, filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected team-unavailability source was not found in ${filePath}`);
  }

  fs.writeFileSync(absolutePath, source.replace(before, after), "utf8");
}

const captainFixturePage = "src/app/captain/team/[teamid]/fixtures/page.tsx";

replaceOnce(
  captainFixturePage,
  `const TEAM_UNAVAILABLE_NOTE =
  "Team unavailable: captain has told SIXFL they cannot fulfil this fixture.";`,
  `const TEAM_UNAVAILABLE_NOTE_PREFIX =
  "Team unavailable: the captain selected “No — our team cannot play” on the SIXFL fixture page.";`,
);

replaceOnce(
  captainFixturePage,
  `    if (error.message.includes("Issue note must be at least")) {
      return "Please add a short note so SIXFL knows what the issue is.";
    }`,
  `    if (error.message.includes("Unavailability reason must be at least")) {
      return "Please briefly tell SIXFL why the whole team cannot play.";
    }
    if (error.message.includes("Issue note must be at least")) {
      return "Please add a short note so SIXFL knows what the issue is.";
    }`,
);

replaceOnce(
  captainFixturePage,
  `async function markFixtureUnavailableAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const access = await requireCaptain(teamid);

  try {
    await getConfirmableFixture(fixtureId, teamid);

    await prisma.fixtureCaptainConfirmation.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: teamid } },
      update: {
        status: "ISSUE_RAISED",
        note: TEAM_UNAVAILABLE_NOTE,
        issueRaisedAt: new Date(),
        confirmedAt: null,
        confirmedByUserId: access.user?.id ?? null,
      },
      create: {
        fixtureId,
        teamId: teamid,
        status: "ISSUE_RAISED",
        note: TEAM_UNAVAILABLE_NOTE,
        issueRaisedAt: new Date(),
        confirmedByUserId: access.user?.id ?? null,
      },
    });

    revalidateFixtureConfirmationPaths(teamid);
  } catch (error) {
    console.error("Captain fixture unavailable submission failed", error);
    redirect(buildFixtureRedirect(teamid, { fixtureId, error: getFriendlyErrorMessage(error) }));
  }

  redirect(buildFixtureRedirect(teamid, { fixtureId, saved: "unavailable" }));
}`,
  `async function markFixtureUnavailableAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const unavailableReason = String(
    formData.get("unavailableReason") ?? "",
  )
    .trim()
    .slice(0, 500);
  const access = await requireCaptain(teamid);

  try {
    if (unavailableReason.length < 5) {
      throw new Error("Unavailability reason must be at least 5 characters.");
    }

    await getConfirmableFixture(fixtureId, teamid);
    const note =
      TEAM_UNAVAILABLE_NOTE_PREFIX + " Reason given: " + unavailableReason;

    await prisma.fixtureCaptainConfirmation.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: teamid } },
      update: {
        status: "ISSUE_RAISED",
        note,
        issueRaisedAt: new Date(),
        confirmedAt: null,
        confirmedByUserId: access.user?.id ?? null,
      },
      create: {
        fixtureId,
        teamId: teamid,
        status: "ISSUE_RAISED",
        note,
        issueRaisedAt: new Date(),
        confirmedByUserId: access.user?.id ?? null,
      },
    });

    revalidateFixtureConfirmationPaths(teamid);
  } catch (error) {
    console.error("Captain fixture unavailable submission failed", error);
    redirect(buildFixtureRedirect(teamid, { fixtureId, error: getFriendlyErrorMessage(error) }));
  }

  redirect(buildFixtureRedirect(teamid, { fixtureId, saved: "unavailable" }));
}`,
);

replaceOnce(
  captainFixturePage,
  `SIXFL has been told that your team cannot play this fixture. The fixture is now flagged for review.`,
  `Your online response has been sent to SIXFL. The fixture is now flagged for review.`,
);

replaceOnce(
  captainFixturePage,
  `You can confirm yes at any time before kick-off. If you need to say no, change a response or raise an issue, use the online options until {FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off; after that, contact SIXFL directly.`,
  `Choose Yes when the whole team can fulfil the fixture. Choose No only when the whole team cannot fulfil it: a brief reason is required and SIXFL will be alerted immediately. You can use the online options until {FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off; after that, contact SIXFL directly.`,
);

replaceOnce(
  captainFixturePage,
  `                      <form action={markFixtureUnavailableAction}>
                        <input type="hidden" name="teamid" value={team.id} />
                        <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                        <button`,
  `                      <form
                        action={markFixtureUnavailableAction}
                        className="space-y-3 rounded-2xl border border-red-400/20 bg-red-500/[0.04] p-3"
                      >
                        <input type="hidden" name="teamid" value={team.id} />
                        <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                        <div>
                          <p className="text-sm font-semibold text-red-50">
                            Whole team cannot play?
                          </p>
                          <p className="mt-1 text-xs leading-5 text-red-100/65">
                            Only use this when the whole team cannot fulfil the fixture. Sending it immediately raises an issue for SIXFL to review.
                          </p>
                        </div>
                        <textarea
                          name="unavailableReason"
                          required
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          disabled={isSelectedFixtureUnavailable}
                          placeholder="Briefly tell SIXFL why the whole team cannot play."
                          className="w-full rounded-xl border border-red-400/20 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-red-300/45 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <button`,
);

replaceOnce(
  captainFixturePage,
  `{isSelectedFixtureUnavailable ? "✓ Team marked unavailable" : "No — we cannot play"}`,
  `{isSelectedFixtureUnavailable ? "✓ Team marked unavailable" : "Send — our team cannot play"}`,
);

replaceOnce(
  "src/lib/fixtures/confirmation-emails.ts",
  `Open the fixture and select either ‘Yes — we can play’ or ‘No — we cannot play’. This is the whole-team response; individual player availability is separate.`,
  `Open the fixture and select either ‘Yes — we can play’ or ‘No — our team cannot play’. Choose No only if the whole team cannot fulfil the fixture. You will be asked for a brief reason and SIXFL will be alerted immediately. Individual player availability is separate.`,
);

const reminderPath = "src/lib/fixtures/confirmation-reminders.ts";
const oldDefaultSms =
  "SIXFL: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}} here: {{link}}. Do not reply YES/NO - SMS replies do not confirm the fixture.";
const oldUrgentSms =
  "SIXFL URGENT: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}} here now: {{link}}. Do not reply YES/NO - SMS replies do not confirm the fixture.";
const newDefaultSms =
  "SIXFL: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}}: {{link}}. Use No only if the whole team cannot play; add a reason and SIXFL is alerted. Do not reply YES/NO.";
const newUrgentSms =
  "SIXFL URGENT: Confirm {{teamName}} v {{opponentName}}, {{kickoffDateTime}} now: {{link}}. Use No only if the whole team cannot play; it raises an issue for SIXFL. Do not reply YES/NO.";

replaceOnce(reminderPath, oldDefaultSms, newDefaultSms);
replaceOnce(reminderPath, oldUrgentSms, newUrgentSms);

replaceOnce(
  reminderPath,
  `const PREVIOUS_DEFAULT_CONFIRMATION_SMS_BODY =`,
  `const PREVIOUS_CLEAR_CONFIRMATION_SMS_BODY =
  "${oldDefaultSms}";
const PREVIOUS_CLEAR_URGENT_CONFIRMATION_SMS_BODY =
  "${oldUrgentSms}";
const PREVIOUS_DEFAULT_CONFIRMATION_SMS_BODY =`,
);

replaceOnce(
  reminderPath,
  `    body === PREVIOUS_DEFAULT_CONFIRMATION_SMS_BODY ||`,
  `    body === PREVIOUS_CLEAR_CONFIRMATION_SMS_BODY ||
    body === PREVIOUS_CLEAR_URGENT_CONFIRMATION_SMS_BODY ||
    body === PREVIOUS_DEFAULT_CONFIRMATION_SMS_BODY ||`,
);

console.log(
  "Applied clear online team-unavailability responses, required reasons and matching fixture confirmation copy.",
);
