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
    `/app/discounts/quantity?toast=${result.draft ? "drafted" : "created"}`,
  );
};

export default function NewDiscountPage() {
  const { today, currencyCode } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [initialValues] = useState<DiscountFormValues>(() =>
    blankDiscountForm(today),
  );
  const [values, setValues] = useState<DiscountFormValues>(initialValues);
  // Leaving with changes asks first; see DiscountFormActions.
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
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
    <s-page heading="Create quantity based discount" inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/discounts/quantity">
        Quantity based discounts
      </s-link>

      <DiscountFormActions
        saving={saving}
        savingAs={savingAsFrom(fetcher.formData)}
        cancelHref="/app/discounts/quantity"
        onSave={save}
        dirty={dirty}
        onDiscard={() => {
          setValues(initialValues);
          setClientErrors({});
        }}
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
