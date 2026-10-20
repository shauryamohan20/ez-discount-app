import {
  MAX_CONFIG_BYTES,
  MAX_SCOPE_IDS,
  byteLength,
  describeBuyXGetY,
  serializeBuyXGetYConfig,
  type BuyScopeKind,
  type BuyXGetY,
  type CustomerEligibility,
  type GetScopeKind,
} from "./tiers";

/** A picked product or collection; the title is for display only. */
export type BxgyResource = { id: string; title: string };

/**
 * The Buy X Get Y part of the form. Numbers are kept as strings so a half
 * typed value stays on screen, and each side keeps its products and its
 * collections separately so switching between them does not lose a selection.
 */
export type BxgyFormValues = {
  buyQuantity: string;
  buyScopeKind: BuyScopeKind;
  buyProducts: BxgyResource[];
  buyCollections: BxgyResource[];
  getQuantity: string;
  getScopeKind: GetScopeKind;
  getProducts: BxgyResource[];
  getCollections: BxgyResource[];
  /** 100 is free. */
  percentage: string;
  /** Empty means no limit. */
  maxApplications: string;
};

export type BxgyFormErrors = {
  buyQuantity?: string;
  buyScope?: string;
  getQuantity?: string;
  getScope?: string;
  percentage?: string;
  maxApplications?: string;
  /** The saved settings would be too large for the Function to receive. */
  size?: string;
};

export type BxgyValidation =
  { ok: true; value: BuyXGetY } | { ok: false; errors: BxgyFormErrors };

/**
 * Buy 2 get 1 free on products the merchant still has to choose. Defaulting to
 * every product would make a store wide giveaway the easiest thing to save by
 * accident.
 */
export function blankBxgyForm(): BxgyFormValues {
  return {
    buyQuantity: "2",
    buyScopeKind: "products",
    buyProducts: [],
    buyCollections: [],
    getQuantity: "1",
    getScopeKind: "same_as_buy",
    getProducts: [],
    getCollections: [],
    percentage: "100",
    maxApplications: "",
  };
}

/** Saved settings back into form values, with titles looked up by the caller. */
export function bxgyToFormValues(
  bxgy: BuyXGetY,
  titleOf: (id: string) => string,
): BxgyFormValues {
  const refs = (ids: string[]) => ids.map((id) => ({ id, title: titleOf(id) }));

  return {
    buyQuantity: String(bxgy.buyQuantity),
    buyScopeKind: bxgy.buyScope.kind,
    buyProducts:
      bxgy.buyScope.kind === "products" ? refs(bxgy.buyScope.ids) : [],
    buyCollections:
      bxgy.buyScope.kind === "collections" ? refs(bxgy.buyScope.ids) : [],
    getQuantity: String(bxgy.getQuantity),
    getScopeKind: bxgy.getScope.kind,
    getProducts:
      bxgy.getScope.kind === "products" ? refs(bxgy.getScope.ids) : [],
    getCollections:
      bxgy.getScope.kind === "collections" ? refs(bxgy.getScope.ids) : [],
    percentage: String(bxgy.percentage),
    maxApplications:
      bxgy.maxApplicationsPerOrder === null
        ? ""
        : String(bxgy.maxApplicationsPerOrder),
  };
}

