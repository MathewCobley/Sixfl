const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagePath = "src/app/(admin)/admin/teams/[id]/page.tsx";
const actionsPath = "src/app/(admin)/admin/teams/actions.ts";

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found.`);
  }
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Admin team page: load all current team members separately from the existing
// captain-only relation and offer them as primary-contact choices.
// ---------------------------------------------------------------------------
let page = read(pagePath);

const teamUsersLoad = `  const teamUsers = await prisma.teamMember.findMany({
    where: { teamId: id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

`;

if (!page.includes("const teamUsers = await prisma.teamMember.findMany")) {
  page = replaceRequired(
    page,
    `  if (!team) {
    notFound();
  }

  const { snapshot: contactSnapshot, recipient } =`,
    `  if (!team) {
    notFound();
  }

${teamUsersLoad}  const { snapshot: contactSnapshot, recipient } =`,
    "team user contact choices",
  );
}

const selectorMarkup = `              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
                <label htmlFor="primaryContactMemberId" className="text-sm font-semibold text-emerald-100">
                  Change primary contact
                </label>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  Choose an existing user from this team. When you save, SIXFL will use that user&apos;s name, email and saved squad mobile as the primary contact. Leave this blank to edit the fields manually.
                </p>
                <select
                  id="primaryContactMemberId"
                  name="primaryContactMemberId"
                  defaultValue=""
                  className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                >
                  <option value="">Keep current / enter manually</option>
                  {teamUsers.map((member) => {
                    const displayName = member.user.name?.trim() || member.user.email?.trim() || "Unnamed user";
                    const roleLabel = member.role === "CAPTAIN" ? "Captain" : "Player";
                    return (
                      <option key={member.id} value={member.id}>
                        {displayName}{member.user.email && member.user.email !== displayName ? ` · ${member.user.email}` : ""} · {roleLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

`;

if (!page.includes('name="primaryContactMemberId"')) {
  page = replaceRequired(
    page,
    `              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="contactName" className="text-sm text-white/60">
                    Primary contact name`,
    `${selectorMarkup}              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="contactName" className="text-sm text-white/60">
                    Primary contact name`,
    "primary contact selector UI",
  );
}

write(pagePath, page);

// ---------------------------------------------------------------------------
// Team update action: if an admin chose a team member, resolve contact details
// server-side. This prevents a submitted member ID from selecting somebody from
// another team and keeps the existing manual fields as a fallback.
// ---------------------------------------------------------------------------
let actions = read(actionsPath);

if (!actions.includes('from "@/lib/teamMemberProfiles"')) {
  actions = replaceRequired(
    actions,
    'import { getPhoneDisplayValue } from "@/lib/notifications/phone";',
    'import { getPhoneDisplayValue } from "@/lib/notifications/phone";\nimport { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";',
    "team member profile import",
  );
}

actions = replaceRequired(
  actions,
  `  const contactName = getTrimmedValue(formData.get("contactName")) || null;
  const contactEmail = getTrimmedValue(formData.get("contactEmail")) || null;
  const contactPhone = getStoredPhoneValue(formData.get("contactPhone"));
  const secondaryContactName =`,
  `  const primaryContactMemberId = getTrimmedValue(formData.get("primaryContactMemberId"));
  let contactName = getTrimmedValue(formData.get("contactName")) || null;
  let contactEmail = getTrimmedValue(formData.get("contactEmail")) || null;
  let contactPhone = getStoredPhoneValue(formData.get("contactPhone"));
  const secondaryContactName =`,
  "selected primary contact form value",
);

const contactResolution = `  if (primaryContactMemberId) {
    const selectedPrimaryContact = await prisma.teamMember.findFirst({
      where: {
        id: primaryContactMemberId,
        teamId: id,
      },
      select: {
        id: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (selectedPrimaryContact) {
      const profiles = await getTeamMemberProfilesByTeamMemberIds([
        selectedPrimaryContact.id,
      ]);
      const profile = profiles.get(selectedPrimaryContact.id) ?? null;

      contactName = selectedPrimaryContact.user.name?.trim() || null;
      contactEmail = selectedPrimaryContact.user.email?.trim() || null;
      contactPhone = getPhoneDisplayValue(profile?.phone) || null;
    }
  }

`;

if (!actions.includes("const selectedPrimaryContact = await prisma.teamMember.findFirst")) {
  actions = replaceRequired(
    actions,
    `  const leagueId = leagueIdRaw || null;
  const logoUrl = logoUrlRaw || null;

  await prisma.team.update({`,
    `  const leagueId = leagueIdRaw || null;
  const logoUrl = logoUrlRaw || null;

${contactResolution}  await prisma.team.update({`,
    "server-side primary contact resolution",
  );
}

write(actionsPath, actions);

if (
  !read(pagePath).includes('name="primaryContactMemberId"') ||
  !read(actionsPath).includes("selectedPrimaryContact.user.email") ||
  !read(actionsPath).includes("getTeamMemberProfilesByTeamMemberIds")
) {
  throw new Error("Primary contact team-user selector was not applied completely.");
}

console.log("Added admin primary-contact selector using existing team users.");
