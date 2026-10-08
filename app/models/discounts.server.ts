import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  DISCOUNT_FUNCTION_HANDLE,
  INPUT_VARIABLES_METAFIELD_KEY,
  TIER_METAFIELD_KEY,
  TIER_METAFIELD_NAMESPACE,
  TIER_METAFIELD_TYPE,
  parseTierConfig,
  serializeInputVariables,
  serializeTierConfig,
  type AppliesTo,
  type CustomerEligibility,
  type Tier,
  type TierConfig,
} from "../lib/tiers";
import { methodFromGid, type DiscountMethod } from "../lib/discount-id";

export type DiscountStatus = "ACTIVE" | "EXPIRED" | "SCHEDULED";

export type TieredDiscount = {
  /** gid://shopify/DiscountAutomaticNode/... or .../DiscountCodeNode/... */
  id: string;
  method: DiscountMethod;
  title: string;
  status: DiscountStatus;
  startsAt: string;
  endsAt: string | null;
  combinesWithShipping: boolean;
  /** Code discounts only. */
  code: string | null;
  usageLimit: number | null;
  appliesOncePerCustomer: boolean;
  /** Shopify updates this asynchronously, so it can lag behind real usage. */
  usageCount: number;
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
    usageLimit?: number | null;
    appliesOncePerCustomer?: boolean;
    asyncUsageCount?: number;
    codes?: { nodes: { code: string }[] };
  };
};

/** How many pages of app discounts the list page will walk through. */
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
      ... on DiscountCodeApp {
        title
        status
        startsAt
        endsAt
        usageLimit
        appliesOncePerCustomer
        asyncUsageCount
        codes(first: 1) {
          nodes {
            code
          }
        }
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
      query: "type:app"
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
 * A node belongs to this app when it is an app discount, automatic or code,
 * that carries our config metafield. The `$app:tiered` namespace resolves to
 * this app's reserved namespace, so another app's discounts can never match.
 */
function toTieredDiscount(node: DiscountNodePayload): TieredDiscount | null {
  const typename = node.discount.__typename;

  if (typename !== "DiscountAutomaticApp" && typename !== "DiscountCodeApp") {
    return null;
  }

  if (!node.metafield) return null;

  // The method decides which family of mutations applies to this discount, so
  // it is read from the ID rather than inferred from the shape of the payload.
  const method = methodFromGid(node.id);
  if (!method) return null;

  return {
    id: node.id,
    method,
    title: node.discount.title ?? "",
    status: node.discount.status ?? "EXPIRED",
    startsAt: node.discount.startsAt ?? "",
    endsAt: node.discount.endsAt ?? null,
    combinesWithShipping: node.discount.combinesWith?.shippingDiscounts ?? false,
    code: node.discount.codes?.nodes[0]?.code ?? null,
    usageLimit: node.discount.usageLimit ?? null,
    appliesOncePerCustomer: node.discount.appliesOncePerCustomer ?? false,
    usageCount: node.discount.asyncUsageCount ?? 0,
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
  method: DiscountMethod;
  /** Required when the method is code, ignored otherwise. */
  code: string | null;
  usageLimit: number | null;
  appliesOncePerCustomer: boolean;
  title: string;
  /** ISO 8601 instant, already resolved against the shop's time zone. */
  startsAt: string;
  endsAt: string | null;
  combinesWithShipping: boolean;
  appliesTo: AppliesTo;
  customerEligibility: CustomerEligibility;
  tiers: Tier[];
};

export type DiscountUserError = {
  field?: string[] | null;
  message: string;
};

export type MutationResult =
  | { ok: true; id: string }
  | { ok: false; userErrors: DiscountUserError[] };

const CREATE_AUTOMATIC_MUTATION = `#graphql
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

const CREATE_CODE_MUTATION = `#graphql
  mutation CreateTieredCodeDiscount($discount: DiscountCodeAppInput!) {
    discountCodeAppCreate(codeAppDiscount: $discount) {
      codeAppDiscount {
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
        value: serializeTierConfig(
          input.tiers,
          input.appliesTo,
          input.customerEligibility,
        ),
      },
      {
        namespace: TIER_METAFIELD_NAMESPACE,
        key: INPUT_VARIABLES_METAFIELD_KEY,
        type: TIER_METAFIELD_TYPE,
        value: serializeInputVariables(input.appliesTo),
      },
    ],
  };
}

/**
 * Usage limits and once per customer only exist on code discounts. Shopify has
 * nothing to count for an automatic discount, so those fields are dropped
 * rather than silently ignored.
 */
function toCodeDiscountInput(input: TieredDiscountInput) {
  return {
    ...toDiscountInput(input),
    code: input.code ?? "",
    usageLimit: input.usageLimit,
    appliesOncePerCustomer: input.appliesOncePerCustomer,
  };
}

function failed(
  userErrors: DiscountUserError[],
  fallback: string,
): MutationResult {
  return {
    ok: false,
    userErrors: userErrors.length ? userErrors : [{ message: fallback }],
  };
}

export async function createTieredDiscount(
  admin: AdminApiContext,
  input: TieredDiscountInput,
): Promise<MutationResult> {
  if (input.method === "code") {
    const data = await adminRequest<{
      discountCodeAppCreate: {
        codeAppDiscount: { discountId: string } | null;
        userErrors: DiscountUserError[];
      };
    }>(admin, CREATE_CODE_MUTATION, {
      discount: {
        ...toCodeDiscountInput(input),
        functionHandle: DISCOUNT_FUNCTION_HANDLE,
      },
    });

    const payload = data.discountCodeAppCreate;

    if (payload.userErrors.length > 0 || !payload.codeAppDiscount) {
      return failed(
        payload.userErrors,
        "Shopify did not return the created discount.",
      );
    }

    return { ok: true, id: payload.codeAppDiscount.discountId };
  }

  const data = await adminRequest<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null;
      userErrors: DiscountUserError[];
    };
  }>(admin, CREATE_AUTOMATIC_MUTATION, {
    discount: {
      ...toDiscountInput(input),
      functionHandle: DISCOUNT_FUNCTION_HANDLE,
    },
  });

  const payload = data.discountAutomaticAppCreate;

  if (payload.userErrors.length > 0 || !payload.automaticAppDiscount) {
    return failed(
      payload.userErrors,
      "Shopify did not return the created discount.",
    );
  }

  return { ok: true, id: payload.automaticAppDiscount.discountId };
}

