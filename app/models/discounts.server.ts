import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  DISCOUNT_FUNCTION_HANDLE,
  INPUT_VARIABLES_METAFIELD_KEY,
  TIER_METAFIELD_KEY,
  TIER_METAFIELD_NAMESPACE,
  TIER_METAFIELD_TYPE,
  collectionVariablesForAppliesTo,
  collectionVariablesForBuyXGetY,
  discountClassesFor,
  parseTierConfig,
  serializeBuyXGetYConfig,
  serializeInputVariables,
  serializeTierConfig,
  type AppliesTo,
  type BuyXGetY,
  type CustomerEligibility,
  type DiscountType,
  type OrderTier,
  type Schedule,
  type Tier,
  type TierConfig,
} from "../lib/tiers";
import {
  discountPath,
  discountTab,
  methodFromGid,
  toDiscountGid,
  toDiscountNumericId,
  type DiscountMethod,
} from "../lib/discount-id";

/**
 * The app shows two statuses, at the owner's request:
 *
 * - ACTIVE: running, or scheduled to start on a later date (the list shows
 *   the start date).
 * - DRAFT: not applying. Either an app draft (parked), or a discount whose
 *   end date has passed, which Shopify calls expired.
 *
 * Shopify has no draft discounts, so an app draft is stored as a discount
 * scheduled to start on DRAFT_STARTS_AT, which can never apply, with the
 * merchant's own dates kept in the draft metafield. The app shows it with
 * those dates.
 */
export type DiscountStatus = "ACTIVE" | "DRAFT";

/** Shopify's own statuses, as the Admin API returns them. */
type ShopifyDiscountStatus = "ACTIVE" | "EXPIRED" | "SCHEDULED";

/** Where a draft's Shopify start date is parked. */
export const DRAFT_STARTS_AT = "2099-01-01T00:00:00Z";

const DRAFT_METAFIELD_KEY = "draft";

/** The draft metafield: the merchant's own dates, kept while it is a draft. */
type DraftState =
  | { isDraft: true; startsAt: string; endsAt: string | null }
  | { isDraft: false };

function parseDraftState(jsonValue: unknown): DraftState {
  if (typeof jsonValue !== "object" || jsonValue === null) {
    return { isDraft: false };
  }

  const value = jsonValue as Record<string, unknown>;
  if (value.isDraft !== true || typeof value.startsAt !== "string") {
    return { isDraft: false };
  }

  return {
    isDraft: true,
    startsAt: value.startsAt,
    endsAt: typeof value.endsAt === "string" ? value.endsAt : null,
  };
}

function draftMetafield(state: DraftState) {
  return {
    namespace: TIER_METAFIELD_NAMESPACE,
    key: DRAFT_METAFIELD_KEY,
    type: TIER_METAFIELD_TYPE,
    value: JSON.stringify(state),
  };
}

