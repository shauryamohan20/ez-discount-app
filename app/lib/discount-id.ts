/**
 * Pure helpers shared by routes and loaders, so no component has to import
 * from a .server module to turn an ID into a link.
 */

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
