import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

/**
 * The discounts section used to be a single page. It is now one tab per
 * discount type, so this keeps older links and bookmarks working. Shopify's
 * redirect keeps the embedded app's parameters on a full page load.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);

  return redirect("/app/discounts/quantity");
};