export type TieredDiscount = {
  /** gid://shopify/DiscountAutomaticNode/... or .../DiscountCodeNode/... */
  id: string;
  method: DiscountMethod;
  title: string;
  status: DiscountStatus;
  /**
   * True for an app draft, whose own dates are kept in the draft metafield.
   * False for a draft that is simply a discount whose end date has passed.
   */
  parked: boolean;
  startsAt: string;
  endsAt: string | null;
  combinesWithShipping: boolean;
  /** Whether it may apply alongside the other discount class. */
  combinesWithOtherDiscounts: boolean;
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
  draftMetafield: { jsonValue: unknown } | null;
  discount: {
    __typename: string;
    title?: string;
    status?: ShopifyDiscountStatus;
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
    draftMetafield: metafield(namespace: "$app:tiered", key: "draft") {
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

const SHOP_CURRENCY_QUERY = `#graphql
  query ShopCurrency {
    shop {
      currencyCode
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

  // The method decides which family of mutations applies to this discount.
  // It is read from the discount's own type rather than from the ID prefix,
  // because Shopify hands out several ID forms for the same discount: a
  // DiscountAutomaticNode or DiscountCodeNode gid from the mutations, and a
  // DiscountNode gid from the admin's own links into the app.
  const method: DiscountMethod =
    typename === "DiscountCodeApp" ? "code" : "automatic";

  // Normalised to the form the method's mutations expect, so every lifecycle
  // call is addressed the same way whichever ID form the discount arrived as.
  const id = toDiscountGid(method, toDiscountNumericId(node.id));
  if (!id) return null;

  const parsedConfig = parseTierConfig(node.metafield.jsonValue);

  // A draft shows the merchant's own dates, not the parked start date. One
  // that was turned on from Shopify's own Discounts page is no longer a draft,
  // whatever the metafield still says.
  const draft = parseDraftState(node.draftMetafield?.jsonValue);
  const shopifyStatus = node.discount.status ?? "EXPIRED";
  const parked = draft.isDraft && shopifyStatus !== "ACTIVE";

  return {
    id,
    method,
    title: node.discount.title ?? "",
    status: parked || shopifyStatus === "EXPIRED" ? "DRAFT" : "ACTIVE",
    parked,
    startsAt:
      draft.isDraft && parked ? draft.startsAt : (node.discount.startsAt ?? ""),
    endsAt:
      draft.isDraft && parked ? draft.endsAt : (node.discount.endsAt ?? null),
    combinesWithShipping:
      node.discount.combinesWith?.shippingDiscounts ?? false,
    // An order discount combines outward with product discounts and the other
    // way round, so which flag matters depends on the discount's own class.
    combinesWithOtherDiscounts:
      parsedConfig.status === "ok" && parsedConfig.type === "order_threshold"
        ? (node.discount.combinesWith?.productDiscounts ?? false)
        : (node.discount.combinesWith?.orderDiscounts ?? false),
    code: node.discount.codes?.nodes[0]?.code ?? null,
    usageLimit: node.discount.usageLimit ?? null,
    appliesOncePerCustomer: node.discount.appliesOncePerCustomer ?? false,
    usageCount: node.discount.asyncUsageCount ?? 0,
    config: parsedConfig,
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

/** Order thresholds are entered and compared in the shop's own currency. */
export async function getShopCurrencyCode(
  admin: AdminApiContext,
): Promise<string> {
  const data = await adminRequest<{ shop: { currencyCode: string } }>(
    admin,
    SHOP_CURRENCY_QUERY,
  );

  return data.shop.currencyCode;
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
  discountType: DiscountType;
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
  combinesWithOtherDiscounts: boolean;
  appliesTo: AppliesTo;
  customerEligibility: CustomerEligibility;
  /** Only the list matching discountType is used. */
  tiers: Tier[];
  orderTiers: OrderTier[];
  /** Buy X Get Y settings, used only for that type. */
  bxgy?: BuyXGetY | null;
  /** Save as a draft: parked so it cannot apply, with these dates kept. */
  draft?: boolean;
  /** Order thresholds only: the most taken off, in the shop's currency. */
  maxDiscountAmount?: number | null;
  /** The days and hours it runs, or null for any time. */
  schedule?: Schedule | null;
};

export type DiscountUserError = {
  field?: string[] | null;
  message: string;
};

export type MutationResult =
  { ok: true; id: string } | { ok: false; userErrors: DiscountUserError[] };

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
/** The config metafield and its collection variables, for any kind. */
function configMetafieldValues(input: TieredDiscountInput): {
  config: string;
  variables: string;
} {
  if (input.discountType === "buy_x_get_y") {
    if (!input.bxgy) {
      throw new Error("Buy X Get Y settings are missing.");
    }

    return {
      config: serializeBuyXGetYConfig(
        input.bxgy,
        input.customerEligibility,
        input.schedule ?? null,
      ),
      variables: serializeInputVariables(
        collectionVariablesForBuyXGetY(input.bxgy),
        input.schedule ?? null,
      ),
    };
  }

  return {
    config: serializeTierConfig(
      input.discountType,
      input.discountType === "order_threshold" ? input.orderTiers : input.tiers,
      input.appliesTo,
      input.customerEligibility,
      input.maxDiscountAmount ?? null,
      input.schedule ?? null,
    ),
    variables: serializeInputVariables(
      collectionVariablesForAppliesTo(input.appliesTo),
      input.schedule ?? null,
    ),
  };
}

function toDiscountInput(input: TieredDiscountInput) {
  // Buy X Get Y discounts products, so like quantity tiers it is a product
  // discount. Only a whole order discount uses the order class.
  const isOrderThreshold = input.discountType === "order_threshold";
  const { config, variables } = configMetafieldValues(input);

  return {
    title: input.title,
    startsAt: input.draft ? DRAFT_STARTS_AT : input.startsAt,
    endsAt: input.draft ? null : input.endsAt,
    discountClasses: discountClassesFor(input.discountType, input.orderTiers),
    combinesWith: {
      // A discount never stacks with others of its own class. The merchant
      // chooses whether it stacks with the other class.
      orderDiscounts: isOrderThreshold
        ? false
        : input.combinesWithOtherDiscounts,
      productDiscounts: isOrderThreshold
        ? input.combinesWithOtherDiscounts
        : false,
      shippingDiscounts: input.combinesWithShipping,
    },
    metafields: [
      {
        namespace: TIER_METAFIELD_NAMESPACE,
        key: TIER_METAFIELD_KEY,
        type: TIER_METAFIELD_TYPE,
        value: config,
      },
      {
        namespace: TIER_METAFIELD_NAMESPACE,
        key: INPUT_VARIABLES_METAFIELD_KEY,
        type: TIER_METAFIELD_TYPE,
        value: variables,
      },
      // Always written, so a normal save also publishes a draft.
      draftMetafield(
        input.draft
          ? { isDraft: true, startsAt: input.startsAt, endsAt: input.endsAt }
          : { isDraft: false },
      ),
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

/** Updates only the given fields of a discount, for either method. */
async function updateDiscountFields(
  admin: AdminApiContext,
  discount: TieredDiscount,
  fields: Record<string, unknown>,
): Promise<MutationResult> {
  if (discount.method === "code") {
    const data = await adminRequest<{
      discountCodeAppUpdate: {
        codeAppDiscount: { discountId: string } | null;
        userErrors: DiscountUserError[];
      };
    }>(admin, UPDATE_CODE_MUTATION, { id: discount.id, discount: fields });

    const payload = data.discountCodeAppUpdate;
    if (payload.userErrors.length > 0 || !payload.codeAppDiscount) {
      return failed(payload.userErrors, "Shopify did not return the discount.");
    }

    return { ok: true, id: payload.codeAppDiscount.discountId };
  }

  const data = await adminRequest<{
    discountAutomaticAppUpdate: {
      automaticAppDiscount: { discountId: string } | null;
      userErrors: DiscountUserError[];
    };
  }>(admin, UPDATE_DISCOUNT_MUTATION, { id: discount.id, discount: fields });

  const payload = data.discountAutomaticAppUpdate;
  if (payload.userErrors.length > 0 || !payload.automaticAppDiscount) {
    return failed(payload.userErrors, "Shopify did not return the discount.");
  }

  return { ok: true, id: payload.automaticAppDiscount.discountId };
}

/**
 * Gives a draft its own dates back, so it runs on them. A start date already
 * past makes it active straight away, and an end date already past leaves it
 * expired.
 */
export async function publishTieredDiscount(
  admin: AdminApiContext,
  discount: TieredDiscount,
): Promise<MutationResult> {
  return updateDiscountFields(admin, discount, {
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    metafields: [draftMetafield({ isDraft: false })],
  });
}

/**
 * Turns a draft on. An app draft gets its own dates back. A discount whose end
 * date has passed is activated, which clears its end date, so it runs until
 * it is moved back to draft.
 */
export async function publishDiscount(
  admin: AdminApiContext,
  discount: TieredDiscount,
): Promise<MutationResult> {
  return discount.parked
    ? publishTieredDiscount(admin, discount)
    : setTieredDiscountActive(admin, discount.id, true);
}

/** Parks a discount as a draft, keeping its current dates for publishing. */
export async function moveTieredDiscountToDraft(
  admin: AdminApiContext,
  discount: TieredDiscount,
): Promise<MutationResult> {
  return updateDiscountFields(admin, discount, {
    startsAt: DRAFT_STARTS_AT,
    endsAt: null,
    metafields: [
      draftMetafield({
        isDraft: true,
        startsAt: discount.startsAt,
        endsAt: discount.endsAt,
      }),
    ],
  });
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
  >(admin, active ? ACTIVATE_DISCOUNT_MUTATION : DEACTIVATE_DISCOUNT_MUTATION, {
    id,
  });

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

const RESOURCE_DETAILS_QUERY = `#graphql
  query DiscountResourceDetails($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Product {
        id
        title
        featuredMedia {
          preview {
            image {
              url(transform: { maxWidth: 160, maxHeight: 160 })
            }
          }
        }
      }
      ... on Collection {
        id
        title
        image {
          url(transform: { maxWidth: 160, maxHeight: 160 })
        }
      }
    }
  }
`;

export type ResourceDetails = { title: string; image: string | null };

type ResourceDetailsNode = {
  id?: string;
  title?: string;
  featuredMedia?: {
    preview?: { image?: { url?: string } | null } | null;
  } | null;
  image?: { url?: string } | null;
} | null;

/**
 * Titles and thumbnail pictures for the products and collections a discount
 * targets. The config only stores IDs, so both are resolved on load and a
 * renamed product shows its current name. A deleted one is left out.
 */
export async function getResourceDetails(
  admin: AdminApiContext,
  ids: string[],
): Promise<Map<string, ResourceDetails>> {
  const details = new Map<string, ResourceDetails>();
  const unique = [...new Set(ids)];

  // nodes() takes at most 250 IDs per request, and a list page can need more
  // than that across every discount on it.
  for (let start = 0; start < unique.length; start += 250) {
    const data = await adminRequest<{ nodes: ResourceDetailsNode[] }>(
      admin,
      RESOURCE_DETAILS_QUERY,
      { ids: unique.slice(start, start + 250) },
    );

    for (const node of data.nodes) {
      if (!node?.id) continue;
      details.set(node.id, {
        title: node.title ?? "",
        image:
          node.featuredMedia?.preview?.image?.url ?? node.image?.url ?? null,
      });
    }
  }

  return details;
}

/** Titles only, for lists that show names but no pictures. */
export async function getResourceTitles(
  admin: AdminApiContext,
  ids: string[],
): Promise<Map<string, string>> {
  const details = await getResourceDetails(admin, ids);
  return new Map([...details].map(([id, detail]) => [id, detail.title]));
}

/** Every product and collection ID the Buy X Get Y discounts name. */
export function buyXGetYResourceIds(discounts: TieredDiscount[]): string[] {
  const ids: string[] = [];

  for (const discount of discounts) {
    const { config } = discount;
    if (config.status !== "ok" || config.type !== "buy_x_get_y") continue;

    ids.push(...config.bxgy.buyScope.ids, ...config.bxgy.getScope.ids);
  }

  return ids;
}

/**
 * Titles for the What it does column, as a plain object so it survives being
 * sent to the browser. Titles are looked up live rather than stored, so a
 * renamed product reads correctly. If the lookup fails the list still loads
 * and the column falls back to counts.
 */
export async function getBuyXGetYTitles(
  admin: AdminApiContext,
  discounts: TieredDiscount[],
): Promise<Record<string, string>> {
  try {
    const titles = await getResourceTitles(
      admin,
      buyXGetYResourceIds(discounts),
    );
    return Object.fromEntries(titles);
  } catch {
    return {};
  }
}

/**
 * The activate, deactivate and delete actions are identical on every discount
 * list, so the routes share this instead of each repeating the dispatch.
 */
export async function runDiscountRowAction(
  admin: AdminApiContext,
  formData: FormData,
): Promise<DiscountActionResult> {
  const intent = String(formData.get("intent") ?? "");

  if (isBulkIntent(intent)) {
    return runDiscountBulkAction(admin, intent, formData.get("ids"));
  }
  const id = toDiscountGid(
    String(formData.get("method") ?? ""),
    String(formData.get("id") ?? ""),
  );

  if (!id) {
    return { ok: false, message: "That discount could not be found." };
  }

  try {
    let result: MutationResult;
    let message: string;

    switch (intent) {
      case "delete":
        result = await deleteTieredDiscount(admin, id);
        message = "Discount deleted";
        break;
      case "publish":
      case "draft": {
        const discount = await getTieredDiscount(admin, id);
        if (!discount) {
          return { ok: false, message: "That discount could not be found." };
        }

        result =
          intent === "publish"
            ? await publishDiscount(admin, discount)
            : await moveTieredDiscountToDraft(admin, discount);
        message =
          intent === "publish"
            ? "Discount published"
            : "Discount moved to drafts";
        break;
      }
      default:
        return { ok: false, message: "That action is not supported." };
    }

    if (!result.ok) {
      return {
        ok: false,
        message: result.userErrors.map((error) => error.message).join(" "),
      };
    }

    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Something went wrong updating the discount.",
    };
  }
}

/** What a row or bulk action reports back to the list. */
export type DiscountActionResult = {
  ok: boolean;
  message: string;
  /** Bulk actions only: the discounts that could not be changed, and why. */
  failures?: { title: string; message: string }[];
};

export type BulkIntent = "bulk-publish" | "bulk-draft" | "bulk-delete";

function isBulkIntent(intent: string): intent is BulkIntent {
  return (
    intent === "bulk-publish" ||
    intent === "bulk-draft" ||
    intent === "bulk-delete"
  );
}

/** More than a list page shows, and enough to stay well inside rate limits. */
const MAX_BULK_IDS = 250;

/** How many discounts are changed at once. */
const BULK_CONCURRENCY = 4;

const DISCOUNT_GID = /^gid:\/\/shopify\/Discount(Automatic|Code)Node\/\d+$/;

const BULK_WORDS: Record<BulkIntent, { done: string; already: string }> = {
  "bulk-publish": { done: "published", already: "already active" },
  "bulk-draft": { done: "moved to drafts", already: "already drafts" },
  "bulk-delete": { done: "deleted", already: "already gone" },
};

/**
 * One discount through a bulk action. Each action does what makes sense for
 * the discount's state, and a discount already in the requested state is
 * skipped rather than changed again.
 */
async function applyBulkAction(
  admin: AdminApiContext,
  intent: BulkIntent,
  discount: TieredDiscount,
): Promise<MutationResult | "skipped"> {
  switch (intent) {
    case "bulk-publish":
      if (discount.status === "ACTIVE") return "skipped";
      return publishDiscount(admin, discount);
    case "bulk-draft":
      if (discount.status === "DRAFT") return "skipped";
      return moveTieredDiscountToDraft(admin, discount);
    case "bulk-delete":
      return deleteTieredDiscount(admin, discount.id);
  }
}

function countOf(count: number): string {
  return `${count} ${count === 1 ? "discount" : "discounts"}`;
}

/**
 * Applies one action to many discounts, a few at a time. Shopify's own bulk
 * mutations cover code discounts only and run as background jobs, so each
 * discount is changed directly instead, which also says which ones failed.
 * One failure never stops the rest.
 */
async function runDiscountBulkAction(
  admin: AdminApiContext,
  intent: BulkIntent,
  rawIds: FormDataEntryValue | null,
): Promise<DiscountActionResult> {
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(rawIds ?? "[]"));
    if (Array.isArray(parsed)) {
      ids = [...new Set(parsed.map(String))].filter((id) =>
        DISCOUNT_GID.test(id),
      );
    }
  } catch {
    ids = [];
  }

  if (!ids.length) {
    return { ok: false, message: "Select at least one discount." };
  }
  if (ids.length > MAX_BULK_IDS) {
    return {
      ok: false,
      message: `Select no more than ${MAX_BULK_IDS} discounts at a time.`,
    };
  }

  let done = 0;
  let skipped = 0;
  const failures: { title: string; message: string }[] = [];
  const queue = [...ids];

  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const discount = await getTieredDiscount(admin, id);
        if (!discount) {
          if (intent === "bulk-delete") skipped += 1;
          else failures.push({ title: id, message: "It no longer exists." });
          continue;
        }

        const result = await applyBulkAction(admin, intent, discount);
        if (result === "skipped") {
          skipped += 1;
        } else if (result.ok) {
          done += 1;
        } else {
          failures.push({
            title: discount.title,
            message: result.userErrors.map((error) => error.message).join(" "),
          });
        }
      } catch (error) {
        failures.push({
          title: id,
          message:
            error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker),
  );

  const words = BULK_WORDS[intent];
  const parts: string[] = [];
  if (done) parts.push(`${countOf(done)} ${words.done}`);
  if (skipped) parts.push(`${skipped} ${words.already}`);
  if (failures.length) parts.push(`${failures.length} could not be changed`);

  return {
    ok: failures.length === 0,
    message: parts.join(", ") || "Nothing to change",
    failures,
  };
}

/** A discount's edit page, which depends on its kind as well as its method. */
export function discountEditPath(discount: TieredDiscount): string {
  return discountPath(discountTab(discount), discount.method, discount.id);
}

/**
 * Finds a discount from a bare numeric ID, without knowing whether it is
 * automatic or a code. Links from the Shopify admin carry only that number,
 * and so do URLs from before the app had one tab per kind of discount.
 *
 * Shopify documents the DiscountNode form for this lookup. The two concrete
 * forms are tried after it, so a lookup that one form rejects still resolves.
 */
export async function findTieredDiscountByNumericId(
  admin: AdminApiContext,
  numericId: string | undefined,
): Promise<TieredDiscount | null> {
  if (!numericId || !/^\d+$/.test(numericId)) return null;

  const candidates = [
    `gid://shopify/DiscountNode/${numericId}`,
    toDiscountGid("automatic", numericId),
    toDiscountGid("code", numericId),
  ];

  for (const gid of candidates) {
    if (!gid) continue;

    try {
      const discount = await getTieredDiscount(admin, gid);
      if (discount) return discount;
    } catch {
      // A form Shopify does not accept for this discount: try the next one.
    }
  }

  return null;
}
