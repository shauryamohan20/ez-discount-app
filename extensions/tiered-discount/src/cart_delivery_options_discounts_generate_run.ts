import {
  DeliveryDiscountSelectionStrategy,
  DiscountClass,
  CartDeliveryOptionsDiscountsGenerateRunResult,
  DeliveryDiscountCandidateTarget,
  DeliveryInput,
} from "../generated/api";
import {
  orderThresholdOutcome,
  shopSubtotalCents,
  validOrderTiers,
} from "./order_threshold";
import {
  isCustomerEligible,
  isWithinSchedule,
  readConfig,
  type CustomerEligibility,
} from "./shared";

const NOTHING: CartDeliveryOptionsDiscountsGenerateRunResult = {
  operations: [],
};

/**
 * Free shipping for whole order thresholds. Shopify only runs this target for
 * a discount saved with the SHIPPING class, which the app adds only when at
 * least one threshold gives free shipping. Every other kind of discount
 * produces nothing here.
 */
export function cartDeliveryOptionsDiscountsGenerateRun(
  input: DeliveryInput,
): CartDeliveryOptionsDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Shipping)) {
    return NOTHING;
  }

  const config = readConfig(input.discount.metafield?.jsonValue);
  if (!config || config.type !== "order_threshold") return NOTHING;

  if (
    !isCustomerEligible(
      input.cart.buyerIdentity,
      config.customerEligibility as CustomerEligibility | null | undefined,
    )
  ) {
    return NOTHING;
  }

  if (!isWithinSchedule(config.schedule, input.shop.localTime)) return NOTHING;

  const tiers = validOrderTiers(config.tiers);
  if (!tiers.length) return NOTHING;

  const subtotalCents = shopSubtotalCents(
    input.cart.cost.subtotalAmount.amount,
    input.presentmentCurrencyRate,
  );
  if (subtotalCents === null) return NOTHING;

  if (!orderThresholdOutcome(tiers, subtotalCents).freeShipping) {
    return NOTHING;
  }

  const targets: DeliveryDiscountCandidateTarget[] =
    input.cart.deliveryGroups.flatMap((group) =>
      group.deliveryOptions.map((option) => ({
        deliveryOption: { handle: option.handle },
      })),
    );
  if (!targets.length) return NOTHING;

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: "FREE SHIPPING",
              targets,
              value: { percentage: { value: "100" } },
            },
          ],
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
