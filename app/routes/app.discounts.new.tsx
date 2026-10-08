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
  blankDiscountForm,
  discountFormValuesFromFormData,
  hasErrors,
  mapUserErrors,
  validateDiscountForm,
  type DiscountFormErrors,
  type DiscountFormValues,
} from "../lib/discount-form";
import { calendarDateToShopIso, todayInShop } from "../lib/shop-time";
import {
  createTieredDiscount,
  getShopTimezoneOffsetMinutes,
} from "../models/discounts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const offsetMinutes = await getShopTimezoneOffsetMinutes(admin);

  return { today: todayInShop(offsetMinutes) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const values = discountFormValuesFromFormData(formData);
  const validation = validateDiscountForm(values);

  if (!validation.ok) {
    return { errors: validation.errors, formError: null };
  }

  try {
    const offsetMinutes = await getShopTimezoneOffsetMinutes(admin);
    const {
      method,
      code,
      usageLimit,
      appliesOncePerCustomer,
      title,
      startDate,
      endDate,
      combinesWithShipping,
      appliesTo,
      customerEligibility,
      tiers,
    } = validation.value;

    const result = await createTieredDiscount(admin, {
      method,
      code,
      usageLimit,
      appliesOncePerCustomer,
      title,
      startsAt: calendarDateToShopIso(startDate, offsetMinutes),
      endsAt: endDate
        ? calendarDateToShopIso(endDate, offsetMinutes, true)
        : null,
      combinesWithShipping,
      appliesTo,
      customerEligibility,
      tiers,
    });

    if (!result.ok) {
      const { errors, unmapped } = mapUserErrors(result.userErrors);

      return {
        errors,
        formError: unmapped.length ? unmapped.join(" ") : null,
      };
    }

    return redirect("/app/discounts?toast=created");
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

export default function NewDiscountPage() {
  const { today } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [values, setValues] = useState<DiscountFormValues>(() =>
    blankDiscountForm(today),
  );
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
        method: values.method,
        code: values.code,
        usageLimit: values.usageLimit,
        appliesOncePerCustomer: String(values.appliesOncePerCustomer),
        appliesToType: values.appliesToType,
        customerEligibility: values.customerEligibility,
        products: JSON.stringify(values.products),
        collections: JSON.stringify(values.collections),
        tiers: JSON.stringify(values.tiers),
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Create quantity based discount">
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
