import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useRouteError,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import {
  deleteTieredDiscount,
  getShopTimezoneOffsetMinutes,
  listTieredDiscounts,
  setTieredDiscountActive,
} from "../models/discounts.server";
import type {
  DiscountStatus,
  MutationResult,
  TieredDiscount,
} from "../models/discounts.server";
import { toDiscountGid, toDiscountNumericId } from "../lib/discount-id";
import { formatShopDate } from "../lib/shop-time";
import { summarizeTiers } from "../lib/tiers";

const CONFIRM_MODAL_ID = "confirm-discount-action";

const STATUS_LABELS: Record<DiscountStatus, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
};

const STATUS_TONES: Record<DiscountStatus, "success" | "info" | "neutral"> = {
  ACTIVE: "success",
  SCHEDULED: "info",
  EXPIRED: "neutral",
};

const TOAST_MESSAGES: Record<string, string> = {
  created: "Discount created",
  updated: "Discount updated",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const [offsetMinutes, discounts] = await Promise.all([
      getShopTimezoneOffsetMinutes(admin),
      listTieredDiscounts(admin),
    ]);

    return { discounts, offsetMinutes, error: null };
  } catch (error) {
    return {
      discounts: [] as TieredDiscount[],
      offsetMinutes: 0,
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong loading your discounts.",
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = toDiscountGid(String(formData.get("id") ?? ""));

  if (!id) {
    return { ok: false, message: "That discount could not be found." };
  }

  try {
    let result: MutationResult;
    let message: string;

    switch (intent) {
      case "activate":
        result = await setTieredDiscountActive(admin, id, true);
        message = "Discount activated";
        break;
      case "deactivate":
        result = await setTieredDiscountActive(admin, id, false);
        message = "Discount deactivated";
        break;
      case "delete":
        result = await deleteTieredDiscount(admin, id);
        message = "Discount deleted";
        break;
      default:
        return { ok: false, message: "That action is not supported." };
    }

    if (!result.ok) {
      return {
        ok: false,
        message: result.userErrors.map((error) => error.message).join(" "),
      };
    }

    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Something went wrong updating the discount.",
    };
  }
};

type PendingAction = {
  intent: "activate" | "delete";
  id: string;
  heading: string;
  body: string;
  confirmLabel: string;
  critical: boolean;
};

