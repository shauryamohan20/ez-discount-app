import {
  ProductDiscountSelectionStrategy,
  CartInput,
  CartOperation,
  ProductDiscountCandidateTarget,
} from "../generated/api";

/**
 * Buy X Get Y: buy a quantity of qualifying products, get a quantity of
 * target products at a percentage off, repeated as often as the cart allows.
 *
 * The maths works on cart lines rather than on individual units. A line of
 * quantity 500 would otherwise become 500 objects inside a function with a hard
 * instruction budget, and grouping by line gives exactly the same answer.
 */

type ScopeKind = "all" | "products" | "collections";

type Scope = { kind: ScopeKind; ids: string[] };

type GetScope = Scope | { kind: "same_as_buy"; ids: string[] };

/**
 * How the "get" units are discounted. Only a percentage exists today; a fixed
 * amount would be a second variant here, which is why it is a tagged object.
 */
type GetValue = { percentage: number };

export type BuyXGetYRules = {
  buyQuantity: number;
  buyScope: Scope;
  getQuantity: number;
  getScope: GetScope;
  value: GetValue;
  /** null means no limit. */
  maxApplicationsPerOrder: number | null;
};

type Line = CartInput["cart"]["lines"][number];

/** A cart line reduced to what the maths needs. */
type Pool = {
  id: string;
  /** Unit price in whole cents of the buyer's currency. */
  unitPriceCents: number;
  quantity: number;
  /** The line can supply "buy" units. */
  buy: boolean;
  /** The line can supply "get" units. */
  get: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeNumberAtLeastOne(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === "string" && id.length > 0)
  );
}

function parseScope(value: unknown, allowSameAsBuy: boolean): GetScope | null {
  if (!isRecord(value)) return null;

  const { kind } = value;
  const ids = value.ids ?? [];
  if (!isIdList(ids)) return null;

  if (kind === "same_as_buy") {
    return allowSameAsBuy ? { kind, ids: [] } : null;
  }

  if (kind === "all") return { kind, ids: [] };

  if (kind === "products" || kind === "collections") {
    // A scope that names no products or collections can never match.
    return ids.length ? { kind, ids } : null;
  }

  return null;
}

/**
 * Reads the config, or returns null for anything malformed. A null here means
 * no discount, never an error, because a config can be written by hand.
 */
export function parseBuyXGetY(config: unknown): BuyXGetYRules | null {
  if (!isRecord(config)) return null;

  const { buy, get } = config;
  if (!isRecord(buy) || !isRecord(get)) return null;

  if (!isWholeNumberAtLeastOne(buy.quantity)) return null;
  if (!isWholeNumberAtLeastOne(get.quantity)) return null;

  const buyScope = parseScope(buy.scope, false);
  const getScope = parseScope(get.scope, true);
  if (!buyScope || !getScope || buyScope.kind === "same_as_buy") return null;

  const value = get.value;
  if (!isRecord(value)) return null;

  const { percentage } = value;
  if (
    typeof percentage !== "number" ||
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    percentage > 100
  ) {
    return null;
  }

  const max = config.maxApplicationsPerOrder;
  if (max !== undefined && max !== null && !isWholeNumberAtLeastOne(max)) {
    return null;
  }

  // Only the cheapest units are ever discounted in this version. Anything else
  // is a rule this build does not know, so it is treated as malformed.
  const discountedUnits = config.discountedUnits;
  if (discountedUnits !== undefined && discountedUnits !== "cheapest") {
    return null;
  }

  return {
    buyQuantity: buy.quantity,
    buyScope: buyScope as Scope,
    getQuantity: get.quantity,
    getScope,
    value: { percentage },
    maxApplicationsPerOrder: max ?? null,
  };
}

function matchesScope(line: Line, scope: Scope, side: "buy" | "get"): boolean {
  const merchandise = line.merchandise;
  if (merchandise.__typename !== "ProductVariant") return false;

  switch (scope.kind) {
    case "all":
      return true;
    case "products":
      return scope.ids.includes(merchandise.product.id);
    case "collections":
      // Collection membership is resolved by Shopify from the input query
      // variables, one variable per side.
      return side === "buy"
        ? merchandise.product.inBuyCollection
        : merchandise.product.inGetCollection;
  }
}

/**
 * Turns cart lines into pools of units, each marked as able to supply buy
 * units, get units, or both. Lines that match neither side, have no units, or
 * have no usable price are left out.
 */
export function buildPools(lines: Line[], rules: BuyXGetYRules): Pool[] {
  const pools: Pool[] = [];

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;

    const price = Number(line.cost?.amountPerQuantity?.amount);
    if (!Number.isFinite(price) || price < 0) continue;

    const buy = matchesScope(line, rules.buyScope, "buy");
    const get =
      rules.getScope.kind === "same_as_buy"
        ? buy
        : matchesScope(line, rules.getScope, "get");

    if (!buy && !get) continue;

    pools.push({
      id: line.id,
      unitPriceCents: Math.round(price * 100),
      quantity: line.quantity,
      buy,
      get,
    });
  }

  return pools;
}

