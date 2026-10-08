import type { DiscountMethod } from "./discount-id";
import { isCalendarDate } from "./shop-time";
import {
  ALL_PRODUCTS,
  MAX_TIERS,
  isCustomerEligibility,
  sortOrderTiers,
  sortTiers,
  isDiscountType,
  type AppliesTo,
  type AppliesToType,
  type CustomerEligibility,
  type DiscountType,
  type OrderTier,
  type Tier,
} from "./tiers";

/**
 * A product or collection the merchant picked. The title is carried for
 * display only: the config stores IDs, and titles are resolved fresh when a
 * discount is opened, so a renamed product never shows a stale name.
 */
export type ResourceRef = {
  id: string;
  title: string;
};

/** Form state is kept as strings so half typed numbers stay on screen. */
/** Order threshold rows are kept as strings for the same reason. */
export type OrderTierRowValues = {
  minSubtotal: string;
  percentage: string;
};

export type OrderTierRowErrors = {
  minSubtotal?: string;
  percentage?: string;
};

export type TierRowValues = {
  minQuantity: string;
  maxQuantity: string;
  percentage: string;
  maxDiscountedUnits: string;
};

export type DiscountFormValues = {
  /** Chosen at creation and fixed afterwards: the classes differ per type. */
  discountType: DiscountType;
  /** Chosen at creation and fixed afterwards: the two are different resources. */
  method: DiscountMethod;
  code: string;
  usageLimit: string;
  appliesOncePerCustomer: boolean;
  title: string;
  startDate: string;
  endDate: string;
  combinesWithShipping: boolean;
  /**
   * Whether this discount may apply alongside the other discount class: order
   * discounts for a quantity tier discount, product discounts for an order
   * threshold. Same class combining is always off.
   */
  combinesWithOtherDiscounts: boolean;
  appliesToType: AppliesToType;
  products: ResourceRef[];
  collections: ResourceRef[];
  customerEligibility: CustomerEligibility;
  tiers: TierRowValues[];
  orderTiers: OrderTierRowValues[];
};

export type TierRowErrors = {
  minQuantity?: string;
  maxQuantity?: string;
  percentage?: string;
  maxDiscountedUnits?: string;
};

export type DiscountFormErrors = {
  code?: string;
  usageLimit?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  appliesTo?: string;
  tiers?: string;
  rows?: Record<string, TierRowErrors>;
  orderRows?: Record<string, OrderTierRowErrors>;
};

export type ValidatedDiscount = {
  discountType: DiscountType;
  method: DiscountMethod;
  code: string | null;
  usageLimit: number | null;
  appliesOncePerCustomer: boolean;
  title: string;
  startDate: string;
  endDate: string | null;
  combinesWithShipping: boolean;
  combinesWithOtherDiscounts: boolean;
  appliesTo: AppliesTo;
  customerEligibility: CustomerEligibility;
  /** Only the list matching discountType is populated. */
  tiers: Tier[];
  orderTiers: OrderTier[];
};

export type ValidationResult =
  | { ok: true; value: ValidatedDiscount }
  | { ok: false; errors: DiscountFormErrors };

export const MAX_TITLE_LENGTH = 255;
export const MAX_CODE_LENGTH = 255;

export function emptyOrderTierRow(): OrderTierRowValues {
  return { minSubtotal: "", percentage: "" };
}

export function orderTierToRow(tier: OrderTier): OrderTierRowValues {
  return {
    minSubtotal: String(tier.minSubtotal),
    percentage: String(tier.percentage),
  };
}

export function emptyTierRow(): TierRowValues {
  return {
    minQuantity: "",
    maxQuantity: "",
    percentage: "",
    maxDiscountedUnits: "",
  };
}

export function tierToRow(tier: Tier): TierRowValues {
  return {
    minQuantity: String(tier.minQuantity),
    maxQuantity: tier.maxQuantity === null ? "" : String(tier.maxQuantity),
    percentage: String(tier.percentage),
    maxDiscountedUnits:
      tier.maxDiscountedUnits === null ? "" : String(tier.maxDiscountedUnits),
  };
}

export function blankDiscountForm(
  startDate: string,
  method: DiscountMethod = "automatic",
  discountType: DiscountType = "quantity_tiers",
): DiscountFormValues {
  return {
    discountType,
    method,
    code: "",
    usageLimit: "",
    appliesOncePerCustomer: false,
    title: "",
    startDate,
    endDate: "",
    combinesWithShipping: true,
    combinesWithOtherDiscounts: false,
    appliesToType: "all",
    products: [],
    collections: [],
    customerEligibility: "all",
    tiers: [
      {
        minQuantity: "2",
        maxQuantity: "",
        percentage: "10",
        maxDiscountedUnits: "",
      },
    ],
    orderTiers: [{ minSubtotal: "100", percentage: "10" }],
  };
}

