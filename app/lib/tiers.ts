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
 *
 * Each added field is optional, so a config written by an earlier version
 * keeps the behaviour it had then and is rewritten at the current version the
 * next time it is saved.
 * Discounts saved by a newer version are reported as unsupported rather than
 * edited with the wrong assumptions.
 */
export const TIER_CONFIG_VERSION = 5;

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
  | "all"
  | "signedIn"
  | "firstOrder"
  | "returning";

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
export type DiscountType = "quantity_tiers" | "order_threshold";

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  quantity_tiers: "Quantity tiers",
  order_threshold: "Order threshold",
};

export function isDiscountType(value: unknown): value is DiscountType {
  return value === "quantity_tiers" || value === "order_threshold";
}

/** A percentage off the whole order once the subtotal reaches minSubtotal. */
export type OrderTier = {
  /** In the shop's currency, to at most two decimal places. */
  minSubtotal: number;
  percentage: number;
};

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
    percentage <= 0 ||
    percentage > 100
  ) {
    return null;
  }

  return { minSubtotal, percentage };
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

/**
 * Reads the config metafield. Anything this build does not recognise comes
 * back as "unsupported" so the UI can say so instead of guessing.
 */
export function parseTierConfig(jsonValue: unknown): TierConfig {
  if (!isRecord(jsonValue)) {
    return {
      status: "unsupported",
      reason: "The saved settings are not in the expected format.",
    };
  }

  const rawVersion = jsonValue.version;
  const version = rawVersion === undefined ? 1 : rawVersion;

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return {
      status: "unsupported",
      reason: "The saved settings have an unrecognised version.",
    };
  }

  if (version > TIER_CONFIG_VERSION) {
    return {
      status: "unsupported",
      reason:
        "This discount was saved by a newer version of the app. Update the app to edit it.",
    };
  }

  const { tiers } = jsonValue;

  if (!Array.isArray(tiers) || tiers.length === 0) {
    return {
      status: "unsupported",
      reason: "The saved settings do not contain any tiers.",
    };
  }

  const rawType = jsonValue.type;
  const type = rawType === undefined || rawType === null ? "quantity_tiers" : rawType;

  if (!isDiscountType(type)) {
    return {
      status: "unsupported",
      reason: "This discount is of a kind this version of the app cannot read.",
    };
  }

  const unreadableTiers: TierConfig = {
    status: "unsupported",
    reason:
      "The saved tiers are not in a format this version of the app can read.",
  };

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
    return {
      status: "unsupported",
      reason:
        "The saved product targeting is not in a format this version of the app can read.",
    };
  }

  // Absent means the config predates customer rules, so: everyone.
  const rawEligibility = jsonValue.customerEligibility;
  const customerEligibility =
    rawEligibility === undefined || rawEligibility === null
      ? "all"
      : rawEligibility;

  if (!isCustomerEligibility(customerEligibility)) {
    return {
      status: "unsupported",
      reason:
        "The saved customer eligibility is not a value this version of the app can read.",
    };
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

/**
 * The Function resolves collection membership through an input query variable,
 * so the selected collection IDs are written to their own metafield whose keys
 * are variable names. Always written, including as an empty list, so the
 * variable is never missing for a discount this app created.
 */
export function serializeInputVariables(appliesTo: AppliesTo): string {
  return JSON.stringify({
    collectionIds:
      appliesTo.type === "collections" ? appliesTo.collectionIds : [],
  });
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

/** "Spend 100+: 10% off, 200+: 15% off" */
export function summarizeOrderTiers(tiers: OrderTier[]): string {
  return sortOrderTiers(tiers)
    .map((tier, index) =>
      index === 0
        ? `Spend ${formatThreshold(tier.minSubtotal)}+: ${tier.percentage}% off`
        : `${formatThreshold(tier.minSubtotal)}+: ${tier.percentage}% off`,
    )
    .join(", ");
}

/** Trims a trailing .00 so round thresholds read as 100 rather than 100.00. */
export function formatThreshold(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
