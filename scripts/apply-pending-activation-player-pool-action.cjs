const fs = require("node:fs");
const path = require("node:path");

const pagePath = path.join(
  process.cwd(),
  "src/app/captain/team/[teamid]/squad/page.tsx",
);

let source = fs.readFileSync(pagePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in captain squad page.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  'import FormListboxField from "@/components/ui/FormListboxField";',
  [
    'import PendingActivationPlayerPoolButton from "@/components/captain/PendingActivationPlayerPoolButton";',
    'import FormListboxField from "@/components/ui/FormListboxField";',
  ].join("\n"),
  "pending activation PlayerPool component import",
);

replaceRequired(
  '} from "./actions";',
  [
    '} from "./actions";',
    'import { addPlayerPoolPlayerToSquadAction } from "../player-pool/actions";',
  ].join("\n"),
  "PlayerPool squad action import",
);

const responseType = [
  'type PlayerInterestResponseRow = {',
  '  id: string;',
  '  teamMemberId: string | null;',
  '  prospectId: string | null;',
  '  response: string;',
  '  respondedAt: Date;',
  '};',
].join("\n");

const approvalType = [
  responseType,
  '',
  'type PendingPlayerPoolApprovalRow = {',
  '  requestId: string;',
  '  profileId: string;',
  '  publicCode: string;',
  '  firstName: string;',
  '  lastName: string | null;',
  '  email: string | null;',
  '  phone: string | null;',
  '  squadProspectId: string | null;',
  '  introducedAt: Date | null;',
  '};',
].join("\n");

replaceRequired(
  responseType,
  approvalType,
  "approved PlayerPool row type",
);

const managedTeamMarker = '  const isManagedTeam = team.teamMode === TeamMode.MANAGED;';
const approvalsQuery = [
  managedTeamMarker,
  '',
  '  const pendingPlayerPoolApprovals = isManagedTeam',
  '    ? await prisma.$queryRaw<PendingPlayerPoolApprovalRow[]>`',
  '        SELECT',
  '          request."id" AS "requestId",',
  '          profile."id" AS "profileId",',
  '          profile."publicCode",',
  '          pool_prospect."firstName",',
  '          pool_prospect."lastName",',
  '          pool_prospect."email",',
  '          pool_prospect."phone",',
  '          squad_prospect."id" AS "squadProspectId",',
  '          request."introducedAt"',
  '        FROM "PlayerPoolIntroductionRequest" request',
  '        JOIN "PlayerPoolProfile" profile ON profile."id" = request."profileId"',
  '        JOIN "TeamPlayerProspect" pool_prospect ON pool_prospect."id" = profile."prospectId"',
  '        LEFT JOIN "TeamPlayerProspect" squad_prospect',
  '          ON squad_prospect."teamId" = request."teamId"',
  '         AND squad_prospect."email" IS NOT NULL',
  '         AND pool_prospect."email" IS NOT NULL',
  '         AND LOWER(TRIM(squad_prospect."email")) = LOWER(TRIM(pool_prospect."email"))',
  '        WHERE request."teamId" = ${team.id}',
  "          AND request.\"status\" = 'INTRODUCED'",
  '          AND NOT EXISTS (',
  '            SELECT 1',
  '            FROM "TeamMember" member',
  '            JOIN "User" member_user ON member_user."id" = member."userId"',
  '            WHERE member."teamId" = request."teamId"',
  '              AND member_user."email" IS NOT NULL',
  '              AND pool_prospect."email" IS NOT NULL',
  '              AND LOWER(TRIM(member_user."email")) = LOWER(TRIM(pool_prospect."email"))',
  '          )',
  '        ORDER BY COALESCE(request."introducedAt", request."requestedAt") DESC',
  '      `',
  '    : [];',
].join("\n");

replaceRequired(
  managedTeamMarker,
  approvalsQuery,
  "approved PlayerPool query",
);

const prospectCommsBlock = [
  "                            {canOpenAdminComms ? (",
  "                              <CommunicationButton",
  "                                href={`/admin/teams/${teamid}/prospects/${prospect.id}/communications`}",
  '                                label="Prospect comms"',
  "                              />",
  "                            ) : null}",
].join("\n");

const prospectCommsWithPlayerPool = [
  prospectCommsBlock,
  "                            {canOpenAdminComms ? (",
  "                              <PendingActivationPlayerPoolButton",
  "                                teamId={teamid}",
  "                                prospectId={prospect.id}",
  '                                playerName={fullName || "this player"}',
  "                                hasEmail={hasEmail}",
  "                              />",
  "                            ) : null}",
].join("\n");

