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
  getBuyXGetYTitles,
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
      (discount) => discountTab(discount) === "bxgy",
    );
    const titles = await getBuyXGetYTitles(admin, discounts);

    return { discounts, offsetMinutes, titles, error: null };
  } catch (error) {
    return {
      discounts: [] as TieredDiscount[],
      offsetMinutes: 0,
      titles: {} as Record<string, string>,
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

export default function BuyXGetYDiscountsPage() {
  const { discounts, offsetMinutes, titles, error } =
    useLoaderData<typeof loader>();

  return (
    <DiscountList
      heading="Buy X Get Y discounts"
      discounts={discounts}
      offsetMinutes={offsetMinutes}
      error={error}
      titles={titles}
      newHref="/app/discounts/bxgy/new"
      emptyHeading="No Buy X Get Y discounts yet"
      emptySubheading="Create an offer like buy 2 get 1 free, or buy one product and get another at a discount."
    />
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
