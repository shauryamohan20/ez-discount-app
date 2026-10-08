import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { DiscountList } from "../components/DiscountList";
import {
  getShopTimezoneOffsetMinutes,
  listTieredDiscounts,
  runDiscountRowAction,
} from "../models/discounts.server";
import type { TieredDiscount } from "../models/discounts.server";
import {
  CUSTOMER_ELIGIBILITY_LABELS,
  summarizeAppliesTo,
  summarizeTiers,
} from "../lib/tiers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [offsetMinutes, all] = await Promise.all([
      getShopTimezoneOffsetMinutes(admin),
      listTieredDiscounts(admin),
    ]);

    // A config this build cannot read has no type to filter on, so it is shown
    // on this tab, which is where every discount lived before the split.
    const discounts = all.filter(
      (discount) =>
        discount.config.status !== "ok" ||
        discount.config.type === "quantity_tiers",
    );

    return { discounts, offsetMinutes, error: null };
  } catch (error) {
    return {
      discounts: [] as TieredDiscount[],
      offsetMinutes: 0,
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong loading your discounts.",
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  return runDiscountRowAction(admin, await request.formData());
};

export default function QuantityDiscountsPage() {
  const { discounts, offsetMinutes, error } = useLoaderData<typeof loader>();

  return (
    <DiscountList
      heading="Quantity based discounts"
      discounts={discounts}
      offsetMinutes={offsetMinutes}
      error={error}
      newHref="/app/discounts/quantity/new"
      emptyHeading="No quantity based discounts yet"
      emptySubheading="Create a discount that takes more off the more items a customer adds to their cart."
      summaryHeader="Tiers"
      renderSummary={(discount) =>
        discount.config.status === "ok" ? (
          <s-stack direction="block" gap="small-500">
            {discount.config.type === "quantity_tiers" && (
              <s-text>{summarizeTiers(discount.config.tiers)}</s-text>
            )}
            <s-text color="subdued">
              {summarizeAppliesTo(discount.config.appliesTo)}
              {discount.config.customerEligibility === "all"
                ? ""
                : ` to ${CUSTOMER_ELIGIBILITY_LABELS[
                    discount.config.customerEligibility
                  ].toLowerCase()}`}
            </s-text>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="small-300">
            <s-badge tone="warning">Not editable</s-badge>
            <s-text color="subdued">{discount.config.reason}</s-text>
          </s-stack>
        )
      }
    />
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
