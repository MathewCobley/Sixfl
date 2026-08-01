const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceOnce(filePath, before, after, label) {
  let source = read(filePath);
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${filePath}`);
  }
  source = source.replace(before, after);
  write(filePath, source);
}

const constantsPath = "src/lib/kits/constants.ts";
const actionsPath = "src/app/captain/team/[teamid]/kit/actions.ts";
const pagePath = "src/app/captain/team/[teamid]/kit/page.tsx";
const payPagePath = "src/app/pay/charge/[token]/page.tsx";

replaceOnce(
  constantsPath,
  "export const TEAM_KIT_QUANTITY = 9;",
  "export const TEAM_KIT_QUANTITY = 9;\nexport const EXTRA_TEAM_KIT_PRICE_PENCE = 2000;",
  "extra kit price constant",
);

replaceOnce(
  actionsPath,
  '"use server";\n\nimport { Prisma } from "@prisma/client";',
  '"use server";\n\nimport { randomBytes } from "node:crypto";\nimport {\n  NotificationAudience,\n  NotificationChannel,\n  NotificationRecipientSourceType,\n  Prisma,\n} from "@prisma/client";',
  "extra kit action imports",
);

replaceOnce(
  actionsPath,
  [
    "import {",
    "  TEAM_KIT_FIXED_SOCK_SIZE,",
    "  TEAM_KIT_QUANTITY,",
    "  isTeamKitSize,",
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  [
    "import {",
    "  EXTRA_TEAM_KIT_PRICE_PENCE,",
    "  TEAM_KIT_FIXED_SOCK_SIZE,",
    "  TEAM_KIT_QUANTITY,",
    "  isTeamKitSize,",
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  "extra kit price action import",
);

replaceOnce(
  actionsPath,
  'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";',
  [
    'import { queueDirectNotification } from "@/lib/notifications/service";',
    'import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";',
    'import { buildChargePaymentUrl } from "@/lib/payments/fixture-match-fees";',
  ].join("\n"),
  "extra kit notification imports",
);

const extraActionMarker = "export async function saveTeamKitOrderAction(formData: FormData) {";
const extraAction = `async function ensureKitPayerRecipient(input: {
  userId: string;
  name: string | null;
  email: string;
  teamId: string;
  teamName: string;
}) {
  const email = input.email.trim().toLowerCase();
  const recipient = await prisma.notificationRecipient.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: NotificationRecipientSourceType.USER,
        sourceId: input.userId,
      },
    },
    update: {
      audience: NotificationAudience.USER,
      displayName: input.name,
      email,
      emailNormalized: email,
      transactionalEmailOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        purpose: "extra_team_kit_payment",
      },
      lastSyncedAt: new Date(),
    },
    create: {
      sourceType: NotificationRecipientSourceType.USER,
      sourceId: input.userId,
      audience: NotificationAudience.USER,
      displayName: input.name,
      email,
      emailNormalized: email,
      transactionalEmailOptIn: true,
      metadata: {
        teamId: input.teamId,
        teamName: input.teamName,
        purpose: "extra_team_kit_payment",
      },
      lastSyncedAt: new Date(),
    },
  });

  await prisma.notificationPreference.upsert({
    where: { recipientId: recipient.id },
    update: { emailEnabled: true },
    create: { recipientId: recipient.id, emailEnabled: true },
  });

  return recipient;
}

