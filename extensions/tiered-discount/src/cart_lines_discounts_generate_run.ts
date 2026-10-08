import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  CartOperation,
  ProductDiscountCandidateTarget,
} from '../generated/api';

/**
 * Written by the app into the `$app:tiered` / `config` metafield.
 *
 * Version 1 tiers only had minQuantity and percentage and were always open
 * ended. Version 2 added maxQuantity and maxDiscountedUnits. Version 3 added
 * appliesTo. Version 4 added customerEligibility. Version 5 added type.
 *
 * Every added field is optional here, so a config written by any earlier
 * version of the app still behaves the way it did then. In particular a
 * missing type means quantity tiers, which is what every config written
 * before order thresholds existed is.
 */
type DiscountType = 'quantity_tiers' | 'order_threshold';

type QuantityTier = {
  minQuantity: number;
  maxQuantity?: number | null;
  percentage: number;
  maxDiscountedUnits?: number | null;
};

type OrderTier = {
  minSubtotal: number;
  percentage: number;
};

type AppliesTo = {
  type?: 'all' | 'products' | 'collections';
  productIds?: string[] | null;
};

type CustomerEligibility = 'all' | 'signedIn' | 'firstOrder' | 'returning';

type TierConfig = {
  type?: DiscountType | null;
  tiers?: unknown[];
  appliesTo?: AppliesTo | null;
  customerEligibility?: CustomerEligibility | null;
};

type Line = CartInput['cart']['lines'][number];
type BuyerIdentity = CartInput['cart']['buyerIdentity'];

const NOTHING: CartLinesDiscountsGenerateRunResult = {operations: []};

/** Money is compared in whole cents so 99.99 and 100.00 never drift. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isPercentage(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
  );
}

/**
 * A malformed tier is skipped rather than thrown on. A config can be written
 * by hand in GraphiQL, and one bad row should not take the whole discount down.
 */
function validQuantityTiers(tiers: unknown[]): QuantityTier[] {
  const valid: QuantityTier[] = [];

  for (const tier of tiers) {
    if (typeof tier !== 'object' || tier === null) continue;

    const candidate = tier as Record<string, unknown>;
    const {minQuantity, percentage, maxQuantity, maxDiscountedUnits} = candidate;

    if (
      typeof minQuantity !== 'number' ||
      !Number.isInteger(minQuantity) ||
      minQuantity < 1
    ) {
      continue;
    }

    if (!isPercentage(percentage)) continue;

    valid.push({
      minQuantity,
      percentage,
      maxQuantity: typeof maxQuantity === 'number' ? maxQuantity : null,
      maxDiscountedUnits:
        typeof maxDiscountedUnits === 'number' ? maxDiscountedUnits : null,
    });
  }

  return valid;
}

function validOrderTiers(tiers: unknown[]): OrderTier[] {
  const valid: OrderTier[] = [];

  for (const tier of tiers) {
    if (typeof tier !== 'object' || tier === null) continue;

    const candidate = tier as Record<string, unknown>;
    const {minSubtotal, percentage} = candidate;

    if (
      typeof minSubtotal !== 'number' ||
      !Number.isFinite(minSubtotal) ||
      minSubtotal <= 0
    ) {
      continue;
    }

    if (!isPercentage(percentage)) continue;

    valid.push({minSubtotal, percentage});
  }

  return valid;
}

/**
 * A cart with no identified customer cannot satisfy any rule that depends on
 * who the buyer is. That is not an edge case: an automatic discount runs on
 * anonymous carts too, and such a cart has no order history to read, so a
 * first order discount simply does not apply until the buyer is known.
 */
function isCustomerEligible(
  buyerIdentity: BuyerIdentity,
  rule: CustomerEligibility | null | undefined,
): boolean {
  switch (rule) {
    case 'signedIn':
      return buyerIdentity?.isAuthenticated === true;
    case 'firstOrder': {
      const customer = buyerIdentity?.customer;
      return !!customer && customer.numberOfOrders === 0;
    }
    case 'returning': {
      const customer = buyerIdentity?.customer;
      return !!customer && customer.numberOfOrders > 0;
    }
    default:
      return true;
  }
}

/**
 * Which cart lines this discount is allowed to touch. Collection membership is
 * resolved by Shopify through the inSelectedCollection field, because a
 * function cannot look collections up for itself.
 */
function isEligible(line: Line, appliesTo: AppliesTo | null | undefined) {
  const merchandise = line.merchandise;

  // Anything that is not a product variant, such as a custom line item, has no
  // product to match against.
  if (merchandise.__typename !== 'ProductVariant') {
    return !appliesTo || !appliesTo.type || appliesTo.type === 'all';
  }

  switch (appliesTo?.type) {
    case 'products': {
      const ids = appliesTo.productIds;
      return Array.isArray(ids) && ids.includes(merchandise.product.id);
    }
    case 'collections':
      return merchandise.product.inSelectedCollection;
    default:
      return true;
  }
}

function quantityTierApplies(tier: QuantityTier, quantity: number): boolean {
  if (quantity < tier.minQuantity) return false;

  const max = tier.maxQuantity;

  return max === null || max === undefined || quantity <= max;
}