export default function DiscountsPage() {
  const { discounts, offsetMinutes, error } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();

  const [pending, setPending] = useState<PendingAction | null>(null);

  const toast = searchParams.get("toast");

  useEffect(() => {
    if (!toast) return;

    const message = TOAST_MESSAGES[toast];
    if (message) shopify.toast.show(message);

    setSearchParams({}, { replace: true });
  }, [toast, setSearchParams, shopify]);

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  const busy = fetcher.state !== "idle";
  const busyId = busy ? String(fetcher.formData?.get("id") ?? "") : null;
  const actionError =
    fetcher.data && !fetcher.data.ok ? fetcher.data.message : null;

  const run = (intent: string, numericId: string) => {
    fetcher.submit({ intent, id: numericId }, { method: "POST" });
  };

  const confirmPending = () => {
    if (!pending) return;

    run(pending.intent, pending.id);
    setPending(null);
  };

  const askActivate = (discount: TieredDiscount, numericId: string) => {
    setPending({
      intent: "activate",
      id: numericId,
      heading: "Activate this discount?",
      body:
        discount.status === "SCHEDULED"
          ? `${discount.title} is scheduled to start on ${formatShopDate(
              discount.startsAt,
              offsetMinutes,
            )}. Activating it now moves its start date to today.`
          : `${discount.title} has ended. Activating it clears its end date, so it runs until you stop it.`,
      confirmLabel: "Activate",
      critical: false,
    });
  };

  const askDelete = (discount: TieredDiscount, numericId: string) => {
    setPending({
      intent: "delete",
      id: numericId,
      heading: "Delete this discount?",
      body: `${discount.title} will be removed from your store and will stop applying at checkout. This cannot be undone.`,
      confirmLabel: "Delete",
      critical: true,
    });
  };

  return (
    <s-page heading="Tiered discounts">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/discounts/new"
      >
        Create discount
      </s-button>

      {error && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading="Could not load discounts"
        >
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      )}

      {actionError && (
        <s-banner
          slot="supplemental-start"
          tone="critical"
          heading="Could not update discount"
        >
          <s-paragraph>{actionError}</s-paragraph>
        </s-banner>
      )}

      {!error && discounts.length === 0 ? (
        <s-section>
          <s-empty-state heading="No tiered discounts yet">
            <s-text slot="subheading">
              Create a discount that takes more off the more items a customer
              adds to their cart.
            </s-text>
            <s-button
              slot="primary-action"
              variant="primary"
              href="/app/discounts/new"
            >
              Create discount
            </s-button>
          </s-empty-state>
        </s-section>
      ) : null}

      {discounts.length > 0 && (
        <s-section padding="none">
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Title</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="labeled">Tiers</s-table-header>
              <s-table-header listSlot="labeled">Starts</s-table-header>
              <s-table-header listSlot="labeled">Ends</s-table-header>
              <s-table-header listSlot="labeled">Actions</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {discounts.map((discount) => {
                const numericId = toDiscountNumericId(discount.id);
                const linkId = `discount-${numericId}`;
                const editable = discount.config.status === "ok";
                const rowBusy = busyId === numericId;

                return (
                  <s-table-row
                    key={discount.id}
                    {...(editable ? { clickDelegate: linkId } : {})}
                  >
                    <s-table-cell>
                      {editable ? (
                        <s-link id={linkId} href={`/app/discounts/${numericId}`}>
                          {discount.title}
                        </s-link>
                      ) : (
                        <s-text>{discount.title}</s-text>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      <s-badge tone={STATUS_TONES[discount.status]}>
                        {STATUS_LABELS[discount.status]}
                      </s-badge>
                    </s-table-cell>

                    <s-table-cell>
                      {discount.config.status === "ok" ? (
                        <s-text>{summarizeTiers(discount.config.tiers)}</s-text>
                      ) : (
                        <s-stack direction="block" gap="small-300">
                          <s-badge tone="warning">Not editable</s-badge>
                          <s-text color="subdued">
                            {discount.config.reason}
                          </s-text>
                        </s-stack>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      <s-text>
                        {formatShopDate(discount.startsAt, offsetMinutes)}
                      </s-text>
                    </s-table-cell>

                    <s-table-cell>
                      <s-text>
                        {discount.endsAt
                          ? formatShopDate(discount.endsAt, offsetMinutes)
                          : "No end date"}
                      </s-text>
                    </s-table-cell>

                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        {discount.status === "ACTIVE" ? (
                          <s-button
                            variant="tertiary"
                            {...(busy ? { disabled: true } : {})}
                            {...(rowBusy ? { loading: true } : {})}
                            onClick={() => run("deactivate", numericId)}
                          >
                            Deactivate
                          </s-button>
                        ) : (
                          <s-button
                            variant="tertiary"
                            commandFor={CONFIRM_MODAL_ID}
                            command="--show"
                            {...(busy ? { disabled: true } : {})}
                            {...(rowBusy ? { loading: true } : {})}
                            onClick={() => askActivate(discount, numericId)}
                          >
                            Activate
                          </s-button>
                        )}

                        <s-button
                          variant="tertiary"
                          tone="critical"
                          commandFor={CONFIRM_MODAL_ID}
                          command="--show"
                          {...(busy ? { disabled: true } : {})}
                          onClick={() => askDelete(discount, numericId)}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-modal id={CONFIRM_MODAL_ID} heading={pending?.heading ?? "Confirm"}>
        <s-paragraph>{pending?.body ?? ""}</s-paragraph>

        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor={CONFIRM_MODAL_ID}
          command="--hide"
          onClick={() => setPending(null)}
        >
          Cancel
        </s-button>

        <s-button
          slot="primary-action"
          variant="primary"
          tone={pending?.critical ? "critical" : "auto"}
          commandFor={CONFIRM_MODAL_ID}
          command="--hide"
          onClick={confirmPending}
        >
          {pending?.confirmLabel ?? "Confirm"}
        </s-button>
      </s-modal>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
