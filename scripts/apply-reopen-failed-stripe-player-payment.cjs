const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionsPath = "src/app/captain/team/[teamid]/match-fees/actions.ts";
const pagePath = "src/app/captain/team/[teamid]/match-fees/page.tsx";

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function write(filePath, source) {
  fs.writeFileSync(path.join(root, filePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in ${label.includes("page") ? pagePath : actionsPath}.`);
  }
  return source.replace(before, after);
}

let actions = read(actionsPath);

actions = replaceRequired(
  actions,
  'import { queuePlayerMatchFeeReminder } from "@/lib/payments/player-match-fees";',
  [
    'import {',
    '  ensurePlayerMatchFeePaymentDetails,',
    '  queuePlayerMatchFeeReminder,',
    '} from "@/lib/payments/player-match-fees";',
    'import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";',
  ].join("\n"),
  "actions player payment imports",
);

actions = replaceRequired(
  actions,
  'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";',
  [
    'import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";',
    'import { getStripeServerClient } from "@/lib/stripe/client";',
  ].join("\n"),
  "actions Stripe client import",
);

const repairAction = `export async function reopenFailedStripePlayerMatchFeeAction(formData: FormData) {
  const teamId = getString(formData, "teamId");
  const fixtureId = getString(formData, "fixtureId");
  const feeId = getString(formData, "feeId");

  const access = teamId ? await requireCaptain(teamId) : null;
  redirectIfNotAdmin({ isAdmin: Boolean(access?.isAdmin), teamId, fixtureId });

  if (!teamId || !fixtureId || !feeId) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  const fee = await prisma.playerMatchFee.findFirst({
    where: { id: feeId, teamId, fixtureId },
    select: { id: true, status: true, note: true },
  });

  if (!fee) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=missing_fee"));
  }

  if (fee.status !== "PAID") {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=fee_not_paid"));
  }

  const transactions = await prisma.paymentTransaction.findMany({
    where: {
      teamId,
      method: "STRIPE",
      notes: { contains: \`Player fee ID: \\${fee.id}\` },
    },
    select: {
      id: true,
      reference: true,
      stripePaymentIntentId: true,
      stripeCheckoutSessionId: true,
    },
  });

  if (transactions.length === 0) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=no_stripe_transaction"));
  }

  const stripe = getStripeServerClient();
  let verifiedAny = false;

  try {
    for (const transaction of transactions) {
      const paymentIntentId =
        transaction.stripePaymentIntentId ||
        (transaction.reference?.startsWith("pi_") ? transaction.reference : null);

      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        verifiedAny = true;
        if (intent.status === "succeeded") {
          redirect(getMatchFeesPath(teamId, fixtureId, "&error=stripe_payment_succeeded"));
        }
        continue;
      }

      if (transaction.stripeCheckoutSessionId) {
        const session = await stripe.checkout.sessions.retrieve(
          transaction.stripeCheckoutSessionId,
        );
        verifiedAny = true;
        if (session.payment_status === "paid") {
          redirect(getMatchFeesPath(teamId, fixtureId, "&error=stripe_payment_succeeded"));
        }
      }
    }
  } catch (error) {
    console.error("Failed to verify Stripe player payment before reopening", error);
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=stripe_status_unverified"));
  }

  if (!verifiedAny) {
    redirect(getMatchFeesPath(teamId, fixtureId, "&error=stripe_status_unverified"));
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.deleteMany({
      where: { id: { in: transactions.map((transaction) => transaction.id) } },
    });

    await tx.playerMatchFee.update({
      where: { id: fee.id },
      data: {
        status: "OPEN",
        paidAt: null,
        waivedAt: null,
        cancelledAt: null,
        note: appendNote({
          existingNote: fee.note,
          note: "Reopened by SIXFL admin after Stripe confirmed the recorded online payment did not succeed.",
        }),
      },
    });
  });

  await ensurePlayerMatchFeePaymentDetails(fee.id);
  await reconcileFixtureChargeFromPlayerPayments({ teamId, fixtureId });

  revalidatePath(getMatchFeesPath(teamId, fixtureId));
  revalidatePath(\`/captain/team/\\${teamId}/player-payments\`);
  revalidatePath(\`/captain/team/\\${teamId}/payments\`);
  revalidatePath("/admin/payments");

  redirect(getMatchFeesPath(teamId, fixtureId, "&saved=failed_stripe_reopened"));
}

`;

if (!actions.includes("export async function reopenFailedStripePlayerMatchFeeAction")) {
  const marker = "export async function sendCaptainPlayerMatchFeeReminderAction";
  if (!actions.includes(marker)) {
    throw new Error("Expected reminder action marker was not found in match-fees actions.");
  }
  actions = actions.replace(marker, `${repairAction}${marker}`);
}

write(actionsPath, actions);

let page = read(pagePath);

page = replaceRequired(
  page,
  [
    "  markCaptainPlayerMatchFeePaidAction,",
    "  sendCaptainPlayerMatchFeeReminderAction,",
  ].join("\n"),
  [
    "  markCaptainPlayerMatchFeePaidAction,",
    "  reopenFailedStripePlayerMatchFeeAction,",
    "  sendCaptainPlayerMatchFeeReminderAction,",
  ].join("\n"),
  "page repair action import",
);

page = replaceRequired(
  page,
  '    case "fee_updated":\n      return "Player match fee updated. The fee outcome is shown clearly on the player row below.";',
  [
    '    case "fee_updated":',
    '      return "Player match fee updated. The fee outcome is shown clearly on the player row below.";',
    '    case "failed_stripe_reopened":',
    '      return "Failed Stripe attempt removed. The player fee is open again and the payment link can be used normally.";',
  ].join("\n"),
  "page saved repair message",
);

page = replaceRequired(
  page,
  '    case "no_payment_url":\n      return "A payment link could not be created for that player fee.";\n    default:',
  [
    '    case "no_payment_url":',
    '      return "A payment link could not be created for that player fee.";',
    '    case "fee_not_paid":',
    '      return "This player fee is not currently marked as paid.";',
    '    case "no_stripe_transaction":',
    '      return "No Stripe player-payment transaction is linked to this paid fee, so SIXFL has not changed it automatically.";',
    '    case "stripe_payment_succeeded":',
    '      return "Stripe confirms this payment actually succeeded. SIXFL has left it marked as paid.";',
    '    case "stripe_status_unverified":',
    '      return "SIXFL could not safely verify the Stripe payment status, so no records were changed.";',
    '    default:',
  ].join("\n"),
  "page repair error messages",
);

const repairButton = `                    {fee.status === "PAID" ? (
                      <form action={reopenFailedStripePlayerMatchFeeAction}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                        <input type="hidden" name="feeId" value={fee.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/15"
                        >
                          Reopen failed Stripe payment
                        </button>
                      </form>
                    ) : null}

`;

if (!page.includes("Reopen failed Stripe payment")) {
  const marker = "                    {statusButtons.map((status) => (";
  if (!page.includes(marker)) {
    throw new Error("Expected admin fee status buttons marker was not found.");
  }
  page = page.replace(marker, `${repairButton}${marker}`);
}

write(pagePath, page);

if (
  !read(actionsPath).includes("stripe.paymentIntents.retrieve") ||
  !read(actionsPath).includes("paymentTransaction.deleteMany") ||
  !read(pagePath).includes("Reopen failed Stripe payment")
) {
  throw new Error("Failed Stripe player-payment repair controls were not applied completely.");
}

console.log(
  "Added admin-only Stripe-verified repair for falsely paid player match fees.",
);
