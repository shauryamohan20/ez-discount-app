import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { parseTierConfig, type TierConfig } from "../lib/tiers";

export type DiscountStatus = "ACTIVE" | "EXPIRED" | "SCHEDULED";

export type TieredDiscount = {
  /** gid://shopify/DiscountAutomaticNode/... */
  id: string;
  title: string;
  status: DiscountStatus;
  startsAt: string;
  endsAt: string | null;
  combinesWithShipping: boolean;
  config: TierConfig;
};

type GraphqlResponse<T> = {
  data?: T | null;
  errors?: { message: string }[] | null;
};

type DiscountNodePayload = {
  id: string;
  metafield: { jsonValue: unknown } | null;
  discount: {
    __typename: string;
    title?: string;
    status?: DiscountStatus;
    startsAt?: string;
    endsAt?: string | null;
    combinesWith?: {
      orderDiscounts: boolean;
      productDiscounts: boolean;
      shippingDiscounts: boolean;
    };
  };
};

/** How many pages of automatic discounts the list page will walk through. */
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

const DISCOUNT_NODE_FRAGMENT = `#graphql
  fragment TieredDiscountNode on DiscountNode {
    id
    metafield(namespace: "$app:tiered", key: "config") {
      jsonValue
    }
    discount {
      __typename
      ... on DiscountAutomaticApp {
        title
        status
        startsAt
        endsAt
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
      }
    }
  }
`;

const TIERED_DISCOUNTS_QUERY = `#graphql
  query TieredDiscounts($first: Int!, $after: String) {
    discountNodes(
      first: $first
      after: $after
      query: "method:automatic"
      sortKey: CREATED_AT
      reverse: true
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...TieredDiscountNode
      }
    }
  }
  ${DISCOUNT_NODE_FRAGMENT}
`;

const TIERED_DISCOUNT_QUERY = `#graphql
  query TieredDiscount($id: ID!) {
    discountNode(id: $id) {
      ...TieredDiscountNode
    }
  }
  ${DISCOUNT_NODE_FRAGMENT}
`;

const SHOP_TIMEZONE_QUERY = `#graphql
  query ShopTimezone {
    shop {
      timezoneOffsetMinutes
    }
  }
`;

async function adminRequest<T>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(
    query,
    variables ? { variables } : undefined,
  );
  const body = (await response.json()) as GraphqlResponse<T>;

  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join(" "));
  }

  if (!body.data) {
    throw new Error("Shopify returned an empty response.");
  }

  return body.data;
}

/**
 * A node belongs to this app when it is an automatic app discount that carries
 * our config metafield. The `$app:tiered` namespace resolves to this app's
 * reserved namespace, so another app's discounts can never match.
 */
function toTieredDiscount(node: DiscountNodePayload): TieredDiscount | null {
  if (node.discount.__typename !== "DiscountAutomaticApp") return null;
  if (!node.metafield) return null;

  return {
    id: node.id,
    title: node.discount.title ?? "",
    status: node.discount.status ?? "EXPIRED",
    startsAt: node.discount.startsAt ?? "",
    endsAt: node.discount.endsAt ?? null,
    combinesWithShipping: node.discount.combinesWith?.shippingDiscounts ?? false,
    config: parseTierConfig(node.metafield.jsonValue),
  };
}

export async function getShopTimezoneOffsetMinutes(
  admin: AdminApiContext,
): Promise<number> {
  const data = await adminRequest<{ shop: { timezoneOffsetMinutes: number } }>(
    admin,
    SHOP_TIMEZONE_QUERY,
  );

  return data.shop.timezoneOffsetMinutes;
}

export async function listTieredDiscounts(
  admin: AdminApiContext,
): Promise<TieredDiscount[]> {
  const discounts: TieredDiscount[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      discountNodes: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: DiscountNodePayload[];
      };
    } = await adminRequest(admin, TIERED_DISCOUNTS_QUERY, {
      first: PAGE_SIZE,
      after,
    });

    for (const node of data.discountNodes.nodes) {
      const discount = toTieredDiscount(node);
      if (discount) discounts.push(discount);
    }

    if (!data.discountNodes.pageInfo.hasNextPage) break;
    after = data.discountNodes.pageInfo.endCursor;
  }

  return discounts;
}

export async function getTieredDiscount(
  admin: AdminApiContext,
  id: string,
): Promise<TieredDiscount | null> {
  const data = await adminRequest<{ discountNode: DiscountNodePayload | null }>(
    admin,
    TIERED_DISCOUNT_QUERY,
    { id },
  );

  if (!data.discountNode) return null;

  return toTieredDiscount(data.discountNode);
}