const UPDATE_CODE_MUTATION = `#graphql
  mutation UpdateTieredCodeDiscount($id: ID!, $discount: DiscountCodeAppInput!) {
    discountCodeAppUpdate(id: $id, codeAppDiscount: $discount) {
      codeAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

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
  if (input.method === "code") {
    const data = await adminRequest<{
      discountCodeAppUpdate: {
        codeAppDiscount: { discountId: string } | null;
        userErrors: DiscountUserError[];
      };
    }>(admin, UPDATE_CODE_MUTATION, {
      id,
      discount: toCodeDiscountInput(input),
    });

    const payload = data.discountCodeAppUpdate;

    if (payload.userErrors.length > 0 || !payload.codeAppDiscount) {
      return failed(
        payload.userErrors,
        "Shopify did not return the updated discount.",
      );
    }

    return { ok: true, id: payload.codeAppDiscount.discountId };
  }

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
    return failed(
      payload.userErrors,
      "Shopify did not return the updated discount.",
    );
  }

  return { ok: true, id: payload.automaticAppDiscount.discountId };
}

const ACTIVATE_DISCOUNT_MUTATION = `#graphql
  mutation ActivateTieredDiscount($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE_DISCOUNT_MUTATION = `#graphql
  mutation DeactivateTieredDiscount($id: ID!) {
    discountAutomaticDeactivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_DISCOUNT_MUTATION = `#graphql
  mutation DeleteTieredDiscount($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors {
        field
        message
      }
    }
  }
