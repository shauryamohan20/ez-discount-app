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
import { discountTab } from "../lib/discount-id";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [offsetMinutes, all] = await Promise.all([
      getShopTimezoneOffsetMinutes(admin),
      listTieredDiscounts(admin),
    ]);

    const discounts = all.filter(
      (discount) => discountTab(discount) === "quantity",
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
    />
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
