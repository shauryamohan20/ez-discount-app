/**
 * Turns the form, as it is right now, into what the live preview needs: the
 * config the app would save, a demo cart, and plain sentences about every
 * option chosen.
 *
 * The form is often half filled while the merchant types, so rows that would
 * fail validation are left out of the preview instead of blocking it. The
 * config is built with the same serializers the app saves with.
 */
import { previewBxgy, previewBxgyRules } from "./bxgy-form";
import type { DiscountFormValues } from "./discount-form";
import {
  formatCalendarDate,
  formatMoney,
  type DemoLine,
  type PreviewResult,
} from "./preview";
import {
  STAND_IN_COLLECTION,
  STAND_IN_PRODUCT,
  buyXGetYCart,
  genericCart,
  previewScopeIds,
  quantityTierCart,
} from "./preview-cart";
import {
  ALL_PRODUCTS,
  CUSTOMER_ELIGIBILITY_LABELS,
  describeOrderReward,
  describeSelection,
  describeTierRange,
  discountClassesFor,
  serializeBuyXGetYConfig,
  serializeTierConfig,
  sortOrderTiers,
  sortTiers,
  type AppliesTo,
  type OrderTier,
  type ShopifyDiscountClass,
  type Tier,
} from "./tiers";

export type PreviewSetup = {
  config: unknown;
  discountClasses: ShopifyDiscountClass[];
  /** The demo cart with its starting quantities. */
  lines: DemoLine[];
  /** Rows left out because they are not filled in correctly yet. */
  skippedRows: number;
};

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function isWholeNumber(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1;
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

/** The tier rows that are complete enough to run, sorted by quantity. */
export function previewQuantityTiers(values: DiscountFormValues): {
  tiers: Tier[];
  skippedRows: number;
} {
  const tiers: Tier[] = [];
  let skippedRows = 0;

  for (const row of values.tiers) {
    const minQuantity = parseAmount(row.minQuantity);
    const maxQuantity = parseAmount(row.maxQuantity);
    const percentage = parseAmount(row.percentage);
    const cap = parseAmount(row.maxDiscountedUnits);
    const hasMax = row.maxQuantity.trim() !== "";
    const hasCap = row.maxDiscountedUnits.trim() !== "";

    if (
      !isWholeNumber(minQuantity) ||
      (hasMax && !(isWholeNumber(maxQuantity) && maxQuantity >= minQuantity)) ||
      percentage === null ||
      percentage <= 0 ||
      percentage > 100 ||
      (hasCap && !isWholeNumber(cap))
    ) {
      skippedRows++;
      continue;
    }

    tiers.push({
      minQuantity,
      maxQuantity: hasMax ? maxQuantity : null,
      percentage,
      maxDiscountedUnits: hasCap ? cap : null,
    });
  }

  return { tiers: sortTiers(tiers), skippedRows };
}

/** What the quantity tiers apply to, with stand ins for an empty selection. */
function previewAppliesTo(values: DiscountFormValues): AppliesTo {
  if (values.appliesToType === "products") {
    const ids = values.products.map((product) => product.id);
    return {
      type: "products",
      productIds: ids.length ? ids : [STAND_IN_PRODUCT.id],
      collectionIds: [],
    };
  }

  if (values.appliesToType === "collections") {
    const ids = values.collections.map((collection) => collection.id);
    return {
      type: "collections",
      productIds: [],
      collectionIds: ids.length ? ids : [STAND_IN_COLLECTION.id],
    };
  }

  return ALL_PRODUCTS;
}

/**
 * Everything the preview needs for the form as it is now: the config built
 * with the same serializers the app saves with, the discount classes, and a
 * demo cart for this kind of discount.
 */
export function buildPreview(values: DiscountFormValues): PreviewSetup {
  const eligibility = values.customerEligibility;

  if (values.discountType === "order_threshold") {
    const { tiers, skippedRows } = previewOrderTiers(values);

    return {
      config: JSON.parse(
        serializeTierConfig(
          "order_threshold",
          tiers,
          ALL_PRODUCTS,
          eligibility,
        ),
      ),
      discountClasses: discountClassesFor("order_threshold", tiers),
      lines: genericCart(),
      skippedRows,
    };
  }

  if (values.discountType === "buy_x_get_y") {
    const rules = previewBxgyRules(values.bxgy);
    const withStandIns = {
      ...rules,
      buyScope: { ...rules.buyScope, ids: previewScopeIds(values, "buy") },
      getScope: { ...rules.getScope, ids: previewScopeIds(values, "get") },
    };

    return {
      config: JSON.parse(serializeBuyXGetYConfig(withStandIns, eligibility)),
      discountClasses: discountClassesFor("buy_x_get_y", []),
      lines: buyXGetYCart(values, rules),
      skippedRows: 0,
    };
  }

  const { tiers, skippedRows } = previewQuantityTiers(values);

  return {
    config: JSON.parse(
      serializeTierConfig(
        "quantity_tiers",
        tiers,
        previewAppliesTo(values),
        eligibility,
      ),
    ),
    discountClasses: discountClassesFor("quantity_tiers", []),
    lines: quantityTierCart(values),
    skippedRows,
  };
}

function skippedNote(skippedRows: number, noun: string): string[] {
  if (!skippedRows) return [];

  const one = skippedRows === 1;

  return [
    `${skippedRows} ${noun}${one ? " is" : "s are"} not filled in correctly yet and ${
      one ? "is" : "are"
    } left out of the preview.`,
  ];
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

  return [...lines, ...skippedNote(skippedRows, "threshold")];
}

function countsTowardTiers(line: DemoLine, appliesTo: AppliesTo): boolean {
  if (appliesTo.type === "products") {
    return appliesTo.productIds.includes(line.productId);
  }
  if (appliesTo.type === "collections") return line.inSelectedCollection;

  return true;
}

/** "2 to 4 items: 10% off", with the unit limit when there is one. */
function describeTier(tier: Tier): string {
  const cap =
    tier.maxDiscountedUnits === null
      ? ""
      : `, on at most ${tier.maxDiscountedUnits} ${
          tier.maxDiscountedUnits === 1 ? "unit" : "units"
        }`;

  return `${describeTierRange(tier)}: ${tier.percentage}% off${cap}`;
}

function itemCount(count: number): string {
  return `${count} counting ${count === 1 ? "item" : "items"}`;
}

/**
 * Which items count, which tier this cart is in, and what the next tier
 * would add. The money itself comes from the Function's result.
 */
export function explainQuantityTiers(
  values: DiscountFormValues,
  lines: DemoLine[],
): string[] {
  const { tiers, skippedRows } = previewQuantityTiers(values);
  const appliesTo = previewAppliesTo(values);
  const titles = new Map(
    [...values.products, ...values.collections].map((resource) => [
      resource.id,
      resource.title,
    ]),
  );
  const titleOf = (id: string) => titles.get(id) || undefined;
  const sentences: string[] = [];

  if (values.appliesToType === "products") {
    sentences.push(
      values.products.length
        ? `Only ${describeSelection(
            "products",
            values.products.map((product) => product.id),
            titleOf,
          )} count toward the tiers and get the discount.`
        : "No products chosen yet, so the demo cart uses a stand in. Choose products to see them here.",
    );
  } else if (values.appliesToType === "collections") {
    sentences.push(
      values.collections.length
        ? `Only products in ${describeSelection(
            "collections",
            values.collections.map((collection) => collection.id),
            titleOf,
          )} count toward the tiers and get the discount.`
        : "No collections chosen yet, so the demo cart uses a stand in. Choose collections to see them here.",
    );
  } else {
    sentences.push("Every product in the cart counts toward the tiers.");
  }

  if (!tiers.length) {
    return [
      ...sentences,
      "Fill in a tier to see it work on the demo cart.",
      ...skippedNote(skippedRows, "tier"),
    ];
  }

  const counted = lines
    .filter((line) => line.quantity > 0 && countsTowardTiers(line, appliesTo))
    .reduce((sum, line) => sum + line.quantity, 0);

  // The same choice the Function makes when tiers overlap: the best
  // percentage, then the higher starting quantity.
  const best = tiers
    .filter(
      (tier) =>
        counted >= tier.minQuantity &&
        (tier.maxQuantity === null || counted <= tier.maxQuantity),
    )
    .sort(
      (a, b) => b.percentage - a.percentage || b.minQuantity - a.minQuantity,
    )[0];

  if (best) {
    sentences.push(
      `This cart has ${itemCount(counted)}, so the tier ${describeTier(best)} applies.`,
    );
    if (best.maxDiscountedUnits !== null) {
      sentences.push(
        "The unit limit is filled in cart order, so the items added first get the discount.",
      );
    }
  } else {
    sentences.push(
      `This cart has ${itemCount(counted)}, which no tier covers, so nothing applies.`,
    );
  }

  const next = tiers.find((tier) => tier.minQuantity > counted);
  if (next) {
    const missing = next.minQuantity - counted;
    sentences.push(
      `Add ${missing} more counting ${
        missing === 1 ? "item" : "items"
      } to reach ${describeTier(next)}.`,
    );
  }

  return [...sentences, ...skippedNote(skippedRows, "tier")];
}

function hasPicks(values: DiscountFormValues, side: "buy" | "get"): boolean {
  const bxgy = values.bxgy;
  const kind = side === "buy" ? bxgy.buyScopeKind : bxgy.getScopeKind;

  if (kind === "products") {
    return (side === "buy" ? bxgy.buyProducts : bxgy.getProducts).length > 0;
  }
  if (kind === "collections") {
    return (
      (side === "buy" ? bxgy.buyCollections : bxgy.getCollections).length > 0
    );
  }

  return true;
}

/** The offer in one sentence, and how many times it applies to this cart. */
export function explainBuyXGetY(
  values: DiscountFormValues,
  result: PreviewResult,
): string[] {
  const rules = previewBxgyRules(values.bxgy);
  const sentences = [previewBxgy(values.bxgy)];

  if (!hasPicks(values, "buy")) {
    sentences.push(
      "Nothing chosen for customers to buy yet, so the demo cart uses a stand in.",
    );
  }
  if (!hasPicks(values, "get")) {
    sentences.push(
      "Nothing chosen for customers to get yet, so the demo cart uses a stand in.",
    );
  }

  const discounted = result.lines.reduce(
    (sum, line) => sum + line.discountedUnits,
    0,
  );
  const items = `${discounted} ${discounted === 1 ? "item is" : "items are"}`;

  if (discounted > 0) {
    const times = Math.floor(discounted / rules.getQuantity);
    sentences.push(
      times >= 1
        ? `In this cart the offer applies ${times} ${
            times === 1 ? "time" : "times"
          }, so ${items} discounted.`
        : `In this cart ${items} discounted.`,
    );
  } else {
    sentences.push(
      `Nothing applies yet. The cart needs ${rules.buyQuantity} qualifying ${
        rules.buyQuantity === 1 ? "item" : "items"
      } to buy, plus ${rules.getQuantity} to get.`,
    );
  }

  sentences.push(
    "The discounted items are always the cheapest eligible ones, and no single item counts as both bought and discounted.",
  );

  return sentences;
}

/** What the demo cart says under one line. */
export type LineNote =
  | { state: "applied"; label: string; amount: number }
  | { state: "counts"; label: string }
  | { state: "none"; label: string; detail: string }
  | { state: "empty" };

/** "10% OFF" reads as "10% off"; "Buy 2 Get 1 Free" is left as it is. */
function readableMessage(message: string | null, fallback: string): string {
  if (!message) return fallback;
  return message === message.toUpperCase() ? message.toLowerCase() : message;
}

function notApplied(detail: string): LineNote {
  return { state: "none", label: "Discount doesn't apply", detail };
}

/**
 * The status line under each demo cart line: what was taken off it, or why
 * nothing was. A whole order discount is shared across the lines by value,
 * the way Shopify spreads it at checkout. The amounts come from the
 * Function's result; only the reasons are worked out here.
 */
export function cartLineNotes(
  values: DiscountFormValues,
  lines: DemoLine[],
  result: PreviewResult,
  shopperQualifies: boolean,
  currencyCode: string,
): Map<string, LineNote> {
  const notes = new Map<string, LineNote>();
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const inCart = lines.filter((line) => line.quantity > 0);

  // The order discount, spread by line value, with rounding left on the last
  // line so the shares add up to the total exactly.
  const orderShares = new Map<string, number>();
  if (result.orderDiscount > 0 && result.subtotal > 0) {
    let remainingCents = Math.round(result.orderDiscount * 100);
    inCart.forEach((line, index) => {
      const lineCents = Math.round(line.unitPrice * 100) * line.quantity;
      const shareCents =
        index === inCart.length - 1
          ? remainingCents
          : Math.round(
              (lineCents * result.orderDiscount * 100) /
                Math.round(result.subtotal * 100),
            );
      remainingCents -= shareCents;
      orderShares.set(line.id, shareCents / 100);
    });
  }

  const quantity = previewQuantityTiers(values).tiers;
  const appliesTo = previewAppliesTo(values);
  const counted = lines
    .filter((line) => line.quantity > 0 && countsTowardTiers(line, appliesTo))
    .reduce((sum, line) => sum + line.quantity, 0);
  const tierReached = quantity.some(
    (tier) =>
      counted >= tier.minQuantity &&
      (tier.maxQuantity === null || counted <= tier.maxQuantity),
  );

  const order = previewOrderTiers(values).tiers;
  const freeShippingOnly =
    result.shippingDiscount > 0 && result.orderDiscount === 0;

  const bxgy = values.bxgy;
  const buyIds = previewScopeIds(values, "buy");
  const getIds = previewScopeIds(values, "get");
  const canBuy = (line: DemoLine) =>
    bxgy.buyScopeKind === "all" ||
    (bxgy.buyScopeKind === "products"
      ? buyIds.includes(line.productId)
      : line.inBuyCollection);
  const canGet = (line: DemoLine) =>
    bxgy.getScopeKind === "same_as_buy"
      ? canBuy(line)
      : bxgy.getScopeKind === "products"
        ? getIds.includes(line.productId)
        : line.inGetCollection;

  for (const line of lines) {
    if (line.quantity === 0) {
      notes.set(line.id, { state: "empty" });
      continue;
    }

    const shown = result.lines.find((entry) => entry.id === line.id);
    if (shown && shown.discount > 0) {
      notes.set(line.id, {
        state: "applied",
        label: `${readableMessage(shown.message, "Discount")} applied`,
        amount: shown.discount,
      });
      continue;
    }

    const share = orderShares.get(line.id);
    if (share && share > 0) {
      notes.set(line.id, {
        state: "applied",
        label: `${readableMessage(result.orderMessage, "Order discount")} applied`,
        amount: share,
      });
      continue;
    }

    if (!shopperQualifies) {
      notes.set(line.id, notApplied("This shopper doesn't qualify"));
      continue;
    }

    if (values.discountType === "order_threshold") {
      if (freeShippingOnly) {
        notes.set(line.id, {
          state: "counts",
          label: "Counts toward free shipping",
        });
      } else if (!order.length) {
        notes.set(line.id, notApplied("No thresholds set yet"));
      } else {
        notes.set(
          line.id,
          notApplied(`Cart is below ${money(order[0].minSubtotal)}`),
        );
      }
      continue;
    }

    if (values.discountType === "buy_x_get_y") {
      if (canBuy(line)) {
        notes.set(line.id, {
          state: "counts",
          label: "Counts as a bought item",
        });
      } else if (canGet(line)) {
        notes.set(line.id, notApplied("Add more bought items to unlock it"));
      } else {
        notes.set(line.id, notApplied("Not part of this offer"));
      }
      continue;
    }

    if (!countsTowardTiers(line, appliesTo)) {
      notes.set(
        line.id,
        notApplied(
          values.appliesToType === "collections"
            ? "Not in the chosen collections"
            : "Not one of this discount's products",
        ),
      );
    } else if (!tierReached) {
      notes.set(line.id, notApplied("Not enough items for a tier yet"));
    } else {
      notes.set(line.id, notApplied("Over the unit limit"));
    }
  }

  return notes;
}
