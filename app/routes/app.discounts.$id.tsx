import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { TieredDiscountForm } from "../components/TieredDiscountForm";
import {
  discountFormValuesFromFormData,
  emptyTierRow,
  hasErrors,
  mapUserErrors,
  validateDiscountForm,
  type DiscountFormErrors,
  type DiscountFormValues,
} from "../lib/discount-form";
import {
  calendarDateToShopIso,
  shopIsoToCalendarDate,
  todayInShop,
} from "../lib/shop-time";
import {
  getShopTimezoneOffsetMinutes,
  getTieredDiscount,
  toDiscountGid,
  updateTieredDiscount,
} from "../models/discounts.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const id = toDiscountGid(params.id);
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const [offsetMinutes, discount] = await Promise.all([
    getShopTimezoneOffsetMinutes(admin),
    getTieredDiscount(admin, id),
  ]);

  if (!discount) {
    throw new Response("Not found", { status: 404 });
  }

  const config = discount.config;

  const values: DiscountFormValues = {
    title: discount.title,
    startDate:
      shopIsoToCalendarDate(discount.startsAt, offsetMinutes) ||
      todayInShop(offsetMinutes),
    endDate: shopIsoToCalendarDate(discount.endsAt, offsetMinutes),
    combinesWithShipping: discount.combinesWithShipping,
    tiers:
      config.status === "ok"
        ? config.tiers.map((tier) => ({
            minQuantity: String(tier.minQuantity),
            percentage: String(tier.percentage),
          }))
        : [emptyTierRow()],
  };

  return {
    values,
    unsupportedReason: config.status === "ok" ? null : config.reason,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const id = toDiscountGid(params.id);
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const values = discountFormValuesFromFormData(formData);
  const validation = validateDiscountForm(values);

  if (!validation.ok) {
    return { errors: validation.errors, formError: null };
  }

  try {
    const offsetMinutes = await getShopTimezoneOffsetMinutes(admin);
    const { title, startDate, endDate, combinesWithShipping, tiers } =
      validation.value;

    const result = await updateTieredDiscount(admin, id, {
      title,
      startsAt: calendarDateToShopIso(startDate, offsetMinutes),
      endsAt: endDate
        ? calendarDateToShopIso(endDate, offsetMinutes, true)
        : null,
      combinesWithShipping,
      tiers,
    });

    if (!result.ok) {
      const { errors, unmapped } = mapUserErrors(result.userErrors);

      return {
        errors,
        formError: unmapped.length ? unmapped.join(" ") : null,
      };
    }

    return redirect("/app/discounts?toast=updated");
  } catch (error) {
    return {
      errors: {} as DiscountFormErrors,
      formError:
        error instanceof Error
          ? error.message
          : "Something went wrong saving the discount.",
    };
  }
};

export default function EditDiscountPage() {
  const { values: loadedValues, unsupportedReason } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [values, setValues] = useState<DiscountFormValues>(loadedValues);
  const [clientErrors, setClientErrors] = useState<DiscountFormErrors>({});

  const saving = fetcher.state !== "idle";
  const errors = hasErrors(clientErrors)
    ? clientErrors
    : (fetcher.data?.errors ?? {});
  const formError = fetcher.data?.formError ?? null;

  const save = () => {
    const validation = validateDiscountForm(values);

    if (!validation.ok) {
      setClientErrors(validation.errors);
      return;
    }

    setClientErrors({});
    fetcher.submit(
      {
        title: values.title,
        startDate: values.startDate,
        endDate: values.endDate,
        combinesWithShipping: String(values.combinesWithShipping),
        tiers: JSON.stringify(values.tiers),
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Edit tiered discount">
      <s-link slot="breadcrumb-actions" href="/app/discounts">
        Discounts
      </s-link>

      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        {...(saving ? { loading: true } : {})}
      >
        Save
      </s-button>

      <s-button slot="secondary-actions" href="/app/discounts">
        Cancel
      </s-button>

      {unsupportedReason && (
        <s-banner
          slot="supplemental-start"
          tone="warning"
          heading="These settings were not written by this version of the app"
        >
          <s-paragraph>
            {unsupportedReason} Saving replaces the settings on this discount with the
            tiers below.
          </s-paragraph>
        </s-banner>
      )}

      {formError && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading="Could not save discount"
        >
          <s-paragraph>{formError}</s-paragraph>
        </s-banner>
      )}

      <TieredDiscountForm
        values={values}
        errors={errors}
        disabled={saving}
        onChange={setValues}
      />
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
