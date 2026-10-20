/**
 * Shared contract between the merchant UI and the quantity based discount
 * Function.
 *
 * The Function reads `tiers` out of the `$app:tiered` / `config` metafield on
 * the discount. Keep that shape stable: changing it means the Function has to
 * change too.
 */

export const TIER_METAFIELD_NAMESPACE = "$app:tiered";
export const TIER_METAFIELD_KEY = "config";
export const TIER_METAFIELD_TYPE = "json";

/**
 * A second metafield, read by the Function as input query variables. Its top
 * level keys are variable names, which is why the collection IDs cannot just
 * live in the config metafield alongside everything else. Named in
 * extensions/tiered-discount/shopify.extension.toml.
 */
export const INPUT_VARIABLES_METAFIELD_KEY = "input-variables";

/** Handle of the Function extension in extensions/tiered-discount. */
export const DISCOUNT_FUNCTION_HANDLE = "tiered-discount";

/**
 * Version of the config metafield this build of the app writes and understands.
 *
 * 1: tiers of { minQuantity, percentage }, always open ended.
 * 2: tiers gain maxQuantity and maxDiscountedUnits, both nullable.
 * 3: adds appliesTo, which defaults to every product.
 * 4: adds customerEligibility, which defaults to every customer.
 * 5: adds type, which defaults to quantity tiers.
 * 6: adds the buy_x_get_y type, which has buy and get settings, not tiers.
 * 7: order thresholds gain freeShipping, and may have a percentage of 0 when
 *    they give free shipping.
 *
 * Each added field is optional, so a config written by an earlier version
 * keeps the behaviour it had then and is rewritten at the current version the
 * next time it is saved.
 * Discounts saved by a newer version are reported as unsupported rather than
 * edited with the wrong assumptions.
 */
export const TIER_CONFIG_VERSION = 7;

export const MAX_TIERS = 10;

export type Tier = {
  /** Lowest cart quantity this tier applies to. */
  minQuantity: number;
  /** Highest cart quantity this tier applies to, or null for no upper limit. */
  maxQuantity: number | null;
  percentage: number;
  /** Cap on how many units get discounted, or null to discount every unit. */
  maxDiscountedUnits: number | null;
};

export type AppliesToType = "all" | "products" | "collections";

/** Which cart lines a discount is allowed to touch. */
export type AppliesTo = {
  type: AppliesToType;
  productIds: string[];
  collectionIds: string[];
};

export const ALL_PRODUCTS: AppliesTo = {
  type: "all",
  productIds: [],
  collectionIds: [],
};

/** Who the discount is for. Evaluated by the Function, not by Shopify. */
export type CustomerEligibility =
  "all" | "signedIn" | "firstOrder" | "returning";

export const CUSTOMER_ELIGIBILITY_LABELS: Record<CustomerEligibility, string> =
  {
    all: "All customers",
    signedIn: "Signed in customers",
    firstOrder: "Customers with no previous orders",
    returning: "Customers with at least one previous order",
  };

export function isCustomerEligibility(
  value: unknown,
): value is CustomerEligibility {
  return (
    value === "all" ||
    value === "signedIn" ||
    value === "firstOrder" ||
    value === "returning"
  );
}

/**
 * Which kind of discount a config describes. A config with no type at all
 * predates order thresholds, and every one of those is a quantity tier
 * discount, so that is what a missing type means.
 */
export type DiscountType = "quantity_tiers" | "order_threshold" | "buy_x_get_y";

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  quantity_tiers: "Quantity tiers",
  order_threshold: "Order threshold",
  buy_x_get_y: "Buy X Get Y",
};

export function isDiscountType(value: unknown): value is DiscountType {
  return (
    value === "quantity_tiers" ||
    value === "order_threshold" ||
    value === "buy_x_get_y"
  );
}

/** Which products count as "buy" units. */
export type BuyScopeKind = "all" | "products" | "collections";

/** Which products can be the discounted "get" units. */
export type GetScopeKind = "same_as_buy" | "products" | "collections";

/**
 * Buy a quantity of qualifying products, get a quantity of target products at
 * a percentage off, repeated up to maxApplicationsPerOrder times. A percentage
 * of 100 is free. The Function's own copy of these rules is in
 * extensions/tiered-discount/src/buy_x_get_y.ts.
 */
export type BuyXGetY = {
  buyQuantity: number;
  buyScope: { kind: BuyScopeKind; ids: string[] };
  getQuantity: number;
  getScope: { kind: GetScopeKind; ids: string[] };
  percentage: number;
  /** null means no limit. */
  maxApplicationsPerOrder: number | null;
};

