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
  emptyTierRow,
  hasErrors,
  mapUserErrors,
  tierToRow,
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
  getResourceTitles,
  getShopTimezoneOffsetMinutes,
  getTieredDiscount,
  updateTieredDiscount,
} from "../models/discounts.server";
import { ALL_PRODUCTS } from "../lib/tiers";
import { toDiscountGid } from "../lib/discount-id";

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
  const appliesTo = config.status === "ok" ? config.appliesTo : ALL_PRODUCTS;

  const resourceIds =
    appliesTo.type === "products"
      ? appliesTo.productIds
      : appliesTo.type === "collections"
        ? appliesTo.collectionIds
        : [];

  const titles = await getResourceTitles(admin, resourceIds);
  const resources = resourceIds.map((id) => ({
    id,
    title: titles.get(id) ?? "No longer available",
  }));

  const values: DiscountFormValues = {
    title: discount.title,
    startDate:
      shopIsoToCalendarDate(discount.startsAt, offsetMinutes) ||
      todayInShop(offsetMinutes),
    endDate: shopIsoToCalendarDate(discount.endsAt, offsetMinutes),
    combinesWithShipping: discount.combinesWithShipping,
    appliesToType: appliesTo.type,
    products: appliesTo.type === "products" ? resources : [],
    collections: appliesTo.type === "collections" ? resources : [],
    customerEligibility:
      config.status === "ok" ? config.customerEligibility : "all",
    tiers:
      config.status === "ok" ? config.tiers.map(tierToRow) : [emptyTierRow()],
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
    const {
      title,
      startDate,
      endDate,
      combinesWithShipping,
      appliesTo,
      customerEligibility,
      tiers,
    } = validation.value;

    const result = await updateTieredDiscount(admin, id, {
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
    <s-page heading="Edit quantity based discount">
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
  const error = useRouteError();

  // A deleted discount, or an ID that belongs to something else, should read
  // as a dead end rather than as a crash. Everything else, including the
  // responses Shopify throws during authentication, goes to their boundary.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <s-page heading="Discount not found">
        <s-link slot="breadcrumb-actions" href="/app/discounts">
          Discounts
        </s-link>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-paragraph>
              This discount no longer exists, or it was not created by this app.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" href="/app/discounts">
                Back to discounts
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
