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

/** The tab a discount lives on, which follows its kind. */
export type DiscountTab = "quantity" | "order";

/**
 * The app URL for a discount's edit page, for example
 * /app/discounts/order/code/123. The tab is part of the path because each
 * kind of discount has its own pages.
 */
export function discountPath(
  tab: DiscountTab,
  method: DiscountMethod,
  gid: string,
): string {
  return `/app/discounts/${tab}/${method}/${toDiscountNumericId(gid)}`;
}

/**
 * The tab a discount lives on: order thresholds on the order tab, everything
 * else on the quantity tab. A config this build cannot read has no type, and
 * lives on the quantity tab, which is where every discount lived before the
 * split. Typed structurally so browser code can use it without importing the
 * server model.
 */
export function discountTab(discount: {
  config: { status: string; type?: string };
}): DiscountTab {
  return discount.config.status === "ok" &&
    discount.config.type === "order_threshold"
    ? "order"
    : "quantity";
}
