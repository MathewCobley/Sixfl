const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, source) => fs.writeFileSync(path.join(root, file), source, "utf8");

const libPath = "src/lib/temporary-player-passes.ts";
let lib = read(libPath);

lib = lib.replace(
  '  pitch: string | null;\n};',
  '  pitch: string | null;\n  isPast: boolean;\n};',
);

lib = lib.replace(
  '  const end = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);',
  '  const end = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);\n  const pastStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);',
);

lib = lib.replace(
  '        status: FixtureStatus.SCHEDULED,\n        kickoffAt: { gt: now, lte: end },',
  '        OR: [\n          { status: FixtureStatus.SCHEDULED, kickoffAt: { gt: now, lte: end } },\n          { status: FixtureStatus.COMPLETED, kickoffAt: { gte: pastStart, lte: now } },\n        ],',
);

lib = lib.replace(
  '      orderBy: { kickoffAt: "asc" },',
  '      orderBy: { kickoffAt: "desc" },',
);

lib = lib.replace(
  '        pitch: fixture.pitch,\n      });',
  '        pitch: fixture.pitch,\n        isPast: fixture.kickoffAt <= now,\n      });',
);

lib = lib.replace(
  '      fixture."kickoffAt", venue."name" AS "venueName", fixture."pitch"',
  '      fixture."kickoffAt", venue."name" AS "venueName", fixture."pitch",\n      (fixture."kickoffAt" <= NOW()) AS "isPast"',
);

lib = lib.replace(
  '      status: FixtureStatus.SCHEDULED,\n      kickoffAt: { gt: new Date() },',
  '      OR: [\n        { status: FixtureStatus.SCHEDULED, kickoffAt: { gt: new Date() } },\n        {\n          status: FixtureStatus.COMPLETED,\n          kickoffAt: {\n            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),\n            lte: new Date(),\n          },\n        },\n      ],',
);

lib = lib.replace(
  '  const expiresAt = new Date(\n    Math.min(fixture.kickoffAt.getTime(), now.getTime() + PASS_LIFETIME_MS),\n  );',
  '  const pastFixture = fixture.kickoffAt <= now;\n  const expiresAt = pastFixture\n    ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)\n    : new Date(Math.min(fixture.kickoffAt.getTime(), now.getTime() + PASS_LIFETIME_MS));',
);

lib = lib.replace(
  '        status: FixtureStatus.SCHEDULED,\n        kickoffAt: { gt: new Date() },',
  '        OR: [\n          { status: FixtureStatus.SCHEDULED, kickoffAt: { gt: new Date() } },\n          {\n            status: FixtureStatus.COMPLETED,\n            kickoffAt: {\n              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),\n              lte: new Date(),\n            },\n          },\n        ],',
);

write(libPath, lib);

const componentPath = "src/components/captain/TemporaryPlayerPassLauncher.tsx";
let component = read(componentPath);
component = component.replace(
  '  pitch: string | null;\n};',
  '  pitch: string | null;\n  isPast: boolean;\n};',
);
component = component.replace(
  '  const openPasses = useMemo(',
  '  const upcomingChoices = useMemo(\n    () => playerData?.choices.filter((choice) => !choice.isPast) ?? [],\n    [playerData],\n  );\n  const pastChoices = useMemo(\n    () => playerData?.choices.filter((choice) => choice.isPast) ?? [],\n    [playerData],\n  );\n\n  const openPasses = useMemo(',
);
component = component.replace(
  '      if (!selection && payload.choices[0]) {\n        setSelection(`${payload.choices[0].fixtureId}|${payload.choices[0].teamId}`);\n      }',
  '      if (!selection && payload.choices[0]) {\n        setSelection(`${payload.choices[0].fixtureId}|${payload.choices[0].teamId}`);\n      }',
);
component = component.replace(
  '      `I can play for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`,',
  '      pass.isPast\n        ? `I played for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`\n        : `I can play for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`,',
);
component = component.replace(
  '      "Add this pass to that fixture in the SIXFL Matchday Squad page.",',
  '      pass.isPast\n        ? "Please accept this claim against that completed fixture in SIXFL."\n        : "Add this pass to that fixture in the SIXFL Matchday Squad page.",',
);
component = component.replace(
  '                {playerData && playerData.choices.length > 0 ? (',
  '                {playerData && playerData.choices.length > 0 ? (',
);
component = component.replace(
  '                        {playerData.choices.map((choice) => (',
  '                        {upcomingChoices.length > 0 ? (\n                          <optgroup label="Upcoming fixtures">\n                            {upcomingChoices.map((choice) => (',
);
component = component.replace(
  '                          </option>\n                        ))}\n                      </select>',
  '                          </option>\n                            ))}\n                          </optgroup>\n                        ) : null}\n                        {pastChoices.length > 0 ? (\n                          <optgroup label="Past matches — claim an appearance">\n                            {pastChoices.map((choice) => (\n                              <option\n                                key={`past-${choice.fixtureId}:${choice.teamId}`}\n                                value={`${choice.fixtureId}|${choice.teamId}`}\n                              >\n                                {choice.teamName} · {formatDateTime(choice.kickoffAt)} vs {choice.opponentName}\n                              </option>\n                            ))}\n                          </optgroup>\n                        ) : null}\n                      </select>',
);
component = component.replace(
  '{busy ? "Creating pass…" : "Create one-time pass"}',
  '{busy\n                        ? "Creating pass…"\n                        : pastChoices.some((choice) => `${choice.fixtureId}|${choice.teamId}` === selection)\n                          ? "Create past-match claim"\n                          : "Create one-time pass"}',
);
component = component.replace(
  '                    No suitable published fixtures were found in the next three weeks. The team may need to publish or confirm the fixture first.',
  '                    No suitable upcoming fixtures or completed matches from the last 30 days were found. Upcoming fixtures must be published; past matches must be recorded as completed.',
);
component = component.replace(
  '                {message ? <p',
  '                {pastChoices.length > 0 ? (\n                  <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.08] p-4 text-sm leading-6 text-sky-100">\n                    <div className="font-semibold">Played previously?</div>\n                    <p className="mt-1 text-sky-100/75">Choose a completed match from the last 30 days and create a claim. The captain must accept it before the appearance is linked to your account.</p>\n                  </div>\n                ) : null}\n\n                {message ? <p',
);
write(componentPath, component);

console.log("Past temporary-player match claims are available for completed fixtures from the last 30 days.");
