import { useEffect, useState, type ReactNode } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import type { DiscountStatus, TieredDiscount } from "../models/discounts.server";
import { discountPath, toDiscountNumericId } from "../lib/discount-id";
import { formatShopDate } from "../lib/shop-time";

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

type RowActionResult = { ok: boolean; message: string } | undefined;

type Props = {
  heading: string;
  discounts: TieredDiscount[];
  offsetMinutes: number;
  error: string | null;
  /** Where the Create button and the empty state point. */
  newHref: string;
  emptyHeading: string;
  emptySubheading: string;
  /** Per type, because a quantity tier and a threshold read nothing alike. */
  renderSummary: (discount: TieredDiscount) => ReactNode;
  summaryHeader: string;
  /** Rendered above the table, for example a currency note. */
  note?: ReactNode;
};

type PendingAction = {
  intent: "activate" | "delete";
  id: string;
  method: string;
  heading: string;
  body: string;
  confirmLabel: string;
  critical: boolean;
};

export function DiscountList({
  heading,
  discounts,
  offsetMinutes,
  error,
  newHref,
  emptyHeading,
  emptySubheading,
  renderSummary,
  summaryHeader,
  note,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();
  const fetcher = useFetcher<RowActionResult>();

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

  const run = (intent: string, numericId: string, method: string) => {
    fetcher.submit({ intent, id: numericId, method }, { method: "POST" });
  };

  const confirmPending = () => {
    if (!pending) return;

    run(pending.intent, pending.id, pending.method);
    setPending(null);
  };

  const askActivate = (discount: TieredDiscount, numericId: string) => {
    setPending({
      intent: "activate",
      id: numericId,
      method: discount.method,
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
      method: discount.method,
      heading: "Delete this discount?",
      body:
        discount.method === "code"
          ? `${discount.title} will be removed from your store, and the code ${discount.code} will stop working at checkout. This cannot be undone.`
          : `${discount.title} will be removed from your store and will stop applying at checkout. This cannot be undone.`,
      confirmLabel: "Delete",
      critical: true,
    });
  };

  return (
    <s-page heading={heading}>
      <s-button slot="primary-action" variant="primary" href={newHref}>
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

      {note}

      {!error && discounts.length === 0 ? (
        <s-section>
          <s-empty-state heading={emptyHeading}>
            <s-text slot="subheading">{emptySubheading}</s-text>
            <s-button slot="primary-action" variant="primary" href={newHref}>
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
              <s-table-header listSlot="labeled">Method</s-table-header>
              <s-table-header listSlot="labeled">{summaryHeader}</s-table-header>
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
                        <s-link
                          id={linkId}
                          href={discountPath(discount.method, discount.id)}
                        >
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
                      {discount.method === "code" ? (
                        <s-stack direction="block" gap="small-500">
                          <s-text>{discount.code}</s-text>
                          <s-text color="subdued">
                            {discount.usageLimit === null
                              ? `${discount.usageCount} used`
                              : `${discount.usageCount} of ${discount.usageLimit} used`}
                          </s-text>
                        </s-stack>
                      ) : (
                        <s-text>Automatic</s-text>
                      )}
                    </s-table-cell>

                    <s-table-cell>{renderSummary(discount)}</s-table-cell>

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
                            onClick={() =>
                              run("deactivate", numericId, discount.method)
                            }
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
