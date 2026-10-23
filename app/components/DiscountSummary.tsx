import type { TieredDiscount } from "../models/discounts.server";
import {
  CUSTOMER_ELIGIBILITY_LABELS,
  describeBuyXGetY,
  describeSchedule,
  summarizeAppliesTo,
  summarizeBuyXGetY,
  formatThreshold,
  summarizeOrderTiers,
  summarizeTiers,
} from "../lib/tiers";

type Props = {
  discount: TieredDiscount;
  /**
   * Product and collection titles by ID, for kinds that name what they apply
   * to. Without them the cell falls back to counts, such as "3 products".
   */
  titles?: Record<string, string>;
};

/**
 * The "What it does" cell, for any kind of discount. It lives in one place so
 * a discount reads the same on its own tab as it does in the table of every
 * discount on the home page. A new kind of discount adds a branch here.
 */
export function DiscountSummary({ discount, titles }: Props) {
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

  // Only discounts limited to certain days or hours say when they run.
  const when = config.schedule ? (
    <s-text color="subdued">{describeSchedule(config.schedule)}</s-text>
  ) : null;

  if (config.type === "buy_x_get_y") {
    return (
      <s-stack direction="block" gap="small-500">
        <s-text type="strong">{summarizeBuyXGetY(config.bxgy)}</s-text>
        <s-text>
          {describeBuyXGetY(
            config.bxgy,
            titles ? (id) => titles[id] : undefined,
          )}
        </s-text>
        <s-text color="subdued">{customers}</s-text>
        {when}
      </s-stack>
    );
  }

  if (config.type === "order_threshold") {
    return (
      <s-stack direction="block" gap="small-500">
        <s-text>
          {summarizeOrderTiers(config.tiers)}
          {config.maxDiscountAmount === null
            ? ""
            : `, at most ${formatThreshold(config.maxDiscountAmount)} off`}
        </s-text>
        <s-text color="subdued">Whole order, {customers.toLowerCase()}</s-text>
        {when}
      </s-stack>
    );
  }

  return (
    <s-stack direction="block" gap="small-500">
      <s-text>{summarizeTiers(config.tiers)}</s-text>
      <s-text color="subdued">
        {summarizeAppliesTo(config.appliesTo)}, {customers.toLowerCase()}
      </s-text>
      {when}
    </s-stack>
  );
}