/**
 * Shopify allows at most 100 entries in a list passed to a Function's input
 * query, which caps collections per side. Product IDs are compared in code
 * from the config metafield instead, and are held to the same number so the
 * metafield stays well inside what a Function input is given.
 */
export const MAX_SCOPE_IDS = 100;

/**
 * Function inputs only receive metafield values up to about 10 KB. A config
 * over this many bytes is refused before it is saved rather than silently not
 * reaching the Function.
 */
export const MAX_CONFIG_BYTES = 9_500;

/**
 * A percentage off the whole order once the subtotal reaches minSubtotal, and
 * optionally free shipping. A percentage of 0 is allowed only with free
 * shipping. The Function's copy of these rules is in
 * extensions/tiered-discount/src/order_threshold.ts.
 */
export type OrderTier = {
  /** In the shop's currency, to at most two decimal places. */
  minSubtotal: number;
  percentage: number;
  /** Absent in configs before version 7, which means false. */
  freeShipping: boolean;
};

/** A discount needs Shopify's SHIPPING class only when it can give free shipping. */
export function orderTiersGiveFreeShipping(tiers: OrderTier[]): boolean {
  return tiers.some((tier) => tier.freeShipping);
}

export type ShopifyDiscountClass = "ORDER" | "PRODUCT" | "SHIPPING";

/**
 * The classes decide which operations the Function is allowed to return and
 * which of its targets Shopify runs. The main class follows the discount type.
 * SHIPPING is added only while a threshold gives free shipping, so other
 * discounts never run the delivery target. Used when saving and by the live
 * preview, so the two always agree.
 */
export function discountClassesFor(
  discountType: DiscountType,
  orderTiers: OrderTier[],
): ShopifyDiscountClass[] {
  if (discountType !== "order_threshold") return ["PRODUCT"];

  return orderTiersGiveFreeShipping(orderTiers)
    ? ["ORDER", "SHIPPING"]
    : ["ORDER"];
}

type ConfigCommon = {
  status: "ok";
  version: number;
  appliesTo: AppliesTo;
  customerEligibility: CustomerEligibility;
};

/**
 * `tiers` is the same key in the metafield for both kinds, discriminated by
 * `type`, so nothing has to migrate when a discount type is added.
 */
export type TierConfig =
  | (ConfigCommon & { type: "quantity_tiers"; tiers: Tier[] })
  | (ConfigCommon & { type: "order_threshold"; tiers: OrderTier[] })
  | (ConfigCommon & { type: "buy_x_get_y"; bxgy: BuyXGetY })
  | { status: "unsupported"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** An absent or null optional number, or a whole number of at least `floor`. */
function optionalInteger(
  value: unknown,
  floor: number,
): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };

  if (typeof value === "number" && Number.isInteger(value) && value >= floor) {
    return { ok: true, value };
  }

  return { ok: false };
}

function normalizeOrderTier(value: unknown): OrderTier | null {
  if (!isRecord(value)) return null;

  const { minSubtotal, percentage } = value;
  const freeShipping = value.freeShipping === true;

  if (
    typeof minSubtotal !== "number" ||
    !Number.isFinite(minSubtotal) ||
    minSubtotal <= 0 ||
    // More than two decimal places is not a real amount of money.
    Number(minSubtotal.toFixed(2)) !== minSubtotal
  ) {
    return null;
  }

  if (
    typeof percentage !== "number" ||
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100 ||
    (percentage === 0 && !freeShipping)
  ) {
    return null;
  }

  return { minSubtotal, percentage, freeShipping };
}

export function sortOrderTiers(tiers: OrderTier[]): OrderTier[] {
  return [...tiers].sort((a, b) => a.minSubtotal - b.minSubtotal);
}

function normalizeTier(value: unknown): Tier | null {
  if (!isRecord(value)) return null;

  const { minQuantity, percentage } = value;

  if (!isPositiveInteger(minQuantity)) return null;

  if (
    typeof percentage !== "number" ||
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    percentage > 100
  ) {
    return null;
  }

  const maxQuantity = optionalInteger(value.maxQuantity, minQuantity);
  if (!maxQuantity.ok) return null;

  const maxDiscountedUnits = optionalInteger(value.maxDiscountedUnits, 1);
  if (!maxDiscountedUnits.ok) return null;

  return {
    minQuantity,
    maxQuantity: maxQuantity.value,
    percentage,
    maxDiscountedUnits: maxDiscountedUnits.value,
  };
}

function isGidList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

