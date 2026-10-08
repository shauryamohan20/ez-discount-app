import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  isRouteErrorResponse,
  redirect,
  useFetcher,
  useLoaderData,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { TieredDiscountForm } from "../components/TieredDiscountForm";
import {
  discountFormValuesFromFormData,
  emptyOrderTierRow,
  hasErrors,
  mapUserErrors,
  orderTierToRow,
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
  getShopCurrencyCode,
  getShopTimezoneOffsetMinutes,
  getTieredDiscount,
  updateTieredDiscount,
} from "../models/discounts.server";
import { toDiscountGid } from "../lib/discount-id";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const id = toDiscountGid(params.method, params.id);
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const [offsetMinutes, currencyCode, discount] = await Promise.all([
    getShopTimezoneOffsetMinutes(admin),
    getShopCurrencyCode(admin).catch(() => ""),
    getTieredDiscount(admin, id),
  ]);

  if (!discount) {
    throw new Response("Not found", { status: 404 });
  }

  const config = discount.config;

  // A discount cannot change type, so a quantity tier discount reached through
  // this tab belongs on the other one rather than being edited here with the
  // wrong fields.
  if (config.status === "ok" && config.type !== "order_threshold") {
    throw redirect(`/app/discounts/quantity/${params.method}/${params.id}`);
  }

  const orderTiers =
    config.status === "ok" && config.type === "order_threshold"
      ? config.tiers
      : [];

  const values: DiscountFormValues = {
    discountType: "order_threshold",
    method: discount.method,
    code: discount.code ?? "",
    usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
    appliesOncePerCustomer: discount.appliesOncePerCustomer,
    title: discount.title,
    startDate:
      shopIsoToCalendarDate(discount.startsAt, offsetMinutes) ||
      todayInShop(offsetMinutes),
    endDate: shopIsoToCalendarDate(discount.endsAt, offsetMinutes),
    combinesWithShipping: discount.combinesWithShipping,
    combinesWithOtherDiscounts: discount.combinesWithOtherDiscounts,
    appliesToType: "all",
    products: [],
    collections: [],
    customerEligibility:
      config.status === "ok" ? config.customerEligibility : "all",
    tiers: [],
    orderTiers: orderTiers.length
      ? orderTiers.map(orderTierToRow)
      : [emptyOrderTierRow()],
  };

  return {
    values,
    currencyCode,
    usageCount: discount.usageCount,
    unsupportedReason: config.status === "ok" ? null : config.reason,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const id = toDiscountGid(params.method, params.id);
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
    const {
      discountType,
      method,
      code,
      usageLimit,
      appliesOncePerCustomer,
      title,
      startDate,
      endDate,
      combinesWithShipping,
      combinesWithOtherDiscounts,
      appliesTo,
      customerEligibility,
      tiers,
      orderTiers,
    } = validation.value;

    const result = await updateTieredDiscount(admin, id, {
      discountType,
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
      combinesWithOtherDiscounts,
      appliesTo,
      customerEligibility,
      tiers,
      orderTiers,
    });

    if (!result.ok) {
      const { errors, unmapped } = mapUserErrors(result.userErrors);

      return {
        errors,
        formError: unmapped.length ? unmapped.join(" ") : null,
      };
    }

    return redirect("/app/discounts/order?toast=updated");
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

export default function EditOrderDiscountPage() {
  const {
    values: loadedValues,
    currencyCode,
    usageCount,
    unsupportedReason,
  } = useLoaderData<typeof loader>();
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
        discountType: values.discountType,
        method: values.method,
        code: values.code,
        usageLimit: values.usageLimit,
        appliesOncePerCustomer: String(values.appliesOncePerCustomer),
        title: values.title,
        startDate: values.startDate,
        endDate: values.endDate,
        combinesWithShipping: String(values.combinesWithShipping),
        combinesWithOtherDiscounts: String(values.combinesWithOtherDiscounts),
        appliesToType: values.appliesToType,
        customerEligibility: values.customerEligibility,
        products: JSON.stringify(values.products),
        collections: JSON.stringify(values.collections),
        tiers: JSON.stringify(values.tiers),
        orderTiers: JSON.stringify(values.orderTiers),
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Edit whole order discount">
      <s-link slot="breadcrumb-actions" href="/app/discounts/order">
        Whole order discounts
      </s-link>

      <s-button
        slot="primary-action"
        variant="primary"
        onClick={save}
        {...(saving ? { loading: true } : {})}
      >
        Save
      </s-button>

      <s-button slot="secondary-actions" href="/app/discounts/order">
        Cancel
      </s-button>

      {unsupportedReason && (
        <s-banner
          slot="supplemental-start"
          tone="warning"
          heading="These settings were not written by this version of the app"
        >
          <s-paragraph>
            {unsupportedReason} Saving replaces the settings on this discount
            with the thresholds below.
          </s-paragraph>
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
      <s-page heading="Discount not found">
        <s-link slot="breadcrumb-actions" href="/app/discounts/order">
          Whole order discounts
        </s-link>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-paragraph>
              This discount no longer exists, or it was not created by this app.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" href="/app/discounts/order">
                Back to whole order discounts
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
