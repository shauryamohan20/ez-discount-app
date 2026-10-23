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
import { useScrollToFirstError } from "../components/useScrollToFirstError";
import { saveDiscountFromForm } from "../models/discount-save.server";
import { blankBxgyForm } from "../lib/bxgy-form";
import { DiscountNotFound } from "../components/DiscountNotFound";
import {
  formValuesToSubmission,
  emptyTierRow,
  hasErrors,
  tierToRow,
  validateDiscountForm,
  type DiscountFormErrors,
  type DiscountFormValues,
  scheduleToFormValues,
} from "../lib/discount-form";
import { shopIsoToCalendarDate, todayInShop } from "../lib/shop-time";
import {
  getResourceDetails,
  getShopCurrencyCode,
  discountEditPath,
  getShopTimezoneOffsetMinutes,
  getTieredDiscount,
} from "../models/discounts.server";
import { ALL_PRODUCTS } from "../lib/tiers";
import { discountTab, toDiscountGid } from "../lib/discount-id";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, redirect } = await authenticate.admin(request);

  const id = toDiscountGid(params.method, params.id);
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const [offsetMinutes, discount, currencyCode] = await Promise.all([
    getShopTimezoneOffsetMinutes(admin),
    getTieredDiscount(admin, id),
    getShopCurrencyCode(admin).catch(() => ""),
  ]);

  if (!discount) {
    throw new Response("Not found", { status: 404 });
  }

  const config = discount.config;

  // A discount cannot change type, so one of another kind reached through this
  // tab is sent to its own tab. Editing it here would show the wrong fields,
  // and saving would overwrite its settings with quantity tiers.
  if (discountTab(discount) !== "quantity") {
    throw redirect(discountEditPath(discount));
  }

  const appliesTo = config.status === "ok" ? config.appliesTo : ALL_PRODUCTS;

  const resourceIds =
    appliesTo.type === "products"
      ? appliesTo.productIds
      : appliesTo.type === "collections"
        ? appliesTo.collectionIds
        : [];

  const details = await getResourceDetails(admin, resourceIds);
  const resources = resourceIds.map((id) => ({
    id,
    title: details.get(id)?.title ?? "No longer available",
    image: details.get(id)?.image ?? null,
  }));

  const quantityTiers =
    config.status === "ok" && config.type === "quantity_tiers"
      ? config.tiers
      : [];

  const values: DiscountFormValues = {
    // Unused by this kind of discount, but every form carries one.
    bxgy: blankBxgyForm(),
    discountType: "quantity_tiers",
    orderTiers: [],
    maxDiscountAmount: "",
    ...scheduleToFormValues(config.status === "ok" ? config.schedule : null),
    combinesWithOtherDiscounts: discount.combinesWithOtherDiscounts,
    title: discount.title,
    startDate:
      shopIsoToCalendarDate(discount.startsAt, offsetMinutes) ||
      todayInShop(offsetMinutes),
    endDate: shopIsoToCalendarDate(discount.endsAt, offsetMinutes),
    method: discount.method,
    code: discount.code ?? "",
    usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
    appliesOncePerCustomer: discount.appliesOncePerCustomer,
    combinesWithShipping: discount.combinesWithShipping,
    appliesToType: appliesTo.type,
    products: appliesTo.type === "products" ? resources : [],
    collections: appliesTo.type === "collections" ? resources : [],
    customerEligibility:
      config.status === "ok" ? config.customerEligibility : "all",
    tiers: quantityTiers.length
      ? quantityTiers.map(tierToRow)
      : [emptyTierRow()],
  };

  return {
    values,
    isDraft: discount.status === "DRAFT",
    ended: discount.status === "DRAFT" && !discount.parked,
    currencyCode,
    usageCount: discount.usageCount,
    unsupportedReason: config.status === "ok" ? null : config.reason,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, redirect } = await authenticate.admin(request);

  const id = toDiscountGid(params.method, params.id);
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const result = await saveDiscountFromForm(
    admin,
    await request.formData(),
    id,
  );

  if (!result.ok) return result;

  return redirect(
    `/app/discounts/quantity?toast=${result.draft ? "drafted" : "updated"}`,
  );
};

export default function EditDiscountPage() {
  const {
    values: loadedValues,
    isDraft,
    ended,
    currencyCode,
    usageCount,
    unsupportedReason,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const initialValues = loadedValues;
  const [values, setValues] = useState<DiscountFormValues>(loadedValues);
  // Leaving with changes asks first; see DiscountFormActions.
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  const [clientErrors, setClientErrors] = useState<DiscountFormErrors>({});

  const saving = fetcher.state !== "idle";
  const errors = hasErrors(clientErrors)
    ? clientErrors
    : (fetcher.data?.errors ?? {});
  const formError = fetcher.data?.formError ?? null;
  useScrollToFirstError(errors, formError);

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
    <s-page heading="Edit quantity based discount" inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/discounts/quantity">
        Quantity based discounts
      </s-link>

      <DiscountFormActions
        saving={saving}
        savingAs={savingAsFrom(fetcher.formData)}
        isDraft={isDraft}
        ended={ended}
        cancelHref="/app/discounts/quantity"
        onSave={save}
        dirty={dirty}
        onDiscard={() => {
          setValues(initialValues);
          setClientErrors({});
        }}
      />

      {unsupportedReason && (
        <s-banner
          slot="supplemental-start"
          tone="warning"
          heading="These settings were not written by this version of the app"
        >
          <s-paragraph>
            {unsupportedReason} Saving replaces the settings on this discount
            with the tiers below.
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

      {values.method === "code" && usageCount > 0 && (
        <s-banner slot="supplemental-start" tone="info">
          <s-paragraph>
            This code has been used {usageCount}{" "}
            {usageCount === 1 ? "time" : "times"}. Shopify updates that count
            asynchronously, so it can lag a little behind.
          </s-paragraph>
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

  // A deleted discount, or an ID that belongs to something else, should read
  // as a dead end rather than as a crash. Everything else, including the
  // responses Shopify throws during authentication, goes to their boundary.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <DiscountNotFound
        backHref="/app/discounts/quantity"
        backLabel="Back to quantity based discounts"
      />
    );
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
