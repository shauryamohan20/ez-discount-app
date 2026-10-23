import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { APP_NAME, APP_WEBSITE_LABEL, APP_WEBSITE_URL } from "../lib/brand";
import { KindIcon, type DiscountKindIcon } from "../components/KindIcon";
import { DiscountTable } from "../components/DiscountTable";
import {
  getBuyXGetYTitles,
  getShopTimezoneOffsetMinutes,
  listTieredDiscounts,
  runDiscountRowAction,
} from "../models/discounts.server";
import type { TieredDiscount } from "../models/discounts.server";
import { discountTab, type DiscountTab } from "../lib/discount-id";

type KindCounts = Record<DiscountTab, { total: number; active: number }>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [offsetMinutes, discounts] = await Promise.all([
      getShopTimezoneOffsetMinutes(admin),
      listTieredDiscounts(admin),
    ]);

    const counts: KindCounts = {
      quantity: { total: 0, active: 0 },
      order: { total: 0, active: 0 },
      bxgy: { total: 0, active: 0 },
    };

    for (const discount of discounts) {
      const kind = counts[discountTab(discount)];
      kind.total += 1;
      if (discount.status === "ACTIVE") kind.active += 1;
    }

    const titles = await getBuyXGetYTitles(admin, discounts);

    return { discounts, offsetMinutes, counts, titles, error: null };
  } catch (error) {
    return {
      discounts: [] as TieredDiscount[],
      offsetMinutes: 0,
      counts: null,
      titles: {} as Record<string, string>,
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong loading your discounts.",
    };
  }
};

/** The table below the tiles has row actions, which post here. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  return runDiscountRowAction(admin, await request.formData());
};

/** "3 discounts, 2 active", or nothing when the counts could not be read. */
function describeCounts(counts: { total: number; active: number } | undefined) {
  if (!counts) return "";
  if (counts.total === 0) return "None yet";

  return `${counts.total} ${counts.total === 1 ? "discount" : "discounts"}, ${
    counts.active
  } active`;
}

type TileProps = {
  href: string;
  title: string;
  description: string;
  status: string;
  icon: DiscountKindIcon;
};

/** One kind of discount. The whole tile is the link to that kind's page. */
function DiscountKindTile({
  href,
  title,
  description,
  status,
  icon,
}: TileProps) {
  return (
    <s-clickable
      href={href}
      accessibilityLabel={`Open ${title.toLowerCase()} discounts`}
      background="base"
      border="base"
      borderRadius="base"
      padding="base"
      minBlockSize="160px"
      // Fills its grid cell, so every tile in a row is the same height.
      blockSize="100%"
      inlineSize="100%"
    >
      <s-stack direction="block" gap="small-200">
        <KindIcon kind={icon} />
        <s-text type="strong">{title}</s-text>
        <s-text>{description}</s-text>
        {status && <s-text color="subdued">{status}</s-text>}
      </s-stack>
    </s-clickable>
  );
}

export default function HomePage() {
  const { discounts, offsetMinutes, counts, titles, error } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading={APP_NAME} inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/discounts/new"
      >
        Create discount
      </s-button>

      {error && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading="Could not load discounts"
        >
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="Discount types">
        <s-query-container>
          <s-grid
            gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr 1fr, 1fr"
            gap="base"
          >
            <s-grid-item>
              <DiscountKindTile
                href="/app/discounts/quantity"
                icon="quantity"
                title="Quantity based"
                description="Take more off the more items a customer buys, with quantity ranges, exact quantities and a cap on discounted units."
                status={describeCounts(counts?.quantity)}
              />
            </s-grid-item>

            <s-grid-item>
              <DiscountKindTile
                href="/app/discounts/order"
                icon="order"
                title="Whole order"
                description="Take a percentage off the entire order once the cart subtotal reaches an amount you set."
                status={describeCounts(counts?.order)}
              />
            </s-grid-item>

            <s-grid-item>
              <DiscountKindTile
                href="/app/discounts/bxgy"
                icon="bxgy"
                title="Buy X Get Y"
                description="Buy a quantity of some products and get others free or at a discount, such as buy 2 get 1 free."
                status={describeCounts(counts?.bxgy)}
              />
            </s-grid-item>
          </s-grid>
        </s-query-container>
      </s-section>

      {!error && discounts.length === 0 ? (
        <s-section heading="Your discounts">
          <s-empty-state heading="No discounts yet">
            <s-text slot="subheading">
              Pick a discount type above to create your first one.
            </s-text>
            <s-button
              slot="primary-action"
              variant="primary"
              href="/app/discounts/new"
            >
              Create discount
            </s-button>
          </s-empty-state>
        </s-section>
      ) : null}

      {discounts.length > 0 && (
        <DiscountTable
          heading="Your discounts"
          discounts={discounts}
          offsetMinutes={offsetMinutes}
          titles={titles}
        />
      )}

      <s-section>
        <s-paragraph>
          Guides, help and updates at{" "}
          <s-link href={APP_WEBSITE_URL} target="_blank">
            {APP_WEBSITE_LABEL}
          </s-link>
          .
        </s-paragraph>
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
