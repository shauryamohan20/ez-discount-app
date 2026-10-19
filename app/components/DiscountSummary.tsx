import type { TieredDiscount } from "../models/discounts.server";
import {
  CUSTOMER_ELIGIBILITY_LABELS,
  summarizeAppliesTo,
  summarizeOrderTiers,
  summarizeTiers,
} from "../lib/tiers";

/**
 * The "What it does" cell, for any kind of discount. It lives in one place so
 * a discount reads the same on its own tab as it does in the table of every
 * discount on the home page. A new kind of discount adds a branch here.
 */
export function DiscountSummary({ discount }: { discount: TieredDiscount }) {
  const { config } = discount;

  if (config.status !== "ok") {
    return (
      <s-stack direction="block" gap="small-300">
        <s-badge tone="warning">Not editable</s-badge>
        <s-text color="subdued">{config.reason}</s-text>
      </s-stack>
    );
  }

  const customers =
    config.customerEligibility === "all"
      ? "All customers"
      : CUSTOMER_ELIGIBILITY_LABELS[config.customerEligibility];

  if (config.type === "order_threshold") {
    return (
      <s-stack direction="block" gap="small-500">
        <s-text>{summarizeOrderTiers(config.tiers)}</s-text>
        <s-text color="subdued">Whole order, {customers.toLowerCase()}</s-text>
      </s-stack>
    );
  }

  return (
    <s-stack direction="block" gap="small-500">
      <s-text>{summarizeTiers(config.tiers)}</s-text>
      <s-text color="subdued">
        {summarizeAppliesTo(config.appliesTo)}, {customers.toLowerCase()}
      </s-text>
    </s-stack>
  );
}
