const fs = require("node:fs");
const path = require("node:path");

function update(relativePath, transform) {
  const filePath = path.join(process.cwd(), relativePath);
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[team-referrals] no change: ${relativePath}`);
    return;
  }
  fs.writeFileSync(filePath, after);
  console.log(`[team-referrals] updated: ${relativePath}`);
}

update("src/app/(public)/register-interest/actions.ts", (source) => {
  let next = source;

  if (!next.includes('from "@/lib/team-referrals"')) {
    next = next.replace(
      'import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";',
      'import { queueLeadWelcomeNotifications } from "@/lib/notifications/transactional";\nimport { attachReferralToLead } from "@/lib/team-referrals";',
    );
  }

  if (!next.includes('const referralCode = String(formData.get("referralCode")')) {
    next = next.replace(
      '  const source = String(formData.get("source") ?? "").trim();',
      '  const source = String(formData.get("source") ?? "").trim();\n  const referralCode = String(formData.get("referralCode") ?? "")\n    .trim()\n    .toUpperCase();',
    );
  }

  if (!next.includes("attachReferralToLead({")) {
    next = next.replace(
      '  const logoUrl = "https://sixfl.co.uk/sixfl-email.png";',
      `  if (interestType === "TEAM" && referralCode) {\n    try {\n      await attachReferralToLead({\n        interestLeadId: createdLead.id,\n        referralCode,\n        leadEmail: email,\n      });\n    } catch (error) {\n      console.error("Team referral could not be recorded:", error);\n    }\n  }\n\n  const logoUrl = "https://sixfl.co.uk/sixfl-email.png";`,
    );
  }

  return next;
});

update("src/app/(public)/register-interest/page.tsx", (source) => {
  let next = source;

  if (!next.includes("  ref?: string;")) {
    next = next.replace("  night?: string;\n}>;", "  night?: string;\n  ref?: string;\n}>;");
  }

  if (!next.includes("const referralCode = String(sp.ref")) {
    next = next.replace(
      "  const success = sp.success === \"1\";",
      '  const success = sp.success === "1";\n  const referralCode = String(sp.ref ?? "").trim().toUpperCase();',
    );
  }

  if (!next.includes('name="referralCode"')) {
    const referralField = `\n              {leadType === "TEAM" ? (\n                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">\n                  <label htmlFor="referralCode" className="block text-sm font-bold text-emerald-100">\n                    Player referral code <span className="font-normal text-emerald-100/60">(optional)</span>\n                  </label>\n                  <p className="mt-1 text-xs leading-5 text-emerald-100/65">\n                    Enter the code of the SIXFL player who referred your team. They receive £75 after your team completes three matches.\n                  </p>\n                  <input\n                    id="referralCode"\n                    name="referralCode"\n                    defaultValue={referralCode}\n                    autoCapitalize="characters"\n                    className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 font-mono text-sm font-bold uppercase tracking-wider text-white outline-none placeholder:text-white/30 focus:border-emerald-400"\n                    placeholder="SIX-AB12CD34"\n                  />\n                </div>\n              ) : null}\n`;

    next = next.replace(
      /(<form\s+action=\{submitRegisterInterest\}[^>]*>)/,
      `$1${referralField}`,
    );
  }

  return next;
});

update("src/components/admin/AdminSidebar.tsx", (source) => {
  if (source.includes('href: "/admin/referrals"')) return source;

  return source.replace(
    `      {\n        name: "Teams",\n        href: "/admin/teams",\n        icon: UserGroupIcon,\n        description: "Squads",\n      },`,
    `      {\n        name: "Teams",\n        href: "/admin/teams",\n        icon: UserGroupIcon,\n        description: "Squads",\n      },\n      {\n        name: "Team referrals",\n        href: "/admin/referrals",\n        icon: CreditCardIcon,\n        description: "£75 rewards",\n      },`,
  );
});

update("src/app/player/team/[teamid]/page.tsx", (source) => {
  if (source.includes('href="/player/referrals"')) return source;

  const marker = '      <div className="mx-auto max-w-6xl space-y-8">';
  if (!source.includes(marker)) {
    throw new Error("Player dashboard content wrapper was not found for referral link insertion.");
  }

  const referralLink = `\n        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 sm:p-6">\n          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">\n            <div>\n              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75">Team referrals</p>\n              <h2 className="mt-2 text-xl font-semibold text-white">Refer a new team and earn £75</h2>\n              <p className="mt-2 text-sm leading-6 text-emerald-50/70">Share your private referral link. Your reward becomes due after the new team completes three matches.</p>\n            </div>\n            <Link\n              href="/player/referrals"\n              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-black text-black transition hover:bg-emerald-300"\n            >\n              Get my referral link\n            </Link>\n          </div>\n        </section>`;

  return source.replace(marker, `${marker}${referralLink}`);
});
