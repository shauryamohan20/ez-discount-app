import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * The three mandatory privacy compliance webhooks, subscribed to under
 * compliance_topics in shopify.app.toml.
 *
 * authenticate.webhook verifies the request's HMAC signature and rejects an
 * invalid one with 401 before anything below runs, which is what Shopify
 * requires. Returning any 2xx response acknowledges receipt.
 *
 * What this app holds about a shop: only its Shopify sessions in the app's own
 * database. They are offline sessions, so they carry no staff or customer
 * details. The app stores no customer or order data at all; discounts and
 * their settings live in Shopify, which erases its own data.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // There is no customer or order data to provide or erase, so
      // acknowledging the request is the complete response.
      break;

    case "SHOP_REDACT":
      // Sent 48 hours after the shop uninstalls the app. Erase everything the
      // app holds for it. The uninstall webhook normally deleted the sessions
      // already, so this usually finds nothing, which is fine.
      await db.session.deleteMany({ where: { shop } });
      break;
  }

  return new Response();
};
