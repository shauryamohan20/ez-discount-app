import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  ProductDiscountCandidateTarget,
} from '../generated/api';

/**
 * Written by the app into the `$app:tiered` / `config` metafield.
 *
 * Version 1 tiers only had minQuantity and percentage and were always open
 * ended, so a missing maxQuantity or maxDiscountedUnits means "no limit" and
 * version 1 configs keep working untouched.
 */
type Tier = {
  minQuantity: number;
  maxQuantity?: number | null;
  percentage: number;
  maxDiscountedUnits?: number | null;
};

type TierConfig = {tiers?: Tier[]};

type Line = CartInput['cart']['lines'][number];

function isApplicable(tier: Tier, quantity: number): boolean {
  if (quantity < tier.minQuantity) return false;

  const max = tier.maxQuantity;

  return max === null || max === undefined || quantity <= max;
}

/**
 * With ranges a merchant can write tiers that overlap. The app stops that on
 * the way in, but a config can also be written by hand, so pick the tier that
 * is best for the customer rather than trusting the order of the list.
 */
function bestTier(tiers: Tier[], quantity: number): Tier | null {
  let best: Tier | null = null;

  for (const tier of tiers) {
    if (!isApplicable(tier, quantity)) continue;

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

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  const lines = input.cart.lines;

  // Empty cart: nothing to do
  if (!lines.length) {
    return {operations: []};
  }

  // Only run if the discount is set up as a product discount
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return {operations: []};
  }

  // Read the merchant's settings
  const config = input.discount.metafield?.jsonValue as
    | TierConfig
    | null
    | undefined;
  const tiers = config?.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return {operations: []};
  }

  // Total items in the cart
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const tier = bestTier(tiers, totalQuantity);
  if (!tier) {
    return {operations: []};
  }

  const targets = buildTargets(lines, tier.maxDiscountedUnits);
  if (!targets.length) {
    return {operations: []};
  }

  return {
    operations: [
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
    ],
  };
}
