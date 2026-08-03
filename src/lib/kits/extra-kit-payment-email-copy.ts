type ExtraKitPaymentEmailCopyInput = {
  teamName: string;
  payerName: string;
  quantity: number;
  amountPence: number;
  payerCount: number;
  purchaseOnly: boolean;
};

export type ExtraKitPaymentEmailCopy = {
  subject: string;
  body: string;
  ctaLabel: string;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getAdditionalKitOrderLabel(quantity: number) {
  return quantity === 1
    ? "1 additional complete SIXFL kit costing £20"
    : `${quantity} additional complete SIXFL kits at £20 each`;
}

export function buildExtraKitPaymentEmailCopy(
  input: ExtraKitPaymentEmailCopyInput,
): ExtraKitPaymentEmailCopy {
  if (input.purchaseOnly) {
    return {
      subject: `${input.teamName}: pay £20 for your SIXFL kit`,
      body: `Hi ${input.payerName},\n\nYou have been added to the ${input.teamName} kit order. One complete SIXFL kit costs £20.\n\nUse the secure payment link below. Once it is paid, your kit details can be completed.`,
      ctaLabel: "Pay £20 for my kit",
    };
  }

  const amount = formatMoney(input.amountPence);
  const orderLabel = getAdditionalKitOrderLabel(input.quantity);
  const paymentCopy =
    input.payerCount === 1
      ? `You have been asked to pay ${amount} for the order.`
      : `You have been asked to pay ${amount} towards the order. This is your share of the total cost.`;

  return {
    subject: `${input.teamName}: additional kit payment`,
    body: `Hi ${input.payerName},\n\n${input.teamName} is ordering ${orderLabel}. ${paymentCopy}\n\nThe kit details, including the player, size, name and number, can be added after payment.\n\nUse the secure payment link below.`,
    ctaLabel: input.payerCount === 1 ? "Pay for kit order" : "Pay my share",
  };
}