/**
 * With ranges a merchant can write tiers that overlap. The app stops that on
 * the way in, but a config can also be written by hand, so pick the tier that
 * is best for the customer rather than trusting the order of the list.
 */
function bestQuantityTier(
  tiers: QuantityTier[],
  quantity: number,
): QuantityTier | null {
  let best: QuantityTier | null = null;

  for (const tier of tiers) {
    if (!quantityTierApplies(tier, quantity)) continue;

    if (
      best === null ||
      tier.percentage > best.percentage ||
      (tier.percentage === best.percentage &&
        tier.minQuantity > best.minQuantity)
    ) {
      best = tier;
    }
  }

  return best;
}

/** The highest threshold the subtotal has reached. */
function bestOrderTier(
  tiers: OrderTier[],
  subtotalCents: number,
): OrderTier | null {
  let best: OrderTier | null = null;

  for (const tier of tiers) {
    if (subtotalCents < toCents(tier.minSubtotal)) continue;

    if (
      best === null ||
      tier.percentage > best.percentage ||
      (tier.percentage === best.percentage &&
        tier.minSubtotal > best.minSubtotal)
    ) {
      best = tier;
    }
  }

  return best;
}

/**
 * Spreads a cap on discounted units across the cart lines, in cart order,
 * until the cap runs out. A target with no quantity discounts the whole line,
 * which is what an uncapped tier should do.
 */
function buildTargets(
  lines: Line[],
  maxDiscountedUnits: number | null | undefined,
): ProductDiscountCandidateTarget[] {
  if (maxDiscountedUnits === null || maxDiscountedUnits === undefined) {
    return lines.map((line) => ({cartLine: {id: line.id}}));
  }

  const targets: ProductDiscountCandidateTarget[] = [];
  let remaining = maxDiscountedUnits;

  for (const line of lines) {
    if (remaining <= 0) break;

    const quantity = Math.min(remaining, line.quantity);
    targets.push({cartLine: {id: line.id, quantity}});
    remaining -= quantity;
  }

  return targets;
}

/** A percentage off every cart line, once the cart holds enough items. */
function runQuantityTiers(
  input: CartInput,
  config: TierConfig,
): CartOperation[] {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return [];
  }

  const tiers = validQuantityTiers(config.tiers ?? []);
  if (!tiers.length) return [];

  // Only the lines this discount targets count toward the quantity, and only
  // those lines are discounted.
  const eligibleLines = input.cart.lines.filter((line) =>
    isEligible(line, config.appliesTo),
  );
  if (!eligibleLines.length) return [];

  const totalQuantity = eligibleLines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  const tier = bestQuantityTier(tiers, totalQuantity);
  if (!tier) return [];

  const targets = buildTargets(eligibleLines, tier.maxDiscountedUnits);
  if (!targets.length) return [];

  return [
    {
      productDiscountsAdd: {
        candidates: [
          {
            message: `${tier.percentage}% OFF`,
            targets,
            value: {percentage: {value: String(tier.percentage)}},
          },
        ],
        selectionStrategy: ProductDiscountSelectionStrategy.First,
      },
    },
  ];
}

/**
 * A percentage off the whole order once the subtotal reaches a threshold.
 *
 * The cart subtotal is in the buyer's presentment currency, so it is converted
 * back to the shop's currency before being compared. Thresholds are entered in
 * the shop's currency and therefore mean the same amount of value to every
 * buyer, whatever they are paying in.
 */
function runOrderThreshold(
  input: CartInput,
  config: TierConfig,
): CartOperation[] {
  if (!input.discount.discountClasses.includes(DiscountClass.Order)) {
    return [];
  }

  const tiers = validOrderTiers(config.tiers ?? []);
  if (!tiers.length) return [];

  const presentmentSubtotal = Number(input.cart.cost.subtotalAmount.amount);
  if (!Number.isFinite(presentmentSubtotal)) return [];

  const rate = Number(input.presentmentCurrencyRate);
  const shopSubtotal =
    Number.isFinite(rate) && rate > 0
      ? presentmentSubtotal / rate
      : presentmentSubtotal;

  const tier = bestOrderTier(tiers, toCents(shopSubtotal));
  if (!tier) return [];

  return [
    {
      orderDiscountsAdd: {
        candidates: [
          {
            message: `${tier.percentage}% OFF YOUR ORDER`,
            targets: [{orderSubtotal: {excludedCartLineIds: []}}],
            value: {percentage: {value: String(tier.percentage)}},
          },
        ],
        selectionStrategy: OrderDiscountSelectionStrategy.First,
      },
    },
  ];
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  // Shared guards: an empty cart, a discount with no configuration, and a
  // buyer who does not meet the customer rule all produce no operations,
  // whatever the discount type is.
  if (!input.cart.lines.length) return NOTHING;

  const config = input.discount.metafield?.jsonValue as
    | TierConfig
    | null
    | undefined;

  if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    return NOTHING;
  }

  if (!isCustomerEligible(input.cart.buyerIdentity, config.customerEligibility)) {
    return NOTHING;
  }

  // A config written before order thresholds existed has no type at all, and
  // every one of those is a quantity tier discount.
  const operations =
    config.type === 'order_threshold'
      ? runOrderThreshold(input, config)
      : runQuantityTiers(input, config);

  return {operations};
}