export function hasErrors(errors: DiscountFormErrors): boolean {
  if (
    errors.code ||
    errors.usageLimit ||
    errors.title ||
    errors.startDate ||
    errors.endDate ||
    errors.appliesTo ||
    errors.tiers
  ) {
    return true;
  }

  const quantityRows = Object.values(errors.rows ?? {}).some(
    (row) =>
      row.minQuantity ||
      row.maxQuantity ||
      row.percentage ||
      row.maxDiscountedUnits,
  );

  const orderRows = Object.values(errors.orderRows ?? {}).some(
    (row) => row.minSubtotal || row.percentage,
  );

  return quantityRows || orderRows;
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);

  return Number.isFinite(value) ? value : null;
}

type ParsedRow = { index: number; tier: Tier };

export function validateDiscountForm(
  values: DiscountFormValues,
): ValidationResult {
  const errors: DiscountFormErrors = {};
  const rows: Record<string, TierRowErrors> = {};

  const title = values.title.trim();
  if (!title) {
    errors.title = "Give the discount a title.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`;
  }

  const code = values.code.trim();
  if (values.method === "code") {
    if (!code) {
      errors.code = "Enter the code customers will type at checkout.";
    } else if (/\s/.test(code)) {
      errors.code = "A code cannot contain spaces.";
    } else if (code.length > MAX_CODE_LENGTH) {
      errors.code = `Keep the code under ${MAX_CODE_LENGTH} characters.`;
    }
  }

  const usageLimitRaw = values.usageLimit.trim();
  let usageLimit: number | null = null;

  if (values.method === "code" && usageLimitRaw !== "") {
    const parsedLimit = parseNumber(usageLimitRaw);

    if (parsedLimit === null || !Number.isInteger(parsedLimit)) {
      errors.usageLimit = "Use a whole number.";
    } else if (parsedLimit < 1) {
      errors.usageLimit = "Use 1 or more.";
    } else {
      usageLimit = parsedLimit;
    }
  }

  const startDate = values.startDate.trim();
  if (!startDate) {
    errors.startDate = "Choose a start date.";
  } else if (!isCalendarDate(startDate)) {
    errors.startDate = "Enter a valid date.";
  }

  const endDate = values.endDate.trim();
  if (endDate && !isCalendarDate(endDate)) {
    errors.endDate = "Enter a valid date.";
  } else if (endDate && startDate && endDate <= startDate) {
    errors.endDate = "The end date must be after the start date.";
  }

  const isOrderThreshold = values.discountType === "order_threshold";

  if (isOrderThreshold) {
    // An order threshold discounts the whole order, so there is nothing to
    // scope to a product in this version.
  } else if (
    values.appliesToType === "products" &&
    values.products.length === 0
  ) {
    errors.appliesTo = "Choose at least one product.";
  } else if (
    values.appliesToType === "collections" &&
    values.collections.length === 0
  ) {
    errors.appliesTo = "Choose at least one collection.";
  }

  const rowCount = isOrderThreshold
    ? values.orderTiers.length
    : values.tiers.length;

  if (rowCount === 0) {
    errors.tiers = "Add at least one tier.";
  } else if (rowCount > MAX_TIERS) {
    errors.tiers = `Use no more than ${MAX_TIERS} tiers.`;
  }

  const orderRows: Record<string, OrderTierRowErrors> = {};
  const parsedOrderTiers: { index: number; tier: OrderTier }[] = [];

  if (isOrderThreshold) {
    const seenThresholds = new Set<number>();

    values.orderTiers.forEach((row, index) => {
      const rowErrors: OrderTierRowErrors = {};

      const minSubtotal = parseNumber(row.minSubtotal);
      if (minSubtotal === null) {
        rowErrors.minSubtotal = "Enter an amount.";
      } else if (minSubtotal <= 0) {
        rowErrors.minSubtotal = "Use more than 0.";
      } else if (Number(minSubtotal.toFixed(2)) !== minSubtotal) {
        rowErrors.minSubtotal = "Use at most 2 decimal places.";
      } else if (seenThresholds.has(minSubtotal)) {
        rowErrors.minSubtotal = "Each tier needs a different amount.";
      } else {
        seenThresholds.add(minSubtotal);
      }

      const percentage = parseNumber(row.percentage);
      if (percentage === null) {
        rowErrors.percentage = "Enter a percentage.";
      } else if (percentage <= 0) {
        rowErrors.percentage = "Use more than 0.";
      } else if (percentage > 100) {
        rowErrors.percentage = "Use 100 or less.";
      }

      if (rowErrors.minSubtotal || rowErrors.percentage) {
        orderRows[String(index)] = rowErrors;
        return;
      }

      parsedOrderTiers.push({
        index,
        tier: { minSubtotal: minSubtotal!, percentage: percentage! },
      });
    });

    if (Object.keys(orderRows).length > 0) {
      errors.orderRows = orderRows;
    }

    if (hasErrors(errors)) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      value: {
        discountType: values.discountType,
        method: values.method,
        code: values.method === "code" ? code : null,
        usageLimit: values.method === "code" ? usageLimit : null,
        appliesOncePerCustomer:
          values.method === "code" ? values.appliesOncePerCustomer : false,
        title,
        startDate,
        endDate: endDate || null,
        combinesWithShipping: values.combinesWithShipping,
        combinesWithOtherDiscounts: values.combinesWithOtherDiscounts,
        appliesTo: ALL_PRODUCTS,
        customerEligibility: values.customerEligibility,
        tiers: [],
        orderTiers: sortOrderTiers(parsedOrderTiers.map((row) => row.tier)),
      },
    };
  }

  const parsed: ParsedRow[] = [];

  values.tiers.forEach((row, index) => {
    const rowErrors: TierRowErrors = {};

    const minQuantity = parseNumber(row.minQuantity);
    if (minQuantity === null) {
      rowErrors.minQuantity = "Enter a quantity.";
    } else if (!Number.isInteger(minQuantity)) {
      rowErrors.minQuantity = "Use a whole number.";
    } else if (minQuantity < 1) {
      rowErrors.minQuantity = "Use 1 or more.";
    }

    const maxQuantity = parseNumber(row.maxQuantity);
    if (row.maxQuantity.trim() !== "") {
      if (maxQuantity === null || !Number.isInteger(maxQuantity)) {
        rowErrors.maxQuantity = "Use a whole number.";
      } else if (maxQuantity < 1) {
        rowErrors.maxQuantity = "Use 1 or more.";
      } else if (
        minQuantity !== null &&
        !rowErrors.minQuantity &&
        maxQuantity < minQuantity
      ) {
        rowErrors.maxQuantity = "Cannot be lower than the from quantity.";
      }
    }

    const percentage = parseNumber(row.percentage);
    if (percentage === null) {
      rowErrors.percentage = "Enter a percentage.";
    } else if (percentage <= 0) {
      rowErrors.percentage = "Use more than 0.";
    } else if (percentage > 100) {
      rowErrors.percentage = "Use 100 or less.";
    }

    const maxDiscountedUnits = parseNumber(row.maxDiscountedUnits);
    if (row.maxDiscountedUnits.trim() !== "") {
      if (maxDiscountedUnits === null || !Number.isInteger(maxDiscountedUnits)) {
        rowErrors.maxDiscountedUnits = "Use a whole number.";
      } else if (maxDiscountedUnits < 1) {
        rowErrors.maxDiscountedUnits = "Use 1 or more.";
      }
    }

    if (
      rowErrors.minQuantity ||
      rowErrors.maxQuantity ||
      rowErrors.percentage ||
      rowErrors.maxDiscountedUnits
    ) {
      rows[String(index)] = rowErrors;
      return;
    }

    parsed.push({
      index,
      tier: {
        minQuantity: minQuantity!,
        maxQuantity: row.maxQuantity.trim() === "" ? null : maxQuantity!,
        percentage: percentage!,
        maxDiscountedUnits:
          row.maxDiscountedUnits.trim() === "" ? null : maxDiscountedUnits!,
      },
    });
  });

  // Two tiers that cover the same quantity would make the result depend on
  // the order of the list, so overlaps are rejected rather than resolved.
  const ordered = [...parsed].sort(
    (a, b) => a.tier.minQuantity - b.tier.minQuantity,
  );

  for (let position = 1; position < ordered.length; position++) {
    const previous = ordered[position - 1];
    const current = ordered[position];
    const previousMax = previous.tier.maxQuantity;

    if (previousMax === null || current.tier.minQuantity <= previousMax) {
      const existing = rows[String(current.index)] ?? {};

      rows[String(current.index)] = {
        ...existing,
        minQuantity:
          previousMax === null
            ? `Overlaps the tier starting at ${previous.tier.minQuantity}, which has no upper limit.`
            : `Overlaps the tier covering ${previous.tier.minQuantity} to ${previousMax}.`,
      };
    }
  }

  if (Object.keys(rows).length > 0) {
    errors.rows = rows;
  }

  if (hasErrors(errors)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      discountType: values.discountType,
      method: values.method,
      code: values.method === "code" ? code : null,
      usageLimit: values.method === "code" ? usageLimit : null,
      appliesOncePerCustomer:
        values.method === "code" ? values.appliesOncePerCustomer : false,
      title,
      startDate,
      endDate: endDate || null,
      combinesWithShipping: values.combinesWithShipping,
      combinesWithOtherDiscounts: values.combinesWithOtherDiscounts,
      appliesTo: {
        type: values.appliesToType,
        productIds:
          values.appliesToType === "products"
            ? values.products.map((product) => product.id)
            : [],
        collectionIds:
          values.appliesToType === "collections"
            ? values.collections.map((collection) => collection.id)
            : [],
      },
      customerEligibility: values.customerEligibility,
      tiers: sortTiers(parsed.map((row) => row.tier)),
      orderTiers: [],
    },
  };
}

