import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import type {
  DiscountStatus,
  TieredDiscount,
} from "../models/discounts.server";
import {
  discountPath,
  discountTab,
  toDiscountNumericId,
} from "../lib/discount-id";
import { formatShopDate } from "../lib/shop-time";
import { DiscountSummary } from "./DiscountSummary";

const CONFIRM_MODAL_ID = "confirm-discount-action";

const STATUS_LABELS: Record<DiscountStatus, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  DRAFT: "Draft",
};

const STATUS_TONES: Record<
  DiscountStatus,
  "success" | "info" | "neutral" | "caution"
> = {
  ACTIVE: "success",
  SCHEDULED: "info",
  EXPIRED: "neutral",
  DRAFT: "caution",
};

type RowActionResult = { ok: boolean; message: string } | undefined;

type PendingAction = {
  intent: "activate" | "delete" | "publish";
  id: string;
  method: string;
  heading: string;
  body: string;
  confirmLabel: string;
  critical: boolean;
};

type Props = {
  discounts: TieredDiscount[];
  offsetMinutes: number;
  /** Shown above the table, for pages where it sits under other content. */
  heading?: string;
  /** Product and collection titles by ID, for the What it does column. */
  titles?: Record<string, string>;
};

/**
 * The table every page that lists discounts uses: each kind's own tab, and
 * the home page's list of every discount. The columns are the same for every
 * kind, and each row links to its own kind's edit page, so one table can mix
 * kinds.
 *
 * Row actions are posted to the page that renders the table, so that page's
 * route must export an action that calls runDiscountRowAction.
 */
export function DiscountTable({
  discounts,
  offsetMinutes,
  heading,
  titles,
}: Props) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<RowActionResult>();

  const [pending, setPending] = useState<PendingAction | null>(null);

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

  const askPublish = (discount: TieredDiscount, numericId: string) => {
    const starts = formatShopDate(discount.startsAt, offsetMinutes);
    const ends = discount.endsAt
      ? ` and ends on ${formatShopDate(discount.endsAt, offsetMinutes)}`
      : ", with no end date";

    setPending({
      intent: "publish",
      id: numericId,
      method: discount.method,
      heading: "Publish this draft?",
      body: `${discount.title} starts on ${starts}${ends}. If the start date has passed, it starts applying at checkout straight away.`,
      confirmLabel: "Publish",
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
    <>
      {actionError && (
        <s-banner tone="critical" heading="Could not update discount">
          <s-paragraph>{actionError}</s-paragraph>
        </s-banner>
      )}

      <s-section padding="none" {...(heading ? { heading } : {})}>
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Title</s-table-header>
            <s-table-header listSlot="inline">Status</s-table-header>
            <s-table-header listSlot="labeled">Code / Automatic</s-table-header>
            <s-table-header listSlot="labeled">What it does</s-table-header>
            <s-table-header listSlot="labeled">
              Start and end date
            </s-table-header>
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
                        href={discountPath(
                          discountTab(discount),
                          discount.method,
                          discount.id,
                        )}
                      >
                        {discount.title}
                      </s-link>
                    ) : (
                      <s-text>{discount.title}</s-text>
                    )}
                  </s-table-cell>

                  <s-table-cell>
                    <s-badge
                      tone={STATUS_TONES[discount.status]}
                      {...(discount.status === "DRAFT" ? { icon: "edit" } : {})}
                    >
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

                  <s-table-cell>
                    <DiscountSummary discount={discount} titles={titles} />
                  </s-table-cell>

                  <s-table-cell>
                    <s-stack direction="block" gap="small-500">
                      <s-text>
                        Starts{" "}
                        {formatShopDate(discount.startsAt, offsetMinutes)}
                      </s-text>
                      <s-text color="subdued">
                        {discount.endsAt
                          ? `Ends ${formatShopDate(discount.endsAt, offsetMinutes)}`
                          : "No end date"}
                      </s-text>
                    </s-stack>
                  </s-table-cell>

                  <s-table-cell>
                    {/* One action per line, so the two never read as one. */}
                    <s-stack
                      direction="block"
                      gap="small-200"
                      alignItems="start"
                    >
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
                      ) : discount.status === "DRAFT" ? (
                        <s-button
                          variant="tertiary"
                          commandFor={CONFIRM_MODAL_ID}
                          command="--show"
                          {...(busy ? { disabled: true } : {})}
                          {...(rowBusy ? { loading: true } : {})}
                          onClick={() => askPublish(discount, numericId)}
                        >
                          Publish
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
    </>
  );
}
