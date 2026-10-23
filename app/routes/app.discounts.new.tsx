import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { APP_NAME } from "../lib/brand";
import { KindIcon, type DiscountKindIcon } from "../components/KindIcon";

/**
 * One Function backs every kind of discount, so anything that asks to create
 * "a discount from this app" without saying which kind lands here: the Home
 * page, the Shopify admin's own create flow, and older links that predate the
 * split into tabs.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

type TileProps = {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: DiscountKindIcon;
};

/** One kind of discount, laid out like the tiles on the Home page. */
function DiscountKindTile({
  title,
  description,
  href,
  action,
  icon,
}: TileProps) {
  return (
    <s-box
      background="base"
      border="base"
      borderRadius="base"
      padding="base"
      minBlockSize="180px"
      // Fills its grid cell, so every tile in a row is the same height.
      blockSize="100%"
      inlineSize="100%"
    >
      {/* The button sits in its own row at the bottom, so the buttons line up
          across tiles whatever the length of the descriptions above them. */}
      <s-grid gridTemplateRows="1fr auto" gap="base" blockSize="100%">
        <s-stack direction="block" gap="base">
          <KindIcon kind={icon} />
          <s-text type="strong">{title}</s-text>
          <s-paragraph>{description}</s-paragraph>
        </s-stack>
        <s-stack direction="inline">
          <s-button variant="primary" href={href}>
            {action}
          </s-button>
        </s-stack>
      </s-grid>
    </s-box>
  );
}

export default function ChooseDiscountKindPage() {
  return (
    <s-page heading="Create a discount" inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app">
        {APP_NAME}
      </s-link>

      <s-section heading="Choose a kind of discount">
        <s-query-container>
          <s-grid
            gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr"
            gap="base"
          >
            <s-grid-item>
              <DiscountKindTile
                title="Quantity based discount"
                description="A percentage off the items in the cart, based on how many there are. Use quantity ranges, exact quantities, a cap on discounted units, and product or collection targeting."
                href="/app/discounts/quantity/new"
                icon="quantity"
                action="Create quantity based discount"
              />
            </s-grid-item>

            <s-grid-item>
              <DiscountKindTile
                title="Whole order discount"
                description="A percentage off the entire order, free shipping, or both, once the cart subtotal reaches an amount you set. Spend 50 for free shipping, spend 100 for 10% off."
                href="/app/discounts/order/new"
                icon="order"
                action="Create whole order discount"
              />
            </s-grid-item>

            <s-grid-item>
              <DiscountKindTile
                title="Buy X Get Y discount"
                description="Buy a quantity of some products and get others free or at a percentage off. Buy 2 get 1 free, buy 2 get the third at half price, or buy one product and get a different one."
                href="/app/discounts/bxgy/new"
                icon="bxgy"
                action="Create Buy X Get Y discount"
              />
            </s-grid-item>
          </s-grid>
        </s-query-container>
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