/** Absent appliesTo means the config predates targeting, so: every product. */
function normalizeAppliesTo(value: unknown): AppliesTo | null {
  if (value === undefined || value === null) return ALL_PRODUCTS;
  if (!isRecord(value)) return null;

  const { type } = value;
  if (type !== "all" && type !== "products" && type !== "collections") {
    return null;
  }

  const productIds = value.productIds ?? [];
  const collectionIds = value.collectionIds ?? [];

  if (!isGidList(productIds) || !isGidList(collectionIds)) return null;

  if (type === "products" && productIds.length === 0) return null;
  if (type === "collections" && collectionIds.length === 0) return null;

  return { type, productIds, collectionIds };
}

function unsupported(reason: string): TierConfig {
  return { status: "unsupported", reason };
}

function isWholeNumberAtLeastOne(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function normalizeScopeIds(value: unknown): string[] | null {
  const ids = value ?? [];
  if (!Array.isArray(ids)) return null;
  if (!ids.every((id) => typeof id === "string" && id.length > 0)) return null;

  return ids as string[];
}

/** The same rules the Function applies, so the app never shows what it skips. */
function normalizeBuyXGetY(value: Record<string, unknown>): BuyXGetY | null {
  const { buy, get } = value;
  if (!isRecord(buy) || !isRecord(get)) return null;

  if (!isWholeNumberAtLeastOne(buy.quantity)) return null;
  if (!isWholeNumberAtLeastOne(get.quantity)) return null;

  const buyScope = buy.scope;
  const getScope = get.scope;
  if (!isRecord(buyScope) || !isRecord(getScope)) return null;

  const buyKind = buyScope.kind;
  if (
    buyKind !== "all" &&
    buyKind !== "products" &&
    buyKind !== "collections"
  ) {
    return null;
  }

  const getKind = getScope.kind;
  if (
    getKind !== "same_as_buy" &&
    getKind !== "products" &&
    getKind !== "collections"
  ) {
    return null;
  }

  const buyIds = normalizeScopeIds(buyScope.ids);
  const getIds = normalizeScopeIds(getScope.ids);
  if (!buyIds || !getIds) return null;

  if (buyKind !== "all" && buyIds.length === 0) return null;
  if (getKind !== "same_as_buy" && getIds.length === 0) return null;

  const getValue = get.value;
  if (!isRecord(getValue)) return null;

  const { percentage } = getValue;
  if (
    typeof percentage !== "number" ||
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    percentage > 100
  ) {
    return null;
  }

  const max = value.maxApplicationsPerOrder;
  if (max !== undefined && max !== null && !isWholeNumberAtLeastOne(max)) {
    return null;
  }

  const discountedUnits = value.discountedUnits;
  if (discountedUnits !== undefined && discountedUnits !== "cheapest") {
    return null;
  }

  return {
    buyQuantity: buy.quantity,
    buyScope: { kind: buyKind, ids: buyKind === "all" ? [] : buyIds },
    getQuantity: get.quantity,
    getScope: { kind: getKind, ids: getKind === "same_as_buy" ? [] : getIds },
    percentage,
    maxApplicationsPerOrder: max ?? null,
  };
}

/**
 * Reads the config metafield. Anything this build does not recognise comes
 * back as "unsupported" so the UI can say so instead of guessing.
 */
export function parseTierConfig(jsonValue: unknown): TierConfig {
  if (!isRecord(jsonValue)) {
    return unsupported("The saved settings are not in the expected format.");
  }

  const rawVersion = jsonValue.version;
  const version = rawVersion === undefined ? 1 : rawVersion;

  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return unsupported("The saved settings have an unrecognised version.");
  }

  if (version > TIER_CONFIG_VERSION) {
    return unsupported(
      "This discount was saved by a newer version of the app. Update the app to edit it.",
    );
  }

  const rawType = jsonValue.type;
  const type =
    rawType === undefined || rawType === null ? "quantity_tiers" : rawType;

  if (!isDiscountType(type)) {
    return unsupported(
      "This discount is of a kind this version of the app cannot read.",
    );
  }

  // Absent means the config predates customer rules, so: everyone.
  const rawEligibility = jsonValue.customerEligibility;
  const customerEligibility =
    rawEligibility === undefined || rawEligibility === null
      ? "all"
      : rawEligibility;

  if (!isCustomerEligibility(customerEligibility)) {
    return unsupported(
      "The saved customer eligibility is not a value this version of the app can read.",
    );
  }

  if (type === "buy_x_get_y") {
    const bxgy = normalizeBuyXGetY(jsonValue);

    if (!bxgy) {
      return unsupported(
        "The saved buy and get settings are not in a format this version of the app can read.",
      );
    }

    return {
      status: "ok",
      version,
      type,
      bxgy,
      appliesTo: ALL_PRODUCTS,
      customerEligibility,
    };
  }

  const { tiers } = jsonValue;

  if (!Array.isArray(tiers) || tiers.length === 0) {
    return unsupported("The saved settings do not contain any tiers.");
  }

  const unreadableTiers = unsupported(
    "The saved tiers are not in a format this version of the app can read.",
  );

  const normalized: Tier[] = [];
  const normalizedOrder: OrderTier[] = [];

  for (const tier of tiers) {
    if (type === "order_threshold") {
      const parsed = normalizeOrderTier(tier);
      if (!parsed) return unreadableTiers;
      normalizedOrder.push(parsed);
      continue;
    }

    const parsed = normalizeTier(tier);
    if (!parsed) return unreadableTiers;
    normalized.push(parsed);
  }

  const appliesTo = normalizeAppliesTo(jsonValue.appliesTo);

  if (!appliesTo) {
    return unsupported(
      "The saved product targeting is not in a format this version of the app can read.",
    );
  }

  if (type === "order_threshold") {
    return {
      status: "ok",
      version,
      type,
      tiers: sortOrderTiers(normalizedOrder),
      appliesTo,
      customerEligibility,
    };
  }

  return {
    status: "ok",
    version,
    type,
    tiers: sortTiers(normalized),
    appliesTo,
    customerEligibility,
  };
}

