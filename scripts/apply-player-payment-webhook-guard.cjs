// Payment verification and player receipt settlement now live in the native
// webhook and shared player-repayment-checkout service. Do not recreate the old
// handler: it replaced the obligation with the amount of a single payment.
const fs = require("node:fs");
const source = fs.readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
if (!source.includes("settlePlayerRepaymentSession(session, stripe)") || !source.includes("isConfirmedCheckoutPayment") || source.includes("closePlayerMatchFeeFromStripeSession")) {
  throw new Error("Native verified payment settlement is missing or the retired player closer has returned.");
}