/** Rebuilds form values from a submitted form, so the action can revalidate. */
export function discountFormValuesFromFormData(
  formData: FormData,
): DiscountFormValues {
  let tiers: TierRowValues[] = [];

  try {
    const parsed = JSON.parse(String(formData.get("tiers") ?? "[]"));

    if (Array.isArray(parsed)) {
      tiers = parsed.map((row) => ({
        minQuantity: String(row?.minQuantity ?? ""),
        maxQuantity: String(row?.maxQuantity ?? ""),
        percentage: String(row?.percentage ?? ""),
        maxDiscountedUnits: String(row?.maxDiscountedUnits ?? ""),
      }));
    }
  } catch {
    tiers = [];
  }

  const appliesToType = String(formData.get("appliesToType") ?? "all");
  const customerEligibility = formData.get("customerEligibility");
  const method = formData.get("method");
  const discountType = formData.get("discountType");

  return {
    discountType: isDiscountType(discountType)
      ? discountType
      : "quantity_tiers",
    method: method === "code" ? "code" : "automatic",
    code: String(formData.get("code") ?? ""),
    usageLimit: String(formData.get("usageLimit") ?? ""),
    appliesOncePerCustomer: formData.get("appliesOncePerCustomer") === "true",
    title: String(formData.get("title") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    combinesWithShipping: formData.get("combinesWithShipping") === "true",
    combinesWithOtherDiscounts:
      formData.get("combinesWithOtherDiscounts") === "true",
    appliesToType:
      appliesToType === "products" || appliesToType === "collections"
        ? appliesToType
        : "all",
    products: resourceRefsFromFormData(formData, "products"),
    collections: resourceRefsFromFormData(formData, "collections"),
    customerEligibility: isCustomerEligibility(customerEligibility)
      ? customerEligibility
      : "all",
    tiers,
    orderTiers: orderTierRowsFromFormData(formData),
  };
}

function orderTierRowsFromFormData(formData: FormData): OrderTierRowValues[] {
  try {
    const parsed = JSON.parse(String(formData.get("orderTiers") ?? "[]"));

    if (!Array.isArray(parsed)) return [];

    return parsed.map((row) => ({
      minSubtotal: String(row?.minSubtotal ?? ""),
      percentage: String(row?.percentage ?? ""),
    }));
  } catch {
    return [];
  }
}

function resourceRefsFromFormData(
  formData: FormData,
  field: string,
): ResourceRef[] {
  try {
    const parsed = JSON.parse(String(formData.get(field) ?? "[]"));

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        id: String(entry?.id ?? ""),
        title: String(entry?.title ?? ""),
      }))
      .filter((entry) => entry.id !== "");
  } catch {
    return [];
  }
}

type UserErrorLike = {
  field?: string[] | null;
  message: string;
};

/**
 * Shopify reports problems against input paths such as
 * ["automaticAppDiscount", "title"]. Anything that maps onto a field is shown
 * against that field, and the rest is returned for a banner.
 */
export function mapUserErrors(userErrors: UserErrorLike[]): {
  errors: DiscountFormErrors;
  unmapped: string[];
} {
  const errors: DiscountFormErrors = {};
  const unmapped: string[] = [];

  for (const userError of userErrors) {
    const field = userError.field?.[userError.field.length - 1];

    switch (field) {
      case "title":
        errors.title = userError.message;
        break;
      case "code":
        errors.code = userError.message;
        break;
      case "usageLimit":
        errors.usageLimit = userError.message;
        break;
      case "startsAt":
        errors.startDate = userError.message;
        break;
      case "endsAt":
        errors.endDate = userError.message;
        break;
      case "metafields":
      case "value":
        errors.tiers = userError.message;
        break;
      default:
        unmapped.push(userError.message);
    }
  }

  return { errors, unmapped };
}
