import { isCalendarDate } from "./shop-time";
import { MAX_TIERS, sortTiers, type Tier } from "./tiers";

/** Form state is kept as strings so half typed numbers stay on screen. */
export type TierRowValues = {
  minQuantity: string;
  percentage: string;
};

export type DiscountFormValues = {
  title: string;
  startDate: string;
  endDate: string;
  combinesWithShipping: boolean;
  tiers: TierRowValues[];
};

export type TierRowErrors = {
  minQuantity?: string;
  percentage?: string;
};

export type DiscountFormErrors = {
  title?: string;
  startDate?: string;
  endDate?: string;
  tiers?: string;
  rows?: Record<string, TierRowErrors>;
};

export type ValidatedDiscount = {
  title: string;
  startDate: string;
  endDate: string | null;
  combinesWithShipping: boolean;
  tiers: Tier[];
};

export type ValidationResult =
  | { ok: true; value: ValidatedDiscount }
  | { ok: false; errors: DiscountFormErrors };

export const MAX_TITLE_LENGTH = 255;

export function emptyTierRow(): TierRowValues {
  return { minQuantity: "", percentage: "" };
}

export function blankDiscountForm(startDate: string): DiscountFormValues {
  return {
    title: "",
    startDate,
    endDate: "",
    combinesWithShipping: true,
    tiers: [{ minQuantity: "2", percentage: "10" }],
  };
}

export function hasErrors(errors: DiscountFormErrors): boolean {
  if (errors.title || errors.startDate || errors.endDate || errors.tiers) {
    return true;
  }

  return Object.values(errors.rows ?? {}).some(
    (row) => row.minQuantity || row.percentage,
  );
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const value = Number(trimmed);

  return Number.isFinite(value) ? value : null;
}

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

  if (values.tiers.length === 0) {
    errors.tiers = "Add at least one tier.";
  } else if (values.tiers.length > MAX_TIERS) {
    errors.tiers = `Use no more than ${MAX_TIERS} tiers.`;
  }

  const tiers: Tier[] = [];
  const seenQuantities = new Set<number>();

  values.tiers.forEach((row, index) => {
    const rowErrors: TierRowErrors = {};

    const minQuantity = parseNumber(row.minQuantity);
    if (minQuantity === null) {
      rowErrors.minQuantity = "Enter a quantity.";
    } else if (!Number.isInteger(minQuantity)) {
      rowErrors.minQuantity = "Use a whole number.";
    } else if (minQuantity < 1) {
      rowErrors.minQuantity = "Use 1 or more.";
    } else if (seenQuantities.has(minQuantity)) {
      rowErrors.minQuantity = "Each tier needs a different quantity.";
    } else {
      seenQuantities.add(minQuantity);
    }

    const percentage = parseNumber(row.percentage);
    if (percentage === null) {
      rowErrors.percentage = "Enter a percentage.";
    } else if (percentage <= 0) {
      rowErrors.percentage = "Use more than 0.";
    } else if (percentage > 100) {
      rowErrors.percentage = "Use 100 or less.";
    }

    if (rowErrors.minQuantity || rowErrors.percentage) {
      rows[String(index)] = rowErrors;
      return;
    }

    tiers.push({ minQuantity: minQuantity!, percentage: percentage! });
  });

  if (Object.keys(rows).length > 0) {
    errors.rows = rows;
  }

  if (hasErrors(errors)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      startDate,
      endDate: endDate || null,
      combinesWithShipping: values.combinesWithShipping,
      tiers: sortTiers(tiers),
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
        percentage: String(row?.percentage ?? ""),
      }));
    }
  } catch {
    tiers = [];
  }

  return {
    title: String(formData.get("title") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    combinesWithShipping: formData.get("combinesWithShipping") === "true",
    tiers,
  };
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
