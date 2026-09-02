const fs = require("node:fs");
const path = require("node:path");

const relative = "src/app/captain/team/[teamid]/captain-squad/page.tsx";
const full = path.join(process.cwd(), relative);
if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);

let source = fs.readFileSync(full, "utf8");
let changed = false;

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Could not find ${label}`);
  source = source.replace(oldText, newText);
  changed = true;
}

replaceOnce(
  '  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;\n  const phone = String(formData.get("phone") ?? "").trim() || null;',
  '  const email = String(formData.get("email") ?? "").trim().toLowerCase();\n  const phone = String(formData.get("phone") ?? "").trim();',
  "captain player email/phone parsing",
);

replaceOnce(
  '  if (!displayName) {\n    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Enter the player name.")}`);\n  }',
  '  if (!displayName) {\n    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Enter the player name.")}`);\n  }\n  if (!email) {\n    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Enter the player email address. The player must verify this address before they count as registered.")}`);\n  }\n  if (!phone) {\n    redirect(`/captain/team/${teamid}/captain-squad?error=${encodeURIComponent("Enter the player mobile/SMS number.")}`);\n  }',
  "captain player required-field validation",
);

replaceOnce(
  '    select: { id: true, teamMode: true },',
  '    select: { id: true, name: true, teamMode: true },',
  "captain player team name select",
);

replaceOnce(
  '  let user = email\n    ? await prisma.user.findUnique({ where: { email }, select: { id: true } })\n    : null;',
  '  let user = await prisma.user.findUnique({\n    where: { email },\n    select: { id: true, emailVerified: true },\n  });',
  "captain player user lookup",
);

replaceOnce(
  '      data: { name: displayName, email },\n      select: { id: true },',
  '      data: { name: displayName, email },\n      select: { id: true, emailVerified: true },',
  "captain player user creation select",
);

replaceOnce(
  '  revalidatePath(`/captain/team/${teamid}`);\n  revalidatePath(`/captain/team/${teamid}/captain-squad`);',
  '  await sendDashboardLoginEmail({\n    email,\n    displayName,\n    teamName: team.name,\n    callbackPath: `/player/team/${teamid}`,\n  });\n\n  revalidatePath(`/captain/team/${teamid}`);\n  revalidatePath(`/captain/team/${teamid}/captain-squad`);',
  "automatic player verification email",
);

replaceOnce(
  '      return "Player added to your squad.";',
  '      return "Player added. We have emailed them a verification link. They count as registered once they use that link.";',
  "player added feedback",
);

replaceOnce(
  '              email: true,\n            },',
  '              email: true,\n              emailVerified: true,\n            },',
  "member email verification select",
);

replaceOnce(
  '                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>\n                          {getRoleLabel(member.role)}\n                        </span>',
  '                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClasses(member.role)}`}>\n                          {getRoleLabel(member.role)}\n                        </span>\n                        {member.user.emailVerified ? (\n                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Email verified</span>\n                        ) : (\n                          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">Pending verification</span>\n                        )}',
  "verification status badge",
);

replaceOnce(
  '                Add a basic player record now so they can be picked for goals, assists and Player of the Match. Add an email if you want to send a dashboard login link.',
  '                Enter the player name, email and mobile number. We will email the player a secure verification link. Until they use it, they are shown as pending and do not count as a verified registered player.',
  "captain player form guidance",
);

replaceOnce(
  '                  <span>Email optional</span>\n                  <input\n                    name="email"\n                    type="email"',
  '                  <span>Email</span>\n                  <input\n                    name="email"\n                    type="email"\n                    required',
  "required email field",
);

replaceOnce(
  '                  <span>Phone optional</span>\n                  <input\n                    name="phone"',
  '                  <span>Mobile / SMS number</span>\n                  <input\n                    name="phone"\n                    required',
  "required phone field",
);

if (!source.includes("Pending verification")) throw new Error("Verification badge was not installed.");
if (!source.includes("The player must verify this address")) throw new Error("Server-side email requirement was not installed.");
if (!source.includes("await sendDashboardLoginEmail({\n    email,")) throw new Error("Automatic verification email was not installed.");

if (changed) {
  fs.writeFileSync(full, source, "utf8");
  console.log("Player registration now requires email/mobile and email verification.");
} else {
  console.log("Player email verification already applied.");
}
