import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  getShopTimezoneOffsetMinutes,
  listTieredDiscounts,
  type DiscountStatus,
  type TieredDiscount,
} from "../models/discounts.server";
import { formatShopDate } from "../lib/shop-time";
import { summarizeTiers } from "../lib/tiers";

const STATUS_LABELS: Record<DiscountStatus, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
};

const STATUS_TONES: Record<DiscountStatus, "success" | "info" | "neutral"> = {
  ACTIVE: "success",
  SCHEDULED: "info",
  EXPIRED: "neutral",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [offsetMinutes, discounts] = await Promise.all([
      getShopTimezoneOffsetMinutes(admin),
      listTieredDiscounts(admin),
    ]);

    return { discounts, offsetMinutes, error: null };
  } catch (error) {
    return {
      discounts: [] as TieredDiscount[],
      offsetMinutes: 0,
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong loading your discounts.",
    };
  }
};

function discountIdSuffix(id: string) {
  return id.split("/").pop() ?? id;
}

export default function DiscountsPage() {
  const { discounts, offsetMinutes, error } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Tiered discounts">
      <s-button slot="primary-action" variant="primary" href="/app/discounts/new">
        Create discount
      </s-button>

      {error && (
        <s-banner slot="supplemental-start" tone="critical" heading="Could not load discounts">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      )}

      {!error && discounts.length === 0 ? (
        <s-section>
          <s-empty-state heading="No tiered discounts yet">
            <s-text slot="subheading">
              Create a discount that takes more off the more items a customer
              adds to their cart.
            </s-text>
            <s-button slot="primary-action" variant="primary" href="/app/discounts/new">
              Create discount
            </s-button>
          </s-empty-state>
        </s-section>
      ) : null}

      {discounts.length > 0 && (
        <s-section padding="none">
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Title</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="labeled">Tiers</s-table-header>
              <s-table-header listSlot="labeled">Starts</s-table-header>
              <s-table-header listSlot="labeled">Ends</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {discounts.map((discount) => {
                const linkId = `discount-${discountIdSuffix(discount.id)}`;
                const editable = discount.config.status === "ok";

                return (
                  <s-table-row
                    key={discount.id}
                    {...(editable ? { clickDelegate: linkId } : {})}
                  >
                    <s-table-cell>
                      {editable ? (
                        <s-link
                          id={linkId}
                          href={`/app/discounts/${encodeURIComponent(discount.id)}`}
                        >
                          {discount.title}
                        </s-link>
                      ) : (
                        <s-text>{discount.title}</s-text>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      <s-badge tone={STATUS_TONES[discount.status]}>
                        {STATUS_LABELS[discount.status]}
                      </s-badge>
                    </s-table-cell>

                    <s-table-cell>
                      {discount.config.status === "ok" ? (
                        <s-text>{summarizeTiers(discount.config.tiers)}</s-text>
                      ) : (
                        <s-stack direction="block" gap="small-300">
                          <s-badge tone="warning">Not editable</s-badge>
                          <s-text color="subdued">{discount.config.reason}</s-text>
                        </s-stack>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      <s-text>{formatShopDate(discount.startsAt, offsetMinutes)}</s-text>
                    </s-table-cell>

                    <s-table-cell>
                      <s-text>
                        {discount.endsAt
                          ? formatShopDate(discount.endsAt, offsetMinutes)
                          : "No end date"}
                      </s-text>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
