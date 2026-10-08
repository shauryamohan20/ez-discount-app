/**
 * Pure helpers shared by routes and loaders, so no component has to import
 * from a .server module to turn an ID into a link.
 *
 * Automatic and code discounts are different resources with different ID
 * types, and each has its own set of mutations, so the method is carried in
 * the URL and can always be recovered from a gid.
 */

export type DiscountMethod = "automatic" | "code";

const PREFIXES: Record<DiscountMethod, string> = {
  automatic: "gid://shopify/DiscountAutomaticNode/",
  code: "gid://shopify/DiscountCodeNode/",
};

export function isDiscountMethod(value: unknown): value is DiscountMethod {
  return value === "automatic" || value === "code";
}

/** The trailing number of a discount gid, used in app URLs. */
export function toDiscountNumericId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

/** Rebuilds a gid from URL parameters, or null when either is not valid. */
export function toDiscountGid(
  method: string | undefined,
  numericId: string | undefined,
): string | null {
  if (!isDiscountMethod(method)) return null;
  if (!numericId || !/^\d+$/.test(numericId)) return null;

  return `${PREFIXES[method]}${numericId}`;
}

/** Which family of mutations a discount belongs to, read from its gid. */
export function methodFromGid(gid: string): DiscountMethod | null {
  if (gid.startsWith(PREFIXES.automatic)) return "automatic";
  if (gid.startsWith(PREFIXES.code)) return "code";

  return null;
}

/** The app URL for a discount, for example /app/discounts/code/123. */
export function discountPath(method: DiscountMethod, gid: string): string {
  return `/app/discounts/${method}/${toDiscountNumericId(gid)}`;
}
