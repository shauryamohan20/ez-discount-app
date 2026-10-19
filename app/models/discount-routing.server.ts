import { authenticate } from "../shopify.server";
import {
  discountEditPath,
  findTieredDiscountByNumericId,
} from "./discounts.server";

/**
 * Sends a request that only knows a discount's numeric ID to that discount's
 * edit page, on the right tab and for the right method.
 *
 * Shopify's own redirect is used rather than React Router's, because on a full
 * page load inside the admin it keeps the embedded app's shop, host and
 * session parameters. Dropping them would send the merchant back through
 * authentication instead of to the discount.
 */
export async function redirectToDiscount(
  request: Request,
  numericId: string | undefined,
): Promise<never> {
  const { admin, redirect } = await authenticate.admin(request);

  const discount = await findTieredDiscountByNumericId(admin, numericId);

  if (!discount) {
    throw new Response("Not found", { status: 404 });
  }

  throw redirect(discountEditPath(discount));
}
