import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  DISCOUNT_FUNCTION_HANDLE,
  TIER_METAFIELD_KEY,
  TIER_METAFIELD_NAMESPACE,
  TIER_METAFIELD_TYPE,
  parseTierConfig,
  serializeTierConfig,
  type Tier,
  type TierConfig,
} from "../lib/tiers";

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

export type TieredDiscountInput = {
  title: string;
  /** ISO 8601 instant, already resolved against the shop's time zone. */
  startsAt: string;
  endsAt: string | null;
  combinesWithShipping: boolean;
  tiers: Tier[];
};

export type DiscountUserError = {
  field?: string[] | null;
  message: string;
};

export type MutationResult =
  | { ok: true; id: string }
  | { ok: false; userErrors: DiscountUserError[] };

const CREATE_DISCOUNT_MUTATION = `#graphql
  mutation CreateTieredDiscount($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * The Function is referenced by handle, not by ID. Handles are stable across
 * stores and environments, and functionId is deprecated as of 2025-10.
 */
function toDiscountInput(input: TieredDiscountInput) {
  return {
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    discountClasses: ["PRODUCT"],
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: input.combinesWithShipping,
    },
    metafields: [
      {
        namespace: TIER_METAFIELD_NAMESPACE,
        key: TIER_METAFIELD_KEY,
        type: TIER_METAFIELD_TYPE,
        value: serializeTierConfig(input.tiers),
      },
    ],
  };
}

export async function createTieredDiscount(
  admin: AdminApiContext,
  input: TieredDiscountInput,
): Promise<MutationResult> {
  const data = await adminRequest<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null;
      userErrors: DiscountUserError[];
    };
  }>(admin, CREATE_DISCOUNT_MUTATION, {
    discount: {
      ...toDiscountInput(input),
      functionHandle: DISCOUNT_FUNCTION_HANDLE,
    },
  });

  const payload = data.discountAutomaticAppCreate;

  if (payload.userErrors.length > 0 || !payload.automaticAppDiscount) {
    return {
      ok: false,
      userErrors: payload.userErrors.length
        ? payload.userErrors
        : [{ message: "Shopify did not return the created discount." }],
    };
  }

  return { ok: true, id: payload.automaticAppDiscount.discountId };
}

const UPDATE_DISCOUNT_MUTATION = `#graphql
  mutation UpdateTieredDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function updateTieredDiscount(
  admin: AdminApiContext,
  id: string,
  input: TieredDiscountInput,
): Promise<MutationResult> {
  const data = await adminRequest<{
    discountAutomaticAppUpdate: {
      automaticAppDiscount: { discountId: string } | null;
      userErrors: DiscountUserError[];
    };
  }>(admin, UPDATE_DISCOUNT_MUTATION, {
    id,
    // The metafield is identified by namespace and key, so the same block
    // works whether it already exists or not.
    discount: toDiscountInput(input),
  });

  const payload = data.discountAutomaticAppUpdate;

  if (payload.userErrors.length > 0 || !payload.automaticAppDiscount) {
    return {
      ok: false,
      userErrors: payload.userErrors.length
        ? payload.userErrors
        : [{ message: "Shopify did not return the updated discount." }],
    };
  }

  return { ok: true, id: payload.automaticAppDiscount.discountId };
}

const DISCOUNT_GID_PREFIX = "gid://shopify/DiscountAutomaticNode/";

/** The trailing number of a discount gid, used in app URLs. */
export function toDiscountNumericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

/** Rebuilds a gid from a URL parameter, or null when it is not a number. */
export function toDiscountGid(numericId: string | undefined): string | null {
  if (!numericId || !/^\d+$/.test(numericId)) return null;

  return `${DISCOUNT_GID_PREFIX}${numericId}`;
}
