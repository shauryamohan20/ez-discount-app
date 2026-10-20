/**
 * Turns the form, as it is right now, into what the live preview needs: the
 * config the app would save, and plain sentences about every option chosen.
 *
 * The form is often half filled while the merchant types, so rows that would
 * fail validation are left out of the preview instead of blocking it. The
 * config is built with the same serializer the app saves with.
 */
import type { DiscountFormValues } from "./discount-form";
import { formatCalendarDate, formatMoney } from "./preview";
import {
  ALL_PRODUCTS,
  CUSTOMER_ELIGIBILITY_LABELS,
  describeOrderReward,
  discountClassesFor,
  serializeTierConfig,
  sortOrderTiers,
  type OrderTier,
  type ShopifyDiscountClass,
} from "./tiers";

export type PreviewConfig = {
  config: unknown;
  discountClasses: ShopifyDiscountClass[];
  /** Rows left out because they are not filled in correctly yet. */
  skippedRows: number;
};

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** The threshold rows that are complete enough to run, sorted by amount. */
export function previewOrderTiers(values: DiscountFormValues): {
  tiers: OrderTier[];
  skippedRows: number;
} {
  const tiers: OrderTier[] = [];
  const seen = new Set<number>();
  let skippedRows = 0;

  for (const row of values.orderTiers) {
    const minSubtotal = parseAmount(row.minSubtotal);
    const rawPercentage = parseAmount(row.percentage);
    const percentage =
      rawPercentage === null && row.freeShipping ? 0 : rawPercentage;

    const usable =
      minSubtotal !== null &&
      minSubtotal > 0 &&
      Number(minSubtotal.toFixed(2)) === minSubtotal &&
      !seen.has(minSubtotal) &&
      percentage !== null &&
      percentage >= 0 &&
      percentage <= 100 &&
      (percentage > 0 || row.freeShipping);

    if (!usable) {
      skippedRows++;
      continue;
    }

    seen.add(minSubtotal);
    tiers.push({ minSubtotal, percentage, freeShipping: row.freeShipping });
  }

  return { tiers: sortOrderTiers(tiers), skippedRows };
}

/** Null for kinds the preview does not cover yet. */
export function buildPreviewConfig(
  values: DiscountFormValues,
): PreviewConfig | null {
  if (values.discountType !== "order_threshold") return null;

  const { tiers, skippedRows } = previewOrderTiers(values);

  return {
    config: JSON.parse(
      serializeTierConfig(
        "order_threshold",
        tiers,
        ALL_PRODUCTS,
        values.customerEligibility,
      ),
    ),
    discountClasses: discountClassesFor("order_threshold", tiers),
    skippedRows,
  };
}

/** Sentences about the options every kind shares. */
export function explainCommonOptions(values: DiscountFormValues): string[] {
  const lines: string[] = [];
  const code = values.code.trim();

  if (values.method === "automatic") {
    lines.push(
      "Applies on its own in the cart and at checkout. No code needed.",
    );
  } else {
    lines.push(
      code
        ? `Applies only when the customer enters ${code} at checkout.`
        : "Applies only when the customer enters the code at checkout. Add a code to see it here.",
    );

    const limit = values.usageLimit.trim();
    const limits: string[] = [];
    if (limit) limits.push(`can be used ${limit} times in total`);
    if (values.appliesOncePerCustomer) limits.push("once per customer");
    lines.push(
      limits.length
        ? `The code ${limits.join(", ")}.`
        : "The code has no usage limit.",
    );
  }

  lines.push(
    values.customerEligibility === "all"
      ? "Every customer qualifies, signed in or not."
      : `Only for: ${CUSTOMER_ELIGIBILITY_LABELS[
          values.customerEligibility
        ].toLowerCase()}. Guests do not get it until they sign in.`,
  );

  const start = values.startDate.trim();
  const end = values.endDate.trim();
  if (start) {
    lines.push(
      end
        ? `Runs from ${formatCalendarDate(start)} to the end of ${formatCalendarDate(end)}.`
        : `Starts ${formatCalendarDate(start)} and has no end date.`,
    );
  }

  const otherClass =
    values.discountType === "order_threshold" ? "product" : "whole order";
  const combines = [
    values.combinesWithOtherDiscounts
      ? `combines with ${otherClass} discounts`
      : `does not combine with ${otherClass} discounts`,
    values.combinesWithShipping
      ? "combines with shipping discounts"
      : "does not combine with shipping discounts",
  ];
  lines.push(
    `It ${combines.join(" and ")}. When discounts cannot combine, Shopify gives the customer the better one.`,
  );

  return lines;
}

/**
 * What this cart got from the thresholds and what the next one would add:
 * "This cart reaches the 100.00 threshold: 10% off." and "Add 20.00 more to
 * reach 150.00: 15% off and free shipping."
 */
export function explainOrderThresholds(
  values: DiscountFormValues,
  subtotal: number,
  currencyCode: string,
): string[] {
  const { tiers, skippedRows } = previewOrderTiers(values);
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const lines: string[] = [];

  if (!tiers.length) {
    return ["Fill in a threshold to see it work on the demo cart."];
  }

  if (subtotal <= 0) {
    return ["The demo cart is empty. Add items to see the discount work."];
  }

  const subtotalCents = Math.round(subtotal * 100);
  const reached = tiers.filter(
    (tier) => subtotalCents >= Math.round(tier.minSubtotal * 100),
  );
  const next = tiers.find(
    (tier) => subtotalCents < Math.round(tier.minSubtotal * 100),
  );

  if (reached.length) {
    const top = reached[reached.length - 1];
    const percentage = Math.max(...reached.map((tier) => tier.percentage));
    const freeShipping = reached.some((tier) => tier.freeShipping);

    lines.push(
      `This cart reaches the ${money(top.minSubtotal)} threshold, so it gets ${describeOrderReward(
        percentage,
        freeShipping,
      )}.`,
    );
  } else {
    lines.push(
      `This cart is below the first threshold of ${money(tiers[0].minSubtotal)}, so nothing applies yet.`,
    );
  }

  if (next) {
    const missing = (Math.round(next.minSubtotal * 100) - subtotalCents) / 100;
    lines.push(
      `Add ${money(missing)} more to reach ${money(next.minSubtotal)}: ${describeOrderReward(
        next.percentage,
        next.freeShipping,
      )}.`,
    );
  } else {
    lines.push("This cart has reached the highest threshold.");
  }

  lines.push(
    "Thresholds compare the cart subtotal before shipping and taxes. The best percentage reached applies, and free shipping stays once reached.",
  );

  if (skippedRows) {
    lines.push(
      `${skippedRows} ${
        skippedRows === 1 ? "threshold is" : "thresholds are"
      } not filled in correctly yet and ${
        skippedRows === 1 ? "is" : "are"
      } left out of the preview.`,
    );
  }

  return lines;
}
