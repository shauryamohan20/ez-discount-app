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

/** Handle of the Function extension in extensions/tiered-discount. */
export const DISCOUNT_FUNCTION_HANDLE = "tiered-discount";

/**
 * Version of the config metafield this build of the app writes and understands.
 *
 * 1: tiers of { minQuantity, percentage }, always open ended.
 * 2: tiers gain maxQuantity and maxDiscountedUnits, both nullable.
 *
 * A version 1 tier is a version 2 tier with both new fields null, so old
 * discounts keep working and are rewritten as version 2 when next saved.
 * Discounts saved by a newer version are reported as unsupported rather than
 * edited with the wrong assumptions.
 */
export const TIER_CONFIG_VERSION = 2;

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

export type TierConfig =
  | { status: "ok"; version: number; tiers: Tier[] }
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

  const normalized: Tier[] = [];

  for (const tier of tiers) {
    const parsed = normalizeTier(tier);

    if (!parsed) {
      return {
        status: "unsupported",
        reason:
          "The saved tiers are not in a format this version of the app can read.",
      };
    }

    normalized.push(parsed);
  }

  return {
    status: "ok",
    version,
    tiers: sortTiers(normalized),
  };
}

export function serializeTierConfig(tiers: Tier[]): string {
  return JSON.stringify({
    version: TIER_CONFIG_VERSION,
    tiers: sortTiers(tiers),
  });
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
