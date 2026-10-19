import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

/**
 * Where the Shopify admin sends a merchant who picks this app's discount type
 * in its own create flow, as configured under [extensions.ui.paths] in the
 * Function's toml. One Function backs both kinds of discount, so the merchant
 * chooses which kind next.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);

  return redirect("/app/discounts/new");
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
