const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }

test('admin Captain view always enters the exact captain-only preview', () => {
  const teamPage = read('src/app/(admin)/admin/teams/[id]/page.tsx');
  const teamLayout = read('src/app/(admin)/admin/teams/[id]/layout.tsx');
  const squadPage = read('src/app/(admin)/admin/teams/[id]/squad/page.tsx');
  const previewRoute = read('src/app/(admin)/admin/teams/[id]/captain-preview/route.ts');
  const access = read('src/lib/requireCaptain.ts');

  assert.match(teamPage, /captain-preview/);
  assert.match(teamPage, /Captain view \(exact\)/);
  assert.match(teamLayout, /Admin tools \(captain layout\)/);
  assert.match(teamLayout, /Captain view \(exact\)/);
  assert.match(squadPage, /Captain view \(exact\)/);
  assert.match(squadPage, /captain-preview/);
  assert.match(squadPage, /Open managed squad tools/);
  assert.match(previewRoute, /CAPTAIN_ONLY_PREVIEW_COOKIE/);
  assert.match(previewRoute, /response\.cookies\.set\(CAPTAIN_ONLY_PREVIEW_COOKIE, id/);
  assert.match(access, /isCaptainOnlyPreview/);
  assert.match(access, /const isAdmin = Boolean\(rawIsAdmin && !isCaptainOnlyPreview\)/);
  assert.match(access, /isCaptainOnlyPreview && user[\s\S]*role: UserRole\.USER/);
  assert.match(access, /accessMode: isCaptainOnlyPreview \? "captain-preview" : "captain"/);
});

test('squad numbers are shared captain/admin profile data with duplicate protection', () => {
  const migration = read('prisma/migrations/20260919151000_team_member_squad_number/migration.sql');
  const profiles = read('src/lib/teamMemberProfiles.ts');
  const editPage = read('src/app/captain/team/[teamid]/squad/[membershipId]/edit/page.tsx');
  const editAction = read('src/app/captain/team/[teamid]/squad/edit-actions.ts');
  const captainSquad = read('src/app/captain/team/[teamid]/captain-squad/page.tsx');
  const adminSquad = read('src/app/(admin)/admin/teams/[id]/squad/page.tsx');
  const adminActions = read('src/app/(admin)/admin/teams/[id]/squad/actions.ts');

  assert.match(migration, /"squadNumber" INTEGER/);
  assert.match(migration, /BETWEEN 1 AND 99/);
  assert.match(profiles, /squadNumber: number \| null/);
  assert.match(editPage, /label="Squad number"/);
  assert.match(editAction, /Squad number must be between 1 and 99/);
  assert.match(editAction, /already used by another player/);
  assert.match(captainSquad, /name="squadNumber"/);
  assert.match(captainSquad, /profile\.squadNumber/);
  assert.match(adminSquad, /name="squadNumber"/);
  assert.match(adminSquad, /profile\.squadNumber/);
  assert.match(adminActions, /squadNumber/);
  assert.match(adminActions, /already used by another player/);
});
