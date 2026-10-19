import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

/**
 * The app opens straight onto its first discount tab rather than an overview
 * page. Shopify's redirect keeps the embedded app's parameters on a full page
 * load, which is how the admin opens the app.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);

  return redirect("/app/discounts/quantity");
};
