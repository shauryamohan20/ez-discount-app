import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { redirectToDiscount } from "../models/discount-routing.server";
import { DiscountNotFound } from "../components/DiscountNotFound";

/**
 * Where the Shopify admin sends a merchant who opens one of this app's discounts,
 * as configured under [extensions.ui.paths] in the Function's toml. The admin
 * passes the numeric ID only, so the discount is looked up to find its tab.
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
