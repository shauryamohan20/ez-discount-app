import { isPercentage, toCents } from "./shared";

/**
 * Whole order thresholds. Shared by both targets: the cart lines target turns
 * the reached percentage into an order discount, and the delivery options
 * target turns reached free shipping into a shipping discount.
 *
 * Version 7 of the config added freeShipping to each threshold. A threshold
 * may give free shipping with a percentage of 0, meaning free shipping only.
 * A missing freeShipping means false, so older configs behave as before.
 */
export type OrderTier = {
  minSubtotal: number;
  percentage: number;
  freeShipping: boolean;
};

/** What a cart has earned from the thresholds it reached. */
export type OrderThresholdOutcome = {
  /** The best percentage among the reached thresholds, or 0. */
  percentage: number;
  /** True once any reached threshold gives free shipping. */
  freeShipping: boolean;
};

/**
 * A malformed tier is skipped rather than thrown on. A config can be written
 * by hand in GraphiQL, and one bad row should not take the whole discount down.
 */
export function validOrderTiers(tiers: unknown): OrderTier[] {
  if (!Array.isArray(tiers)) return [];

  const valid: OrderTier[] = [];

  for (const tier of tiers) {
    if (typeof tier !== "object" || tier === null) continue;

    const { minSubtotal, percentage, freeShipping } = tier as Record<
      string,
      unknown
    >;

    if (
      typeof minSubtotal !== "number" ||
      !Number.isFinite(minSubtotal) ||
      minSubtotal <= 0
    ) {
      continue;
    }

    const shipping = freeShipping === true;

    if (isPercentage(percentage)) {
      valid.push({ minSubtotal, percentage, freeShipping: shipping });
    } else if (percentage === 0 && shipping) {
      valid.push({ minSubtotal, percentage: 0, freeShipping: true });
    }
  }

  return valid;
}

/**
 * The cart subtotal is in the buyer's presentment currency, so it is converted
 * back to the shop's currency before being compared. Thresholds are entered in
 * the shop's currency and therefore mean the same amount of value to every
 * buyer, whatever they are paying in. Null when the amount is unreadable.
 */
export function shopSubtotalCents(
  presentmentAmount: string,
  presentmentCurrencyRate: unknown,
): number | null {
  const presentmentSubtotal = Number(presentmentAmount);
  if (!Number.isFinite(presentmentSubtotal)) return null;

  const rate = Number(presentmentCurrencyRate);
  const shopSubtotal =
    Number.isFinite(rate) && rate > 0
      ? presentmentSubtotal / rate
      : presentmentSubtotal;

  return toCents(shopSubtotal);
}

/**
 * The percentage is the best one among the reached thresholds, so a config
 * written by hand with thresholds out of order still gives the customer the
 * most generous one. Free shipping is earned by reaching any threshold that
 * offers it, so spending more never takes free shipping away.
 */
export function orderThresholdOutcome(
  tiers: OrderTier[],
  subtotalCents: number,
): OrderThresholdOutcome {
  let percentage = 0;
  let freeShipping = false;

  for (const tier of tiers) {
    if (subtotalCents < toCents(tier.minSubtotal)) continue;

    percentage = Math.max(percentage, tier.percentage);
    freeShipping = freeShipping || tier.freeShipping;
  }

  return { percentage, freeShipping };
}

/**
 * Version 8 added maxDiscountAmount: the most the discount takes off, in the
 * shop's currency. Missing or null means no cap. A cap that is there but not
 * a positive number is unreadable, and the discount then gives nothing,
 * rather than taking off more than the merchant allowed.
 */
export function readMaxDiscountAmount(
  value: unknown,
): { ok: true; cap: number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, cap: null };
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { ok: true, cap: value };
  }
  return { ok: false };
}

/**
 * The order discount's value: the percentage, or, when that would take off
 * more than the cap, the cap as a fixed amount. Discount amounts are in the
 * cart's currency, so the cap is converted with the presentment rate, the
 * same way thresholds are. Compared in whole cents.
 */
export function orderDiscountValue(
  presentmentAmount: string,
  presentmentCurrencyRate: unknown,
  percentage: number,
  cap: number | null,
): { percentage: { value: string } } | { fixedAmount: { amount: string } } {
  const asPercentage = { percentage: { value: String(percentage) } };
  if (cap === null) return asPercentage;

  const subtotalCents = Math.round(Number(presentmentAmount) * 100);
  if (!Number.isFinite(subtotalCents)) return asPercentage;

  const rate = Number(presentmentCurrencyRate);
  const capCents = Math.round(
    cap * (Number.isFinite(rate) && rate > 0 ? rate : 1) * 100,
  );
  const discountCents = Math.round((subtotalCents * percentage) / 100);

  return discountCents > capCents
    ? { fixedAmount: { amount: (capCents / 100).toFixed(2) } }
    : asPercentage;
}