export function hasBxgyErrors(errors: BxgyFormErrors | undefined): boolean {
  if (!errors) return false;

  return Boolean(
    errors.buyQuantity ||
    errors.buyScope ||
    errors.getQuantity ||
    errors.getScope ||
    errors.percentage ||
    errors.maxApplications ||
    errors.size,
  );
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function wholeNumberError(raw: string): string | undefined {
  const value = parseNumber(raw);

  if (value === null) return "Enter a number.";
  if (!Number.isInteger(value)) return "Use a whole number.";
  if (value < 1) return "Use 1 or more.";

  return undefined;
}

export function selectionFor(
  values: BxgyFormValues,
  side: "buy" | "get",
): BxgyResource[] {
  const kind = side === "buy" ? values.buyScopeKind : values.getScopeKind;

  if (kind === "products") {
    return side === "buy" ? values.buyProducts : values.getProducts;
  }

  if (kind === "collections") {
    return side === "buy" ? values.buyCollections : values.getCollections;
  }

  return [];
}

function selectionError(
  kind: BuyScopeKind | GetScopeKind,
  count: number,
): string | undefined {
  if (kind !== "products" && kind !== "collections") return undefined;

  const noun = kind === "products" ? "product" : "collection";

  if (count === 0) return `Choose at least one ${noun}.`;
  if (count > MAX_SCOPE_IDS) {
    return `Choose no more than ${MAX_SCOPE_IDS} ${noun}s.`;
  }

  return undefined;
}

/**
 * The same rules the Function applies, so nothing can be saved that the
 * Function would quietly ignore. The size check catches a selection too large
 * to reach the Function at all.
 */
export function validateBxgy(
  values: BxgyFormValues,
  customerEligibility: CustomerEligibility,
): BxgyValidation {
  const errors: BxgyFormErrors = {
    buyQuantity: wholeNumberError(values.buyQuantity),
    getQuantity: wholeNumberError(values.getQuantity),
    buyScope: selectionError(
      values.buyScopeKind,
      selectionFor(values, "buy").length,
    ),
    getScope: selectionError(
      values.getScopeKind,
      selectionFor(values, "get").length,
    ),
  };

  const percentage = parseNumber(values.percentage);
  if (percentage === null) {
    errors.percentage = "Enter a percentage.";
  } else if (percentage <= 0) {
    errors.percentage = "Use more than 0.";
  } else if (percentage > 100) {
    errors.percentage = "Use 100 or less. 100 means free.";
  }

  let maxApplications: number | null = null;
  if (values.maxApplications.trim() !== "") {
    errors.maxApplications = wholeNumberError(values.maxApplications);
    if (!errors.maxApplications) {
      maxApplications = parseNumber(values.maxApplications);
    }
  }

  if (hasBxgyErrors(errors)) return { ok: false, errors };

  const bxgy: BuyXGetY = {
    buyQuantity: parseNumber(values.buyQuantity)!,
    buyScope: {
      kind: values.buyScopeKind,
      ids: selectionFor(values, "buy").map((resource) => resource.id),
    },
    getQuantity: parseNumber(values.getQuantity)!,
    getScope: {
      kind: values.getScopeKind,
      ids: selectionFor(values, "get").map((resource) => resource.id),
    },
    percentage: percentage!,
    maxApplicationsPerOrder: maxApplications,
  };

  const size = byteLength(serializeBuyXGetYConfig(bxgy, customerEligibility));
  if (size > MAX_CONFIG_BYTES) {
    return {
      ok: false,
      errors: {
        size: "This selection is too large for Shopify to pass to the discount. Use collections instead of long lists of products.",
      },
    };
  }

  return { ok: true, value: bxgy };
}

/**
 * The offer as the form describes it right now. It is lenient on purpose: a
 * half filled form still gets a preview, using fallbacks for what is missing,
 * so the preview never disappears while the merchant types. Used by the
 * sentence below and by the live preview panel.
 */
export function previewBxgyRules(values: BxgyFormValues): BuyXGetY {
  const wholeOr = (raw: string, fallback: number) => {
    const value = parseNumber(raw);
    return value !== null && Number.isInteger(value) && value >= 1
      ? value
      : fallback;
  };

  const percentage = parseNumber(values.percentage);
  const max = values.maxApplications.trim()
    ? wholeOr(values.maxApplications, 0)
    : null;

  return {
    buyQuantity: wholeOr(values.buyQuantity, 1),
    buyScope: {
      kind: values.buyScopeKind,
      ids: selectionFor(values, "buy").map((resource) => resource.id),
    },
    getQuantity: wholeOr(values.getQuantity, 1),
    getScope: {
      kind: values.getScopeKind,
      ids: selectionFor(values, "get").map((resource) => resource.id),
    },
    percentage:
      percentage !== null && percentage > 0 && percentage <= 100
        ? percentage
        : 100,
    maxApplicationsPerOrder: max && max >= 1 ? max : null,
  };
}

/** The offer as a sentence, updated as the merchant types. */
export function previewBxgy(values: BxgyFormValues): string {
  const titles = new Map<string, string>();
  for (const resource of [
    ...values.buyProducts,
    ...values.buyCollections,
    ...values.getProducts,
    ...values.getCollections,
  ]) {
    titles.set(resource.id, resource.title);
  }

  return describeBuyXGetY(previewBxgyRules(values), (id) => titles.get(id));
}

/** Rebuilds the values from a submitted form, so the action can revalidate. */
export function bxgyFromFormData(raw: unknown): BxgyFormValues {
  const blank = blankBxgyForm();

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    return blank;
  }

  if (typeof parsed !== "object" || parsed === null) return blank;
  const value = parsed as Record<string, unknown>;

  const text = (key: string, fallback: string) =>
    typeof value[key] === "string" ? (value[key] as string) : fallback;

  const resources = (key: string): BxgyResource[] =>
    Array.isArray(value[key])
      ? (value[key] as unknown[])
          .map((entry) => {
            const item = (entry ?? {}) as Record<string, unknown>;
            return {
              id: String(item.id ?? ""),
              title: String(item.title ?? ""),
            };
          })
          .filter((entry) => entry.id !== "")
      : [];

  const buyScopeKind = value.buyScopeKind;
  const getScopeKind = value.getScopeKind;

  return {
    buyQuantity: text("buyQuantity", blank.buyQuantity),
    buyScopeKind:
      buyScopeKind === "all" ||
      buyScopeKind === "products" ||
      buyScopeKind === "collections"
        ? buyScopeKind
        : blank.buyScopeKind,
    buyProducts: resources("buyProducts"),
    buyCollections: resources("buyCollections"),
    getQuantity: text("getQuantity", blank.getQuantity),
    getScopeKind:
      getScopeKind === "same_as_buy" ||
      getScopeKind === "products" ||
      getScopeKind === "collections"
        ? getScopeKind
        : blank.getScopeKind,
    getProducts: resources("getProducts"),
    getCollections: resources("getCollections"),
    percentage: text("percentage", blank.percentage),
    maxApplications: text("maxApplications", blank.maxApplications),
  };
}