replaceRequired(
  prospectCommsBlock,
  prospectCommsWithPlayerPool,
  "pending activation card action area",
);

const squadGridAnchor = '      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">';
const approvalPanel = [
  '      {pendingPlayerPoolApprovals.length > 0 ? (',
  '        <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.08] p-6">',
  '          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">',
  '            <div>',
  '              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/70">',
  '                PlayerPool approvals',
  '              </p>',
  '              <h2 className="mt-2 text-xl font-semibold text-white">Approved players waiting to join</h2>',
  '              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">',
  '                SIXFL has approved these introductions. They are not active squad players yet, so they stay here until the player agrees to join.',
  '              </p>',
  '            </div>',
  '            <Link',
  '              href={`/captain/team/${teamid}/player-pool`}',
  '              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15"',
  '            >',
  '              Open PlayerPool',
  '            </Link>',
  '          </div>',
  '',
  '          <div className="mt-5 grid gap-3 lg:grid-cols-2">',
  '            {pendingPlayerPoolApprovals.map((player) => {',
  '              const fullName = [player.firstName, player.lastName].filter(Boolean).join(" ").trim();',
  '',
  '              return (',
  '                <article',
  '                  key={player.requestId}',
  '                  className="rounded-2xl border border-white/10 bg-black/20 p-4"',
  '                >',
  '                  <div className="flex flex-wrap items-start justify-between gap-3">',
  '                    <div>',
  '                      <div className="flex flex-wrap items-center gap-2">',
  '                        <span className="font-mono text-xs font-bold text-sky-200">{player.publicCode}</span>',
  '                        <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">',
  '                          Approved · waiting for player',
  '                        </span>',
  '                      </div>',
  '                      <div className="mt-2 text-base font-semibold text-white">',
  '                        {fullName || player.email || "PlayerPool player"}',
  '                      </div>',
  '                      <div className="mt-1 text-sm text-white/55">',
  '                        {player.email || "No email saved"}',
  '                        {player.phone ? ` · ${player.phone}` : ""}',
  '                      </div>',
  '                      {player.introducedAt ? (',
  '                        <div className="mt-1 text-xs text-white/40">',
  '                          Approved {formatUkDateTime(player.introducedAt)}',
  '                        </div>',
  '                      ) : null}',
  '                    </div>',
  '                  </div>',
  '',
  '                  <div className="mt-4 border-t border-white/10 pt-4">',
  '                    {player.squadProspectId ? (',
  '                      <form action={addPlayerPoolPlayerToSquadAction}>',
  '                        <input type="hidden" name="teamid" value={teamid} />',
  '                        <input type="hidden" name="profileId" value={player.profileId} />',
  '                        <input type="hidden" name="prospectId" value={player.squadProspectId} />',
  '                        <button',
  '                          type="submit"',
  '                          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-black transition hover:bg-emerald-300 sm:w-auto"',
  '                        >',
  '                          Add to squad',
  '                        </button>',
  '                      </form>',
  '                    ) : (',
  '                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">',
  '                        The team prospect link is missing. Open PlayerPool so SIXFL can repair this introduction before adding the player.',
  '                      </div>',
  '                    )}',
  '                  </div>',
  '                </article>',
  '              );',
  '            })}',
  '          </div>',
  '        </section>',
  '      ) : null}',
  '',
  squadGridAnchor,
].join("\n");

replaceRequired(
  squadGridAnchor,
  approvalPanel,
  "approved PlayerPool squad panel",
);

fs.writeFileSync(pagePath, source, "utf8");

const finalSource = fs.readFileSync(pagePath, "utf8");
if (
  !finalSource.includes("PendingActivationPlayerPoolButton") ||
  !finalSource.includes("prospectId={prospect.id}") ||
  !finalSource.includes("hasEmail={hasEmail}") ||
  !finalSource.includes("pendingPlayerPoolApprovals") ||
  !finalSource.includes("Approved players waiting to join") ||
  !finalSource.includes("addPlayerPoolPlayerToSquadAction")
) {
  throw new Error(
    "Captain squad PlayerPool actions and approved-player panel were not mounted correctly.",
  );
}

console.log(
  "Captain squad now shows approved PlayerPool players until they join, alongside pending activation controls.",
);
