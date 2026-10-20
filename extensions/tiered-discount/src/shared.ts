/**
 * Helpers used by both targets: the cart lines target and the delivery
 * options target. Each target has its own generated input type, so these take
 * the small structural shapes they need rather than either input type.
 */

export type CustomerEligibility = "all" | "signedIn" | "firstOrder" | "returning";

type BuyerIdentity =
  | {
      isAuthenticated: boolean;
      customer?: { numberOfOrders: number } | null;
    }
  | null
  | undefined;

/** Money is compared in whole cents so 99.99 and 100.00 never drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function isPercentage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
  );
}

/**
 * A cart with no identified customer cannot satisfy any rule that depends on
 * who the buyer is. That is not an edge case: an automatic discount runs on
 * anonymous carts too, and such a cart has no order history to read, so a
 * first order discount simply does not apply until the buyer is known.
 */
export function isCustomerEligible(
  buyerIdentity: BuyerIdentity,
  rule: CustomerEligibility | null | undefined,
): boolean {
  switch (rule) {
    case "signedIn":
      return buyerIdentity?.isAuthenticated === true;
    case "firstOrder": {
      const customer = buyerIdentity?.customer;
      return !!customer && customer.numberOfOrders === 0;
    }
    case "returning": {
      const customer = buyerIdentity?.customer;
      return !!customer && customer.numberOfOrders > 0;
    }
    default:
      return true;
  }
}

/** The config metafield as a plain object, or null when it is unusable. */
export function readConfig(
  jsonValue: unknown,
): Record<string, unknown> | null {
  if (!jsonValue || typeof jsonValue !== "object" || Array.isArray(jsonValue)) {
    return null;
  }

  return jsonValue as Record<string, unknown>;
}
