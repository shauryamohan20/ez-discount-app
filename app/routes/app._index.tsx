import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { listTieredDiscounts } from "../models/discounts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const discounts = await listTieredDiscounts(admin);

    return {
      total: discounts.length,
      active: discounts.filter((discount) => discount.status === "ACTIVE")
        .length,
      loadFailed: false,
    };
  } catch {
    // The overview is not worth failing the page over. The discounts page
    // reports the real error.
    return { total: 0, active: 0, loadFailed: true };
  }
};

export default function HomePage() {
  const { total, active, loadFailed } = useLoaderData<typeof loader>();

  return (
    <s-page heading="EZ Discounts">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/discounts/new"
      >
        Create discount
      </s-button>

      <s-section heading="Tiered quantity discounts">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Reward customers for buying more. Set a percentage off for each
            quantity threshold, and the cart gets the best tier it qualifies
            for, automatically. No discount code needed.
          </s-paragraph>

          {loadFailed ? (
            <s-paragraph>
              <s-link href="/app/discounts">View your discounts</s-link>
            </s-paragraph>
          ) : total === 0 ? (
            <s-paragraph>
              You have not created a discount yet.{" "}
              <s-link href="/app/discounts/new">Create your first one</s-link>.
            </s-paragraph>
          ) : (
            <s-paragraph>
              You have {total} tiered {total === 1 ? "discount" : "discounts"},{" "}
              {active} of them active.{" "}
              <s-link href="/app/discounts">Manage discounts</s-link>.
            </s-paragraph>
          )}
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
