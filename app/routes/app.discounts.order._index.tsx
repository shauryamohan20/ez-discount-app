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
  getShopCurrencyCode,
  getShopTimezoneOffsetMinutes,
  listTieredDiscounts,
  runDiscountRowAction,
} from "../models/discounts.server";
import type { TieredDiscount } from "../models/discounts.server";
import {
  CUSTOMER_ELIGIBILITY_LABELS,
  summarizeOrderTiers,
} from "../lib/tiers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [offsetMinutes, currencyCode, all] = await Promise.all([
      getShopTimezoneOffsetMinutes(admin),
      getShopCurrencyCode(admin),
      listTieredDiscounts(admin),
    ]);

    const discounts = all.filter(
      (discount) =>
        discount.config.status === "ok" &&
        discount.config.type === "order_threshold",
    );

    return { discounts, offsetMinutes, currencyCode, error: null };
  } catch (error) {
    return {
      discounts: [] as TieredDiscount[],
      offsetMinutes: 0,
      currencyCode: "",
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

export default function OrderDiscountsPage() {
  const { discounts, offsetMinutes, currencyCode, error } =
    useLoaderData<typeof loader>();

  return (
    <DiscountList
      heading="Whole order discounts"
      discounts={discounts}
      offsetMinutes={offsetMinutes}
      error={error}
      newHref="/app/discounts/order/new"
      emptyHeading="No whole order discounts yet"
      emptySubheading="Create a discount that takes a percentage off the whole order once the cart subtotal reaches an amount you set."
      summaryHeader="Thresholds"
      note={
        currencyCode && discounts.length > 0 ? (
          <s-banner slot="supplemental-start" tone="info">
            <s-paragraph>
              Thresholds are amounts in {currencyCode}, your store&apos;s
              currency. A buyer paying in another currency has their subtotal
              converted before it is compared.
            </s-paragraph>
          </s-banner>
        ) : undefined
      }
      renderSummary={(discount) =>
        discount.config.status === "ok" &&
        discount.config.type === "order_threshold" ? (
          <s-stack direction="block" gap="small-500">
            <s-text>{summarizeOrderTiers(discount.config.tiers)}</s-text>
            <s-text color="subdued">
              {discount.config.customerEligibility === "all"
                ? "All customers"
                : CUSTOMER_ELIGIBILITY_LABELS[
                    discount.config.customerEligibility
                  ]}
            </s-text>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="small-300">
            <s-badge tone="warning">Not editable</s-badge>
            <s-text color="subdued">
              {discount.config.status === "ok" ? "" : discount.config.reason}
            </s-text>
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
