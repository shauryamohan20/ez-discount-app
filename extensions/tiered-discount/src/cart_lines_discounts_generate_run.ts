import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

type Tier = { minQuantity: number; percentage: number };
type TierConfig = { tiers?: Tier[] };

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

  // Highest tier the cart qualifies for
  const tier = [...tiers]
    .sort((a, b) => b.minQuantity - a.minQuantity)
    .find((t) => totalQuantity >= t.minQuantity);

  if (!tier) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: `${tier.percentage}% OFF`,
              targets: lines.map((line) => ({
                cartLine: {id: line.id},
              })),
              value: {percentage: {value: tier.percentage}},
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}