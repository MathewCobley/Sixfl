const fs = require("node:fs");
const path = require("node:path");

function patchFile(relative, patch) {
  const full = path.join(process.cwd(), relative);
  if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);
  const original = fs.readFileSync(full, "utf8");
  const updated = patch(original);
  if (updated !== original) {
    fs.writeFileSync(full, updated, "utf8");
    console.log(`Applied player verification changes to ${relative}.`);
  }
}

patchFile("src/app/captain/team/[teamid]/captain-squad/page.tsx", (input) => {
  let source = input;

  if (source.includes('|| null;\n  const phone = String(formData.get("phone")')) {
    source = source.replace(
      '  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;\n  const phone = String(formData.get("phone") ?? "").trim() || null;',
      '  const email = String(formData.get("email") ?? "").trim().toLowerCase();\n  const phone = String(formData.get("phone") ?? "").trim();',
    );
  }

  if (!source.includes("The player must verify this address before they count as registered.")) {
    const marker = '  if (!displayName) {';
    const markerIndex = source.indexOf(marker);
    if (markerIndex === -1) throw new Error("Captain player name validation not found.");
    const closing = source.indexOf("\n  }", markerIndex);
    if (closing === -1) throw new Error("Captain player name validation closing brace not found.");
    const insertAt = closing + 4;
    source = `${source.slice(0, insertAt)}\n  if (!email) {\n    redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent("Enter the player email address. The player must verify this address before they count as registered.")}\`);\n  }\n  if (!phone) {\n    redirect(\`/captain/team/\${teamid}/captain-squad?error=\${encodeURIComponent("Enter the player mobile/SMS number.")}\`);\n  }${source.slice(insertAt)}`;
  }

  if (!source.includes('select: { id: true, name: true, teamMode: true },')) {
    source = source.replace(
      'select: { id: true, teamMode: true },',
      'select: { id: true, name: true, teamMode: true },',
    );
  }

  if (!source.includes('select: { id: true, emailVerified: true }')) {
    const legacyLookup = '  let user = email\n    ? await prisma.user.findUnique({ where: { email }, select: { id: true } })\n    : null;';
    if (source.includes(legacyLookup)) {
      source = source.replace(
        legacyLookup,
        '  let user = await prisma.user.findUnique({\n    where: { email },\n    select: { id: true, emailVerified: true },\n  });',
      );
    } else {
      const simpleLookup = '  let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });';
      if (source.includes(simpleLookup)) {
        source = source.replace(simpleLookup, '  let user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });');
      }
    }
  }

  if (!source.includes('select: { id: true, emailVerified: true },')) {
    source = source.replace(
      '      data: { name: displayName, email },\n      select: { id: true },',
      '      data: { name: displayName, email },\n      select: { id: true, emailVerified: true },',
    );
  }

  if (!source.includes('await sendDashboardLoginEmail({\n    email,')) {
    const revalidateMarker = '  revalidatePath(`/captain/team/${teamid}`);';
    const idx = source.indexOf(revalidateMarker);
    if (idx === -1) throw new Error("Captain player revalidation anchor not found.");
    source = `${source.slice(0, idx)}  await sendDashboardLoginEmail({\n    email,\n    displayName,\n    teamName: team.name,\n    callbackPath: \`/player/team/\${teamid}\`,\n  });\n\n${source.slice(idx)}`;
  }

  if (source.includes('return "Player added to your squad.";')) {
    source = source.replace(
      'return "Player added to your squad.";',
      'return "Player added. We have emailed them a secure link. They count as registered once their email has been verified.";',
    );
  }

  if (!source.includes("emailVerified: true,")) {
    const memberEmail = '              email: true,\n            },';
    if (source.includes(memberEmail)) {
      source = source.replace(memberEmail, '              email: true,\n              emailVerified: true,\n            },');
    }
  }

  if (!source.includes("Pending verification")) {
    const roleBadge = '                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>\n                          {getRoleLabel(member.role)}\n                        </span>';
    if (source.includes(roleBadge)) {
      source = source.replace(roleBadge, `${roleBadge}\n                        {member.user.emailVerified ? (\n                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Email verified</span>\n                        ) : (\n                          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">Pending verification</span>\n                        )}`);
    }
  }

  source = source.replace(
    'Add a basic player record now so they can be picked for goals, assists and Player of the Match. Add an email if you want to send a dashboard login link.',
    'Enter the player name, email and mobile number. We will email the player a secure verification/sign-in link. Until they use it, they are shown as pending and cannot be selected as a registered player.',
  );
  source = source.replace('<span>Email optional</span>', '<span>Email</span>');
  source = source.replace('<span>Phone optional</span>', '<span>Mobile / SMS number</span>');

  if (!/name="email"[\s\S]{0,100}required/.test(source)) {
    source = source.replace('                    type="email"\n                    placeholder=', '                    type="email"\n                    required\n                    placeholder=');
  }
  if (!/name="phone"[\s\S]{0,100}required/.test(source)) {
    source = source.replace('                    name="phone"\n                    placeholder=', '                    name="phone"\n                    required\n                    placeholder=');
  }

  if (!source.includes("The player must verify this address")) throw new Error("Server-side email requirement was not installed.");
  if (!source.includes('await sendDashboardLoginEmail({\n    email,')) throw new Error("Automatic verification email was not installed.");
  return source;
});

patchFile("src/app/captain/team/[teamid]/fixtures/[fixtureId]/selection/actions.ts", (input) => {
  let source = input;
  if (!source.includes("emailVerified: true,")) {
    const anchor = '            name: true,\n            email: true,\n          },';
    if (!source.includes(anchor)) throw new Error("Fixture selection player email anchor not found.");
    source = source.replace(anchor, '            name: true,\n            email: true,\n            emailVerified: true,\n          },');
  }
  if (!source.includes("This player has not verified their email address")) {
    const marker = '  if (!membership) {';
    const start = source.indexOf(marker);
    if (start === -1) throw new Error("Fixture selection membership validation not found.");
    const end = source.indexOf("\n  }", start);
    if (end === -1) throw new Error("Fixture selection membership validation closing brace not found.");
    const insertAt = end + 4;
    source = `${source.slice(0, insertAt)}\n  if (selectionStatus !== "NOT_SELECTED" && !membership.user.emailVerified) {\n    redirect(buildSelectionRedirect(teamid, fixtureId, \`?error=\${encodeURIComponent("This player has not verified their email address yet, so they are not eligible to be selected as a registered player.")}\`));\n  }${source.slice(insertAt)}`;
  }
  return source;
});

patchFile("src/auth.ts", (input) => {
  let source = input;
  if (!source.includes('async signIn({ user, account })')) {
    source = source.replace('async signIn({ user })', 'async signIn({ user, account })');
  }
  if (!source.includes('data: { emailVerified: new Date() }')) {
    const marker = '    async signIn({ user, account }) {';
    const idx = source.indexOf(marker);
    if (idx === -1) throw new Error("NextAuth sign-in event anchor not found.");
    const insertAt = idx + marker.length;
    source = `${source.slice(0, insertAt)}\n      if (account?.provider === "email" && user.id) {\n        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });\n      }${source.slice(insertAt)}`;
  }
  return source;
});

console.log("Player registration now requires a real, verified email before match selection.");