export function serializeTierConfig(
  type: DiscountType,
  tiers: Tier[] | OrderTier[],
  appliesTo: AppliesTo,
  customerEligibility: CustomerEligibility,
): string {
  return JSON.stringify({
    version: TIER_CONFIG_VERSION,
    type,
    tiers:
      type === "order_threshold"
        ? sortOrderTiers(tiers as OrderTier[])
        : sortTiers(tiers as Tier[]),
    appliesTo,
    customerEligibility,
  });
}

/** In the shape the Function reads: buy, then get with a tagged value. */
export function serializeBuyXGetYConfig(
  bxgy: BuyXGetY,
  customerEligibility: CustomerEligibility,
): string {
  return JSON.stringify({
    version: TIER_CONFIG_VERSION,
    type: "buy_x_get_y",
    buy: {
      quantity: bxgy.buyQuantity,
      scope: {
        kind: bxgy.buyScope.kind,
        ids: bxgy.buyScope.kind === "all" ? [] : bxgy.buyScope.ids,
      },
    },
    get: {
      quantity: bxgy.getQuantity,
      // A tagged value, so a fixed amount can be added later without a
      // migration. It mirrors the shape Shopify itself uses.
      value: { percentage: bxgy.percentage },
      scope: {
        kind: bxgy.getScope.kind,
        ids: bxgy.getScope.kind === "same_as_buy" ? [] : bxgy.getScope.ids,
      },
    },
    maxApplicationsPerOrder: bxgy.maxApplicationsPerOrder,
    discountedUnits: "cheapest",
    customerEligibility,
  });
}

/** Bytes, which is what the Function input limit is measured in. */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Collection IDs for each input query variable the Function declares. */
export type CollectionVariables = {
  collectionIds: string[];
  buyCollectionIds: string[];
  getCollectionIds: string[];
};

export function collectionVariablesForAppliesTo(
  appliesTo: AppliesTo,
): Partial<CollectionVariables> {
  return {
    collectionIds:
      appliesTo.type === "collections" ? appliesTo.collectionIds : [],
  };
}

export function collectionVariablesForBuyXGetY(
  bxgy: BuyXGetY,
): Partial<CollectionVariables> {
  return {
    buyCollectionIds:
      bxgy.buyScope.kind === "collections" ? bxgy.buyScope.ids : [],
    getCollectionIds:
      bxgy.getScope.kind === "collections" ? bxgy.getScope.ids : [],
  };
}

/**
 * The Function resolves collection membership through input query variables,
 * so the selected collection IDs are written to their own metafield whose keys
 * are variable names. Every variable is always written, including as an empty
 * list, so none is ever missing for a discount this app saved.
 */
export function serializeInputVariables(
  variables: Partial<CollectionVariables>,
): string {
  return JSON.stringify({
    collectionIds: variables.collectionIds ?? [],
    buyCollectionIds: variables.buyCollectionIds ?? [],
    getCollectionIds: variables.getCollectionIds ?? [],
  });
}

/** "free", "at 50% off". */
export function buyXGetYOffer(percentage: number): string {
  return percentage >= 100 ? "free" : `at ${percentage}% off`;
}

