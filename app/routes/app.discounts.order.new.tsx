import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  DiscountFormActions,
  savingAsFrom,
} from "../components/DiscountFormActions";
import { TieredDiscountForm } from "../components/TieredDiscountForm";
import { saveDiscountFromForm } from "../models/discount-save.server";
import {
  formValuesToSubmission,
  blankDiscountForm,
  hasErrors,
  validateDiscountForm,
  type DiscountFormErrors,
  type DiscountFormValues,
} from "../lib/discount-form";
import { todayInShop } from "../lib/shop-time";
import {
  getShopCurrencyCode,
  getShopTimezoneOffsetMinutes,
} from "../models/discounts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const [offsetMinutes, currencyCode] = await Promise.all([
    getShopTimezoneOffsetMinutes(admin),
    // The currency is a label on the amount field. If it cannot be read the
    // form is still usable, so it must not take the page down.
    getShopCurrencyCode(admin).catch(() => ""),
  ]);

  return { today: todayInShop(offsetMinutes), currencyCode };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, redirect } = await authenticate.admin(request);

  const result = await saveDiscountFromForm(
    admin,
    await request.formData(),
    null,
  );

  if (!result.ok) return result;

  return redirect(
    `/app/discounts/order?toast=${result.draft ? "drafted" : "created"}`,
  );
};

export default function NewOrderDiscountPage() {
  const { today, currencyCode } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [values, setValues] = useState<DiscountFormValues>(() =>
    blankDiscountForm(today, "automatic", "order_threshold"),
  );
  const [clientErrors, setClientErrors] = useState<DiscountFormErrors>({});

  const saving = fetcher.state !== "idle";
  const errors = hasErrors(clientErrors)
    ? clientErrors
    : (fetcher.data?.errors ?? {});
  const formError = fetcher.data?.formError ?? null;

  const save = (saveAs: "save" | "draft") => {
    const validation = validateDiscountForm(values);

    if (!validation.ok) {
      setClientErrors(validation.errors);
      return;
    }

    setClientErrors({});
    fetcher.submit(formValuesToSubmission(values, saveAs), { method: "POST" });
  };

  return (
    <s-page heading="Create whole order discount" inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/discounts/order">
        Whole order discounts
      </s-link>

      <DiscountFormActions
        saving={saving}
        savingAs={savingAsFrom(fetcher.formData)}
        cancelHref="/app/discounts/order"
        onSave={save}
      />

      {formError && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading="Could not save discount"
        >
          <s-paragraph>{formError}</s-paragraph>
        </s-banner>
      )}

      <s-banner slot="supplemental-start" tone="info">
        <s-paragraph>
          Thresholds are compared against the cart subtotal, which is the value
          of the items before shipping and taxes.
        </s-paragraph>
      </s-banner>

      <TieredDiscountForm
        values={values}
        errors={errors}
        disabled={saving}
        currencyCode={currencyCode}
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