type Counts = { onlyBuy: number; onlyGet: number; both: number };

function countUnits(pools: Pool[]): Counts {
  const counts: Counts = { onlyBuy: 0, onlyGet: 0, both: 0 };

  for (const pool of pools) {
    if (pool.buy && pool.get) counts.both += pool.quantity;
    else if (pool.buy) counts.onlyBuy += pool.quantity;
    else counts.onlyGet += pool.quantity;
  }

  return counts;
}

/**
 * How many times the offer applies.
 *
 * Each application needs `buy` buy units and `get` get units, and no unit may
 * do both jobs. Units that fit both sides can fill either. Working through the
 * cases, the offer can apply n times exactly when all three of these hold:
 *
 *   n * buy        <= onlyBuy + both
 *   n * get        <= onlyGet + both
 *   n * (buy+get)  <= onlyBuy + onlyGet + both
 *
 * so n is the smallest of the three bounds, then the per order limit. When buy
 * and get are the same pool, every unit is in `both` and this reduces to the
 * familiar floor(units / (buy + get)).
 */
export function countApplications(pools: Pool[], rules: BuyXGetYRules): number {
  const { onlyBuy, onlyGet, both } = countUnits(pools);
  const { buyQuantity: buy, getQuantity: get } = rules;

  let applications = Math.min(
    Math.floor((onlyBuy + both) / buy),
    Math.floor((onlyGet + both) / get),
    Math.floor((onlyBuy + onlyGet + both) / (buy + get)),
  );

  if (rules.maxApplicationsPerOrder !== null) {
    applications = Math.min(applications, rules.maxApplicationsPerOrder);
  }

  return Math.max(0, applications);
}

/**
 * Picks which units are discounted: the cheapest get units the cart can spare.
 *
 * A unit that fits both sides is only discounted if enough buy units are left
 * for every application, so at most `both - (buy units still needed from
 * them)` of those units may be taken. Taking the cheapest units first under
 * that cap gives the cheapest possible set.
 *
 * Returns how many units to discount on each line.
 */
export function pickDiscountedUnits(
  pools: Pool[],
  rules: BuyXGetYRules,
  applications: number,
): Map<string, number> {
  const picked = new Map<string, number>();
  if (applications <= 0) return picked;

  const { onlyBuy, both } = countUnits(pools);

  let remaining = applications * rules.getQuantity;
  let sharedBudget =
    both - Math.max(0, applications * rules.buyQuantity - onlyBuy);

  // Cheapest first; ties broken by line ID so the result never depends on
  // the order Shopify happens to list the lines in.
  const candidates = pools
    .filter((pool) => pool.get)
    .sort(
      (a, b) =>
        a.unitPriceCents - b.unitPriceCents ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  for (const pool of candidates) {
    if (remaining <= 0) break;

    const shared = pool.buy && pool.get;
    const available = shared
      ? Math.min(pool.quantity, sharedBudget)
      : pool.quantity;
    const take = Math.min(remaining, available);

    if (take <= 0) continue;

    picked.set(pool.id, take);
    remaining -= take;
    if (shared) sharedBudget -= take;
  }

  // The bounds in countApplications guarantee enough units. If that ever
  // fails, applying a partial offer would be wrong, so apply nothing.
  return remaining > 0 ? new Map() : picked;
}

/** "Buy 2 Get 1 Free", "Buy 2 Get 1 at 50% Off". */
export function buyXGetYMessage(rules: BuyXGetYRules): string {
  const offer =
    rules.value.percentage >= 100
      ? "Free"
      : `at ${rules.value.percentage}% Off`;

  return `Buy ${rules.buyQuantity} Get ${rules.getQuantity} ${offer}`;
}

export function runBuyXGetY(
  input: CartInput,
  config: unknown,
): CartOperation[] {
  const rules = parseBuyXGetY(config);
  if (!rules) return [];

  const pools = buildPools(input.cart.lines, rules);
  if (!pools.length) return [];

  const applications = countApplications(pools, rules);
  if (applications <= 0) return [];

  const picked = pickDiscountedUnits(pools, rules, applications);
  if (!picked.size) return [];

  // One target per line: Shopify merges targets that share a line, and a merged
  // target with no quantity would discount the whole line.
  const targets: ProductDiscountCandidateTarget[] = [];
  for (const [id, quantity] of picked) {
    targets.push({ cartLine: { id, quantity } });
  }

  return [
    {
      productDiscountsAdd: {
        candidates: [
          {
            message: buyXGetYMessage(rules),
            targets,
            value: { percentage: { value: String(rules.value.percentage) } },
          },
        ],
        selectionStrategy: ProductDiscountSelectionStrategy.First,
      },
    },
  ];
}