export async function createExtraKitPaymentLinksAction(formData: FormData) {
  const teamId = readString(formData, "teamId");
  if (!teamId) redirect("/captain?error=missing_team");

  const access = await requireCaptain(teamId);
  const extraKitQuantity = Number(readString(formData, "extraKitQuantity"));
  const payerMemberIds = Array.from(
    new Set(
      formData
        .getAll("payerTeamMemberId")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  if (!Number.isInteger(extraKitQuantity) || extraKitQuantity < 1 || extraKitQuantity > 10) {
    redirect(\`/captain/team/\${teamId}/kit?extras=invalid_quantity\`);
  }
  if (payerMemberIds.length === 0) {
    redirect(\`/captain/team/\${teamId}/kit?extras=no_payers\`);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      members: {
        where: { id: { in: payerMemberIds } },
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!team || team.members.length !== payerMemberIds.length) {
    redirect(\`/captain/team/\${teamId}/kit?extras=invalid_payers\`);
  }
  if (team.members.some((member) => !member.user.email?.trim())) {
    redirect(\`/captain/team/\${teamId}/kit?extras=missing_email\`);
  }

  const existingOpenRequests = await prisma.paymentCharge.count({
    where: {
      teamId,
      title: { startsWith: "Additional kit contribution •" },
      status: { in: ["OPEN", "PART_PAID"] },
    },
  });
  if (existingOpenRequests > 0) {
    redirect(\`/captain/team/\${teamId}/kit?extras=already_open\`);
  }

  const totalPence = extraKitQuantity * EXTRA_TEAM_KIT_PRICE_PENCE;
  const baseSharePence = Math.floor(totalPence / team.members.length);
  const remainderPence = totalPence % team.members.length;
  const batchReference = randomBytes(8).toString("hex");

  const charges = await prisma.$transaction(
    team.members.map((member, index) => {
      const payerName = member.user.name || member.user.email || "Team member";
      const amountPence = baseSharePence + (index < remainderPence ? 1 : 0);
      return prisma.paymentCharge.create({
        data: {
          teamId,
          leagueId: team.leagueId,
          title: \`Additional kit contribution • \${payerName}\`,
          description: \`\${extraKitQuantity} additional complete team kit\${extraKitQuantity === 1 ? "" : "s"} for \${team.name} at £20 each. Equal-share payment request \${batchReference}.\`,
          amountPence,
          dueDate: new Date(),
          paymentToken: randomBytes(24).toString("hex"),
        },
        select: {
          id: true,
          paymentToken: true,
          amountPence: true,
        },
      });
    }),
  );

  for (let index = 0; index < team.members.length; index += 1) {
    const member = team.members[index];
    const charge = charges[index];
    if (!member || !charge?.paymentToken || !member.user.email) continue;

    const payerName = member.user.name || member.user.email;
    const recipient = await ensureKitPayerRecipient({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      teamId,
      teamName: team.name,
    });
    const paymentUrl = buildChargePaymentUrl(charge.paymentToken);
    const shareLabel = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(charge.amountPence / 100);

    await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.USER,
      subject: \`\${team.name} additional kit contribution\`,
      body: \`Hi \${payerName},\\n\\nYour captain has asked you to contribute \${shareLabel} towards \${extraKitQuantity} additional SIXFL team kit\${extraKitQuantity === 1 ? "" : "s"}.\\n\\nUse the secure payment link below.\`,
      isTransactional: true,
      sourceType: "EXTRA_TEAM_KIT_PAYMENT",
      sourceId: charge.id,
      metadata: {
        teamId,
        extraKitQuantity,
        batchReference,
        paymentChargeId: charge.id,
      },
      emailCta: {
        label: "Pay kit contribution",
        url: paymentUrl,
      },
      createdByUserId: access.user?.id ?? null,
    });
  }

  revalidatePath(\`/captain/team/\${teamId}/kit\`);
  revalidatePath(\`/captain/team/\${teamId}/payments\`);
  redirect(\`/captain/team/\${teamId}/kit?extras=sent\`);
}

`;
if (!read(actionsPath).includes("createExtraKitPaymentLinksAction")) {
  replaceOnce(
    actionsPath,
    extraActionMarker,
    extraAction + extraActionMarker,
    "extra kit payment action",
  );
}

replaceOnce(
  pagePath,
  [
    "import {",
    "  TEAM_KIT_QUANTITY,",
    "  TEAM_KIT_SIZE_GUIDE,",
    "  getTeamKitStatusLabel,",
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  [
    "import {",
    "  EXTRA_TEAM_KIT_PRICE_PENCE,",
    "  TEAM_KIT_QUANTITY,",
    "  TEAM_KIT_SIZE_GUIDE,",
    "  getTeamKitStatusLabel,",
    '} from "@/lib/kits/constants";',
  ].join("\n"),
  "extra kit page constant import",
);

replaceOnce(
  pagePath,
  'import { saveTeamKitOrderAction } from "./actions";',
  'import { createExtraKitPaymentLinksAction, saveTeamKitOrderAction } from "./actions";',
  "extra kit page action import",
);

replaceOnce(
  pagePath,
  [
    "type SearchParams = {",
    "  saved?: string;",
    "  submitted?: string;",
    "  error?: string;",
    "};",
  ].join("\n"),
  [
    "type SearchParams = {",
    "  saved?: string;",
    "  submitted?: string;",
    "  error?: string;",
    "  extras?: string;",
    "};",
  ].join("\n"),
  "extra kit search params",
);

replaceOnce(
  pagePath,
  [
    "      league: {",
    "        select: {",
    "          name: true,",
    "          season: true,",
    "        },",
    "      },",
  ].join("\n"),
  [
    "      league: {",
    "        select: {",
    "          name: true,",
    "          season: true,",
    "        },",
    "      },",
    "      members: {",
    "        orderBy: [{ role: \"asc\" }, { createdAt: \"asc\" }],",
    "        select: {",
    "          id: true,",
    "          user: { select: { id: true, name: true, email: true } },",
    "        },",
    "      },",
  ].join("\n"),
  "extra kit payer members",
);

const chargeQueryMarker = `  const selectedDesignId = order?.kitDesignId ?? null;`;
const chargeQuery = `  const extraKitCharges = await prisma.paymentCharge.findMany({
    where: {
      teamId: teamid,
      title: { startsWith: "Additional kit contribution •" },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
    include: {
      transactions: { select: { amountPence: true } },
    },
  });

`;
if (!read(pagePath).includes("const extraKitCharges = await prisma.paymentCharge.findMany")) {
  replaceOnce(
    pagePath,
    chargeQueryMarker,
    chargeQuery + chargeQueryMarker,
    "extra kit charge query",
  );
}

const panelMarker = `      {locked ? (`;
const panel = `      {sp.extras === "sent" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Extra-kit payment links have been emailed. The requests are shown below and also appear in Team payments.
        </div>
      ) : sp.extras === "already_open" ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          This team already has open additional-kit payment requests. Complete those requests before creating another set.
        </div>
      ) : sp.extras === "missing_email" ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Every selected payer needs an email address before a payment link can be sent.
        </div>
      ) : sp.extras ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          The additional-kit payment requests could not be created. Check the quantity and selected payers.
        </div>
      ) : null}

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/75">
              Additional kits
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Add more kits for £20 each</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Choose how many additional complete kits are needed, then choose who should pay. Select one team member for a single payment link, or select several members to divide the total equally between them.
            </p>
            <p className="mt-2 text-sm text-white/45">
              Once payment is complete, SIXFL will add the paid extra kits to the supplier order and confirm the additional size, name and number details with the captain.
            </p>

            <form action={createExtraKitPaymentLinksAction} className="mt-5 space-y-5">
              <input type="hidden" name="teamId" value={team.id} />
              <label className="block max-w-xs space-y-2">
                <span className="text-sm font-semibold text-white">Number of additional kits</span>
                <input
                  type="number"
                  name="extraKitQuantity"
                  min={1}
                  max={10}
                  defaultValue={1}
                  required
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-emerald-400/40"
                />
                <span className="block text-xs text-white/45">£20 per complete kit.</span>
              </label>

              <div>
                <div className="text-sm font-semibold text-white">Who should receive a payment link?</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {team.members.map((member) => (
                    <label key={member.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                      <input type="checkbox" name="payerTeamMemberId" value={member.id} className="mt-1" />
                      <span>
                        <span className="block font-semibold text-white">
                          {member.user.name || member.user.email || "Unnamed team member"}
                        </span>
                        <span className="mt-0.5 block text-xs text-white/45">
                          {member.user.email || "No email saved"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300">
                Create and email payment links
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-white">Additional-kit payment requests</div>
              <div className="text-xs text-white/45">£{(EXTRA_TEAM_KIT_PRICE_PENCE / 100).toFixed(0)} each</div>
            </div>
            <div className="mt-4 space-y-2">
              {extraKitCharges.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">
                  No additional-kit payment requests yet.
                </div>
              ) : (
                extraKitCharges.map((charge) => {
                  const paidPence = charge.transactions.reduce((sum, payment) => sum + payment.amountPence, 0);
                  const outstandingPence = Math.max(charge.amountPence - paidPence, 0);
                  const payerName = charge.title.replace("Additional kit contribution •", "").trim();
                  return (
                    <div key={charge.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-semibold text-white">{payerName}</div>
                          <div className="mt-1 text-xs text-white/45">
                            {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(charge.amountPence / 100)} requested
                          </div>
                        </div>
                        <span className={[
                          "w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                          outstandingPence <= 0 || charge.status === "PAID"
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                            : charge.status === "VOID"
                              ? "border-white/10 bg-white/[0.04] text-white/45"
                              : "border-amber-400/25 bg-amber-500/10 text-amber-100",
                        ].join(" ")}>
                          {charge.status === "VOID" ? "Cancelled" : outstandingPence <= 0 ? "Paid" : `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(outstandingPence / 100)} open`}
                        </span>
                      </div>
                      {charge.paymentToken && outstandingPence > 0 && charge.status !== "VOID" ? (
                        <Link href={`/pay/charge/${charge.paymentToken}`} className="mt-3 inline-flex text-xs font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4">
                          Open payment link
                        </Link>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

`;
if (!read(pagePath).includes("Create and email payment links")) {
  replaceOnce(pagePath, panelMarker, panel + panelMarker, "extra kit payment panel");
}

const payDataMarker = `  const fixturesHref = charge.fixture?.league?.slug`;
const payData = `  const paymentHeading = charge.fixture
    ? "Match fee payment"
    : charge.title.startsWith("Additional kit contribution")
      ? "Additional team kit payment"
      : "SIXFL payment";
  const paymentIntro = charge.fixture
    ? "Pay this open match-fee charge securely online."
    : charge.title.startsWith("Additional kit contribution")
      ? "Pay your share of the team's additional kit order securely online."
      : "Pay this SIXFL charge securely online.";
`;
if (!read(payPagePath).includes("const paymentHeading = charge.fixture")) {
  replaceOnce(payPagePath, payDataMarker, payData + "\n" + payDataMarker, "generic charge payment copy data");
}

replaceOnce(
  payPagePath,
  [
    '          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">',
    "            Match fee payment",
    "          </h1>",
    '          <p className="mx-auto max-w-2xl text-sm leading-6 text-white/60">',
    "            Pay this open match-fee charge securely online.",
    "          </p>",
  ].join("\n"),
  [
    '          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">',
    "            {paymentHeading}",
    "          </h1>",
    '          <p className="mx-auto max-w-2xl text-sm leading-6 text-white/60">',
    "            {paymentIntro}",
    "          </p>",
  ].join("\n"),
  "generic charge payment heading",
);

replaceOnce(
  payPagePath,
  "            Back to fixtures",
  "            {charge.fixture ? \"Back to fixtures\" : \"Back to SIXFL\"}",
  "generic charge payment back label",
);

console.log("Applied additional kit payment-link workflow.");