/** "Buy 2, get 1 free", "Buy 2, get 1 at 50% off". */
export function summarizeBuyXGetY(bxgy: BuyXGetY): string {
  return `Buy ${bxgy.buyQuantity}, get ${bxgy.getQuantity} ${buyXGetYOffer(
    bxgy.percentage,
  )}`;
}

/**
 * "Summer Tees", "Summer Tees and Beanies", "Summer Tees, Beanies and 3 more".
 * Falls back to a count when no names are known.
 */
export function describeSelection(
  kind: "products" | "collections",
  ids: string[],
  titleOf?: (id: string) => string | undefined,
): string {
  // Nothing picked yet, which a form being filled in can show.
  if (ids.length === 0) {
    return kind === "products"
      ? "the products you choose"
      : "the collections you choose";
  }

  const names = titleOf
    ? ids.map(titleOf).filter((name): name is string => Boolean(name))
    : [];

  if (names.length !== ids.length || names.length === 0) {
    const noun = kind === "products" ? "product" : "collection";
    return `${ids.length} ${ids.length === 1 ? noun : `${noun}s`}`;
  }

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;

  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * The whole offer in one sentence: "Customers who buy 2 of Summer Tees get 1
 * of Summer Tees free, up to 3 times per order."
 */
export function describeBuyXGetY(
  bxgy: BuyXGetY,
  titleOf?: (id: string) => string | undefined,
): string {
  const buyWhat =
    bxgy.buyScope.kind === "all"
      ? "any product"
      : describeSelection(bxgy.buyScope.kind, bxgy.buyScope.ids, titleOf);

  const getWhat =
    bxgy.getScope.kind === "same_as_buy"
      ? buyWhat
      : describeSelection(bxgy.getScope.kind, bxgy.getScope.ids, titleOf);

  const limit =
    bxgy.maxApplicationsPerOrder === null
      ? ""
      : `, up to ${bxgy.maxApplicationsPerOrder} ${
          bxgy.maxApplicationsPerOrder === 1 ? "time" : "times"
        } per order`;

  return `Customers who buy ${bxgy.buyQuantity} of ${buyWhat} get ${
    bxgy.getQuantity
  } of ${getWhat} ${buyXGetYOffer(bxgy.percentage)}${limit}.`;
}

/** "All products", "3 products", "2 collections". */
export function summarizeAppliesTo(appliesTo: AppliesTo): string {
  if (appliesTo.type === "products") {
    const count = appliesTo.productIds.length;
    return `${count} ${count === 1 ? "product" : "products"}`;
  }

  if (appliesTo.type === "collections") {
    const count = appliesTo.collectionIds.length;
    return `${count} ${count === 1 ? "collection" : "collections"}`;
  }

  return "All products";
}

export function sortTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
}

/** "2 to 4 items", "exactly 3 items", "5+ items". */
export function describeTierRange(tier: Tier): string {
  if (tier.maxQuantity === null) {
    return `${tier.minQuantity}+ items`;
  }

  if (tier.maxQuantity === tier.minQuantity) {
    return `exactly ${tier.minQuantity} ${
      tier.minQuantity === 1 ? "item" : "items"
    }`;
  }

  return `${tier.minQuantity} to ${tier.maxQuantity} items`;
}

/** "2 to 4 items: 10% off, 5+ items: 20% off on 2 units" */
export function summarizeTiers(tiers: Tier[]): string {
  return sortTiers(tiers)
    .map((tier) => {
      const cap =
        tier.maxDiscountedUnits === null
          ? ""
          : ` on ${tier.maxDiscountedUnits} ${
              tier.maxDiscountedUnits === 1 ? "unit" : "units"
            }`;

      return `${describeTierRange(tier)}: ${tier.percentage}% off${cap}`;
    })
    .join(", ");
}

/** "10% off", "free shipping", "10% off and free shipping". */
export function describeOrderReward(
  percentage: number,
  freeShipping: boolean,
): string {
  if (percentage > 0 && freeShipping) {
    return `${percentage}% off and free shipping`;
  }

  return freeShipping ? "free shipping" : `${percentage}% off`;
}

/** "Spend 50+: free shipping, 100+: 10% off and free shipping" */
export function summarizeOrderTiers(tiers: OrderTier[]): string {
  return sortOrderTiers(tiers)
    .map((tier, index) => {
      const reward = describeOrderReward(tier.percentage, tier.freeShipping);
      const amount = `${formatThreshold(tier.minSubtotal)}+: ${reward}`;

      return index === 0 ? `Spend ${amount}` : amount;
    })
    .join(", ");
}

/** Trims a trailing .00 so round thresholds read as 100 rather than 100.00. */
export function formatThreshold(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
