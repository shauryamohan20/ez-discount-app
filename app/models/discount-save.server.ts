import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  discountFormValuesFromFormData,
  mapUserErrors,
  validateDiscountForm,
  type DiscountFormErrors,
} from "../lib/discount-form";
import { calendarDateToShopIso } from "../lib/shop-time";
import {
  createTieredDiscount,
  getShopTimezoneOffsetMinutes,
  updateTieredDiscount,
} from "./discounts.server";

export type SaveResult =
  | { ok: true }
  | { ok: false; errors: DiscountFormErrors; formError: string | null };

/**
 * Validates a submitted discount form and creates or updates the discount.
 * Validation runs again here, not just in the browser, so a hand crafted
 * request cannot skip it. Shopify's own errors come back against the field
 * they belong to where possible, and in a banner otherwise.
 *
 * Pass the discount's ID to update it, or null to create one.
 */
export async function saveDiscountFromForm(
  admin: AdminApiContext,
  formData: FormData,
  id: string | null,
): Promise<SaveResult> {
  const validation = validateDiscountForm(
    discountFormValuesFromFormData(formData),
  );

  if (!validation.ok) {
    return { ok: false, errors: validation.errors, formError: null };
  }

  try {
    const offsetMinutes = await getShopTimezoneOffsetMinutes(admin);
    const { startDate, endDate, ...rest } = validation.value;

    const input = {
      ...rest,
      startsAt: calendarDateToShopIso(startDate, offsetMinutes),
      endsAt: endDate
        ? calendarDateToShopIso(endDate, offsetMinutes, true)
        : null,
    };

    const result = id
      ? await updateTieredDiscount(admin, id, input)
      : await createTieredDiscount(admin, input);

    if (!result.ok) {
      const { errors, unmapped } = mapUserErrors(result.userErrors);

      // An error about the settings metafield is shown against the tiers, but
      // Buy X Get Y has no tiers section, so there it would have nowhere to
      // appear. It goes in the banner instead, so a failed save always says why.
      if (rest.discountType === "buy_x_get_y" && errors.tiers) {
        unmapped.push(errors.tiers);
        delete errors.tiers;
      }

      return {
        ok: false,
        errors,
        formError: unmapped.length ? unmapped.join(" ") : null,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errors: {},
      formError:
        error instanceof Error
          ? error.message
          : "Something went wrong saving the discount.",
    };
  }
}
