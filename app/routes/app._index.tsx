import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { listTieredDiscounts } from "../models/discounts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const discounts = await listTieredDiscounts(admin);

    // An unreadable config has no type, and lives on the quantity tab, which
    // is where every discount lived before the split.
    const isOrderThreshold = (discount: (typeof discounts)[number]) =>
      discount.config.status === "ok" &&
      discount.config.type === "order_threshold";

    const quantity = discounts.filter((discount) => !isOrderThreshold(discount));
    const order = discounts.filter(isOrderThreshold);

    const counts = (group: typeof discounts) => ({
      total: group.length,
      active: group.filter((discount) => discount.status === "ACTIVE").length,
    });

    return {
      quantity: counts(quantity),
      order: counts(order),
      loadFailed: false,
    };
  } catch {
    // The overview is not worth failing the page over. The discounts page
    // reports the real error.
    return {
      quantity: { total: 0, active: 0 },
      order: { total: 0, active: 0 },
      loadFailed: true,
    };
  }
};

export default function HomePage() {
  const { quantity, order, loadFailed } = useLoaderData<typeof loader>();

  return (
    <s-page heading="EZ Discounts">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/discounts/quantity/new"
      >
        Create discount
      </s-button>

      <s-section heading="Quantity based discounts">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Reward customers for buying more. Set a percentage off for each
            quantity threshold, and the cart gets the best tier it qualifies
            for. Run it automatically, or behind a discount code.
          </s-paragraph>

          <s-paragraph>
            {loadFailed ? (
              <s-link href="/app/discounts/quantity">View your discounts</s-link>
            ) : quantity.total === 0 ? (
              <s-link href="/app/discounts/quantity/new">
                Create your first one
              </s-link>
            ) : (
              <s-text>
                {quantity.total}{" "}
                {quantity.total === 1 ? "discount" : "discounts"},{" "}
                {quantity.active} active.{" "}
                <s-link href="/app/discounts/quantity">Manage</s-link>
              </s-text>
            )}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Whole order discounts">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Take a percentage off the whole order once the cart subtotal
            reaches an amount you set. Spend 100 and save 10 percent, spend 200
            and save 15.
          </s-paragraph>

          <s-paragraph>
            {loadFailed ? (
              <s-link href="/app/discounts/order">View your discounts</s-link>
            ) : order.total === 0 ? (
              <s-link href="/app/discounts/order/new">
                Create your first one
              </s-link>
            ) : (
              <s-text>
                {order.total} {order.total === 1 ? "discount" : "discounts"},{" "}
                {order.active} active.{" "}
                <s-link href="/app/discounts/order">Manage</s-link>
              </s-text>
            )}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-ordered-list>
          <s-list-item>
            Add tiers, such as 3 items for 10% off and 5 items for 15% off.
          </s-list-item>
          <s-list-item>
            Every item in the cart counts toward the total quantity.
          </s-list-item>
          <s-list-item>
            The highest tier the cart qualifies for applies to every line.
          </s-list-item>
        </s-ordered-list>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
