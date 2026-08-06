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

// The fixture query already has an OR for home/away team. Use AND to combine
// that team condition with the upcoming-or-past timing condition so Prisma does
// not receive two OR properties in the same object literal.
lib = lib.replace(
  '      status: FixtureStatus.SCHEDULED,\n      kickoffAt: { gt: new Date() },\n      OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],',
  '      AND: [\n        {\n          OR: [\n            { status: FixtureStatus.SCHEDULED, kickoffAt: { gt: new Date() } },\n            {\n              status: FixtureStatus.COMPLETED,\n              kickoffAt: {\n                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),\n                lte: new Date(),\n              },\n            },\n          ],\n        },\n        { OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }] },\n      ],',
);

lib = lib.replace(
  '  const expiresAt = new Date(\n    Math.min(fixture.kickoffAt.getTime(), now.getTime() + PASS_LIFETIME_MS),\n  );',
  '  const pastFixture = fixture.kickoffAt <= now;\n  const expiresAt = pastFixture\n    ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)\n    : new Date(Math.min(fixture.kickoffAt.getTime(), now.getTime() + PASS_LIFETIME_MS));',
);

lib = lib.replace(
  '        status: FixtureStatus.SCHEDULED,\n        kickoffAt: { gt: new Date() },\n        OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }],',
  '        AND: [\n          {\n            OR: [\n              { status: FixtureStatus.SCHEDULED, kickoffAt: { gt: new Date() } },\n              {\n                status: FixtureStatus.COMPLETED,\n                kickoffAt: {\n                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),\n                  lte: new Date(),\n                },\n              },\n            ],\n          },\n          { OR: [{ homeTeamId: input.teamId }, { awayTeamId: input.teamId }] },\n        ],',
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
  '      `I can play for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`,',
  '      pass.isPast\n        ? `I played for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`\n        : `I can play for ${pass.teamName} against ${pass.opponentName} on ${formatDateTime(pass.kickoffAt)}.`,',
);
component = component.replace(
  '      "Add this pass to that fixture in the SIXFL Matchday Squad page.",',
  '      pass.isPast\n        ? "SIXFL has already sent my claim to the captain automatically. This code is only a backup."\n        : "SIXFL has already sent my request to the captain automatically. This code is only a backup.",',
);
component = component.replace(
  '      setMessage(`Your one-time pass ${payload.pass.code} is ready to share.`);',
  '      setMessage(`Request sent automatically to ${payload.pass.teamName}. You do not need to share the code unless the captain cannot see your request.`);',
);
component = component.replace(
  '{captainMatch ? "Add a temporary player" : "Share a temporary-player pass"}',
  '{captainMatch ? "Add a temporary player" : "Play for another team"}',
);
component = component.replace(
  '                    : "Choose the team and fixture you are offering to play in. You stay in control: the pass works once, expires automatically and can be cancelled before the captain accepts it."}',
  '                    : "Choose the team and fixture you want to play in. When you send the request, it appears automatically for that captain to accept or decline. You do not need to share the code unless they cannot see the request."}',
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
  '{busy\n                        ? "Sending request…"\n                        : pastChoices.some((choice) => `${choice.fixtureId}|${choice.teamId}` === selection)\n                          ? "Send past-match claim"\n                          : "Send request to captain"}',
);
component = component.replace(
  '                    No suitable published fixtures were found in the next three weeks. The team may need to publish or confirm the fixture first.',
  '                    No suitable upcoming fixtures or completed matches from the last 30 days were found. Upcoming fixtures must be published; past matches must be recorded as completed.',
);
component = component.replace(
  '                {message ? <p',
  '                {pastChoices.length > 0 ? (\n                  <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.08] p-4 text-sm leading-6 text-sky-100">\n                    <div className="font-semibold">Played previously?</div>\n                    <p className="mt-1 text-sky-100/75">Choose a completed match from the last 30 days and send a claim. The captain will see it automatically and must accept it before the appearance is linked to your account.</p>\n                  </div>\n                ) : null}\n\n                {message ? <p',
);
component = component.replace(
  '<h3 className="font-semibold text-white">Passes waiting for a captain</h3>',
  '<h3 className="font-semibold text-white">Requests waiting for a captain</h3>',
);
component = component.replace(
  '<p className="mt-2 text-center text-xs text-white/50">Expires {formatDateTime(pass.expiresAt)}</p>',
  '<p className="mt-2 text-center text-xs leading-5 text-white/55">Request sent automatically · expires {formatDateTime(pass.expiresAt)}. The code below is only a backup if the captain cannot see the request.</p>',
);
component = component.replace(
  '                            Share pass',
  '                            Share backup code',
);

write(componentPath, component);
require("./apply-temporary-player-team-label-clarity.cjs");

console.log("Past temporary-player claims and automatic captain-request wording are applied.");