`;

const ACTIVATE_CODE_MUTATION = `#graphql
  mutation ActivateTieredCodeDiscount($id: ID!) {
    discountCodeActivate(id: $id) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE_CODE_MUTATION = `#graphql
  mutation DeactivateTieredCodeDiscount($id: ID!) {
    discountCodeDeactivate(id: $id) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_CODE_MUTATION = `#graphql
  mutation DeleteTieredCodeDiscount($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Activating rewrites dates: Shopify moves startsAt to now for a scheduled
 * discount, and clears endsAt for an expired one. Deactivating ends the
 * discount by setting endsAt to now, which is why its status becomes expired
 * rather than scheduled.
 */
export async function setTieredDiscountActive(
  admin: AdminApiContext,
  id: string,
  active: boolean,
): Promise<MutationResult> {
  if (methodFromGid(id) === "code") {
    const codeField = active
      ? "discountCodeActivate"
      : "discountCodeDeactivate";

    const data = await adminRequest<
      Record<
        string,
        {
          codeDiscountNode: { id: string } | null;
          userErrors: DiscountUserError[];
        }
      >
    >(admin, active ? ACTIVATE_CODE_MUTATION : DEACTIVATE_CODE_MUTATION, {
      id,
    });

    const codePayload = data[codeField];

    if (codePayload.userErrors.length > 0 || !codePayload.codeDiscountNode) {
      return failed(
        codePayload.userErrors,
        "Shopify did not return the updated discount.",
      );
    }

    return { ok: true, id: codePayload.codeDiscountNode.id };
  }

  const field = active
    ? "discountAutomaticActivate"
    : "discountAutomaticDeactivate";

  const data = await adminRequest<
    Record<
      string,
      {
        automaticDiscountNode: { id: string } | null;
        userErrors: DiscountUserError[];
      }
    >
  >(
    admin,
    active ? ACTIVATE_DISCOUNT_MUTATION : DEACTIVATE_DISCOUNT_MUTATION,
    { id },
  );

  const payload = data[field];

  if (payload.userErrors.length > 0 || !payload.automaticDiscountNode) {
    return failed(
      payload.userErrors,
      "Shopify did not return the updated discount.",
    );
  }

  return { ok: true, id: payload.automaticDiscountNode.id };
}

export async function deleteTieredDiscount(
  admin: AdminApiContext,
  id: string,
): Promise<MutationResult> {
  if (methodFromGid(id) === "code") {
    const data = await adminRequest<{
      discountCodeDelete: {
        deletedCodeDiscountId: string | null;
        userErrors: DiscountUserError[];
      };
    }>(admin, DELETE_CODE_MUTATION, { id });

    const payload = data.discountCodeDelete;

    if (payload.userErrors.length > 0 || !payload.deletedCodeDiscountId) {
      return failed(
        payload.userErrors,
        "Shopify did not confirm the discount was deleted.",
      );
    }

    return { ok: true, id: payload.deletedCodeDiscountId };
  }

  const data = await adminRequest<{
    discountAutomaticDelete: {
      deletedAutomaticDiscountId: string | null;
      userErrors: DiscountUserError[];
    };
  }>(admin, DELETE_DISCOUNT_MUTATION, { id });

  const payload = data.discountAutomaticDelete;

  if (payload.userErrors.length > 0 || !payload.deletedAutomaticDiscountId) {
    return failed(
      payload.userErrors,
      "Shopify did not confirm the discount was deleted.",
    );
  }

  return { ok: true, id: payload.deletedAutomaticDiscountId };
}

const RESOURCE_TITLES_QUERY = `#graphql
  query DiscountResourceTitles($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Product {
        id
        title
      }
      ... on Collection {
        id
        title
      }
    }
  }
`;

/**
 * Titles for the products and collections a discount targets. The config only
 * stores IDs, so titles are resolved on load and a renamed product shows its
 * current name. A deleted one comes back as null and is reported as missing.
 */
export async function getResourceTitles(
  admin: AdminApiContext,
  ids: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (ids.length === 0) return titles;

  const data = await adminRequest<{
    nodes: ({ id: string; title: string } | null)[];
  }>(admin, RESOURCE_TITLES_QUERY, { ids });

  for (const node of data.nodes) {
    if (node?.id) titles.set(node.id, node.title);
  }

  return titles;
}
