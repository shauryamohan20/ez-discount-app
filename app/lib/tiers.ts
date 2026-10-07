/**
 * Shared contract between the merchant UI and the tiered-discount Function.
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
 * Discounts saved by a newer version are shown read only rather than edited
 * with the wrong assumptions. Discounts with no version are treated as 1,
 * which covers discounts created before the app wrote a version.
 */
export const TIER_CONFIG_VERSION = 1;

export const MAX_TIERS = 10;

export type Tier = {
  minQuantity: number;
  percentage: number;
};

export type TierConfig =
  | { status: "ok"; version: number; tiers: Tier[] }
  | { status: "unsupported"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTier(value: unknown): value is Tier {
  if (!isRecord(value)) return false;

  const { minQuantity, percentage } = value;

  return (
    typeof minQuantity === "number" &&
    Number.isInteger(minQuantity) &&
    minQuantity >= 1 &&
    typeof percentage === "number" &&
    Number.isFinite(percentage) &&
    percentage > 0 &&
    percentage <= 100
  );
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

  if (!tiers.every(isValidTier)) {
    return {
      status: "unsupported",
      reason: "The saved tiers are not in a format this version of the app can read.",
    };
  }

  return {
    status: "ok",
    version,
    tiers: sortTiers(tiers),
  };
}

export function serializeTierConfig(tiers: Tier[]): string {
  return JSON.stringify({ version: TIER_CONFIG_VERSION, tiers: sortTiers(tiers) });
}

export function sortTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
}

/** "2+ items: 10% off, 3+ items: 15% off" */
export function summarizeTiers(tiers: Tier[]): string {
  return sortTiers(tiers)
    .map((tier) => `${tier.minQuantity}+ items: ${tier.percentage}% off`)
    .join(", ");
}
