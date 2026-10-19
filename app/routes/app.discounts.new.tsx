import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

/**
 * One Function backs both kinds of discount, so anything that asks to create
 * "a discount from this app" without saying which kind lands here: the Home
 * page, the Shopify admin's own create flow, and older links that predate the
 * split into tabs.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function ChooseDiscountKindPage() {
  return (
    <s-page heading="Create a discount">
      <s-link slot="breadcrumb-actions" href="/app">
        EZ Discounts
      </s-link>

      <s-section heading="Quantity based discount">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            A percentage off the items in the cart, based on how many there are.
            Use quantity ranges, exact quantities, a cap on discounted units,
            and product or collection targeting.
          </s-paragraph>
          <s-stack direction="inline">
            <s-button variant="primary" href="/app/discounts/quantity/new">
              Create quantity based discount
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Whole order discount">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            A percentage off the entire order once the cart subtotal reaches an
            amount you set. Spend 100 for 10% off, spend 200 for 15% off.
          </s-paragraph>
          <s-stack direction="inline">
            <s-button variant="primary" href="/app/discounts/order/new">
              Create whole order discount
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Buy X Get Y discount">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Buy a quantity of some products and get others free or at a
            percentage off. Buy 2 get 1 free, buy 2 get the third at half price,
            or buy one product and get a different one.
          </s-paragraph>
          <s-stack direction="inline">
            <s-button variant="primary" href="/app/discounts/bxgy/new">
              Create Buy X Get Y discount
            </s-button>
          </s-stack>
        </s-stack>
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
