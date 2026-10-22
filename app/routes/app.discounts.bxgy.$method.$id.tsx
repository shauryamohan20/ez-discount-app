import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  isRouteErrorResponse,
  useFetcher,
  useLoaderData,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  DiscountFormActions,
  savingAsFrom,
} from "../components/DiscountFormActions";
import { TieredDiscountForm } from "../components/TieredDiscountForm";
import { DiscountNotFound } from "../components/DiscountNotFound";
import { blankBxgyForm, bxgyToFormValues } from "../lib/bxgy-form";
import {
  blankDiscountForm,
  formValuesToSubmission,
  hasErrors,
  validateDiscountForm,
  type DiscountFormErrors,
  type DiscountFormValues,
} from "../lib/discount-form";
import { shopIsoToCalendarDate, todayInShop } from "../lib/shop-time";
import { discountTab, toDiscountGid } from "../lib/discount-id";
import {
  discountEditPath,
  getResourceTitles,
  getShopCurrencyCode,
  getShopTimezoneOffsetMinutes,
  getTieredDiscount,
} from "../models/discounts.server";
import { saveDiscountFromForm } from "../models/discount-save.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, redirect } = await authenticate.admin(request);

  const id = toDiscountGid(params.method, params.id);
  if (!id) throw new Response("Not found", { status: 404 });

  const [offsetMinutes, discount, currencyCode] = await Promise.all([
    getShopTimezoneOffsetMinutes(admin),
    getTieredDiscount(admin, id),
    getShopCurrencyCode(admin).catch(() => ""),
  ]);

  if (!discount) throw new Response("Not found", { status: 404 });

  // A discount cannot change type, so one of another kind reached through this
  // tab is sent to its own tab rather than overwritten with buy and get
  // settings.
  if (discountTab(discount) !== "bxgy") {
    throw redirect(discountEditPath(discount));
  }

  const config = discount.config;
  if (config.status !== "ok" || config.type !== "buy_x_get_y") {
    throw redirect(discountEditPath(discount));
  }

  // Titles are looked up now rather than stored, so a renamed product shows
  // its current name. One that was deleted reads "No longer available".
  const ids = [...config.bxgy.buyScope.ids, ...config.bxgy.getScope.ids];
  const titles = await getResourceTitles(admin, ids).catch(
    () => new Map<string, string>(),
  );

  const values: DiscountFormValues = {
    ...blankDiscountForm(
      shopIsoToCalendarDate(discount.startsAt, offsetMinutes) ||
        todayInShop(offsetMinutes),
      discount.method,
      "buy_x_get_y",
    ),
    code: discount.code ?? "",
    usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
    appliesOncePerCustomer: discount.appliesOncePerCustomer,
    title: discount.title,
    endDate: shopIsoToCalendarDate(discount.endsAt, offsetMinutes),
    combinesWithShipping: discount.combinesWithShipping,
    combinesWithOtherDiscounts: discount.combinesWithOtherDiscounts,
    customerEligibility: config.customerEligibility,
    bxgy: config.bxgy
      ? bxgyToFormValues(
          config.bxgy,
          (resourceId) => titles.get(resourceId) ?? "",
        )
      : blankBxgyForm(),
  };

  return {
    values,
    currencyCode,
    usageCount: discount.usageCount,
    isDraft: discount.status === "DRAFT",
    ended: discount.status === "DRAFT" && !discount.parked,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, redirect } = await authenticate.admin(request);

  const id = toDiscountGid(params.method, params.id);
  if (!id) throw new Response("Not found", { status: 404 });

  const result = await saveDiscountFromForm(
    admin,
    await request.formData(),
    id,
  );

  if (!result.ok) return result;

  return redirect(
    `/app/discounts/bxgy?toast=${result.draft ? "drafted" : "updated"}`,
  );
};

export default function EditBuyXGetYPage() {
  const {
    values: loadedValues,
    isDraft,
    ended,
    currencyCode,
    usageCount,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [values, setValues] = useState<DiscountFormValues>(loadedValues);
  const [clientErrors, setClientErrors] = useState<DiscountFormErrors>({});

  const saving = fetcher.state !== "idle";
  const serverResult = fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const errors = hasErrors(clientErrors)
    ? clientErrors
    : (serverResult?.errors ?? {});
  const formError = serverResult?.formError ?? null;

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
    <s-page heading="Edit Buy X Get Y discount" inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/discounts/bxgy">
        Buy X Get Y discounts
      </s-link>

      <DiscountFormActions
        saving={saving}
        savingAs={savingAsFrom(fetcher.formData)}
        isDraft={isDraft}
        ended={ended}
        cancelHref="/app/discounts/bxgy"
        onSave={save}
      />

      {values.method === "code" && usageCount > 0 && (
        <s-banner slot="supplemental-start" tone="info">
          <s-paragraph>
            This code has been used {usageCount}{" "}
            {usageCount === 1 ? "time" : "times"}. Shopify updates that count
            asynchronously, so it can lag a little behind.
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
        currencyCode={currencyCode}
        methodLocked
        onChange={setValues}
      />
    </s-page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <DiscountNotFound
        backHref="/app/discounts/bxgy"
        backLabel="Back to Buy X Get Y discounts"
      />
    );
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
