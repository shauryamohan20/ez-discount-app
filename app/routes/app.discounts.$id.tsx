import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { redirectToDiscount } from "../models/discount-routing.server";
import { DiscountNotFound } from "../components/DiscountNotFound";

/**
 * Discount URLs from the first version of the app, such as /app/discounts/123,
 * which predate both codes and the split into tabs. Kept so they still reach
 * the discount instead of a 404.
 */
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  redirectToDiscount(request, params.id);

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <DiscountNotFound />;
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
