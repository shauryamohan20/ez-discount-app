import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import type {
  BulkIntent,
  DiscountActionResult,
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
const BULK_MODAL_ID = "confirm-bulk-action";

/*
 * Boolean attributes on Polaris elements (checked, indeterminate, disabled)
 * are left out when false, never written as ={false}. The server renders
 * ={false} as checked="false", and Polaris reads any value as on, so every box
 * flashed ticked until the page finished loading.
 */

/** The bulk actions that ask first, and what they say. */
function bulkConfirmation(intent: BulkIntent, count: number) {
  const discounts = `${count} ${count === 1 ? "discount" : "discounts"}`;

  switch (intent) {
    case "bulk-publish":
      return {
        heading: `Publish ${discounts}?`,
        body: "Drafts are published on their own dates, and any whose end date has passed run again with no end date. A start date that has passed means they apply at checkout straight away.",
        confirmLabel: "Publish",
        critical: false,
      };
    case "bulk-draft":
      return {
        heading: `Move ${discounts} to drafts?`,
        body: "They stop applying at checkout straight away and keep their dates, so you can publish them again later.",
        confirmLabel: "Move to draft",
        critical: false,
      };
    default:
      return {
        heading: `Delete ${discounts}?`,
        body: "They are removed from your store and stop applying at checkout, and their codes stop working. This cannot be undone.",
        confirmLabel: "Delete",
        critical: true,
      };
  }
}

const STATUS_LABELS: Record<DiscountStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
};

const STATUS_TONES: Record<DiscountStatus, "success" | "caution"> = {
  ACTIVE: "success",
  DRAFT: "caution",
};

type RowActionResult = { ok: boolean; message: string } | undefined;

type PendingAction = {
  intent: "delete" | "publish";
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
 * Row and bulk actions are posted to the page that renders the table, so
 * that page's route must export an action that calls runDiscountRowAction.
 */
export function DiscountTable({
  discounts,
  offsetMinutes,
  heading,
  titles,
}: Props) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<RowActionResult>();
  const bulkFetcher = useFetcher<DiscountActionResult>();

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkIntent, setBulkIntent] = useState<BulkIntent | null>(null);

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  // A finished bulk action clears the selection. Partial failures are listed
  // in a banner instead of a toast, so they are not missed.
  useEffect(() => {
    const result = bulkFetcher.data;
    if (!result) return;

    if (result.ok) shopify.toast.show(result.message);
    setSelected(new Set());
  }, [bulkFetcher.data, shopify]);

  // Discounts that left the list, deleted for example, leave the selection.
  useEffect(() => {
    const ids = new Set(discounts.map((discount) => discount.id));
    setSelected((current) => {
      const kept = [...current].filter((id) => ids.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [discounts]);

  const bulkBusy = bulkFetcher.state !== "idle";
  const busy = fetcher.state !== "idle" || bulkBusy;
  const bulkError =
    bulkFetcher.data && !bulkFetcher.data.ok ? bulkFetcher.data : null;
  const busyIntent = bulkBusy
    ? String(bulkFetcher.formData?.get("intent") ?? "")
    : null;

  // A bulk action is off when it would not change some selected discount:
  // Move to draft with a draft selected, Publish with an active one selected.
  const selectedDiscounts = discounts.filter((discount) =>
    selected.has(discount.id),
  );
  const anyDraft = selectedDiscounts.some(
    (discount) => discount.status === "DRAFT",
  );
  const anyActive = selectedDiscounts.some(
    (discount) => discount.status === "ACTIVE",
  );
  const selectionNote =
    anyDraft && anyActive
      ? "Publish and Move to draft are off because the selection has both active discounts and drafts."
      : anyDraft
        ? "Move to draft is off because the selection has drafts."
        : anyActive
          ? "Publish is off because the selection has active discounts."
          : null;

  const allSelected =
    discounts.length > 0 &&
    discounts.every((discount) => selected.has(discount.id));
  const someSelected = !allSelected && selected.size > 0;

  const toggleAll = (checked: boolean) => {
    setSelected(
      checked ? new Set(discounts.map((discount) => discount.id)) : new Set(),
    );
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const runBulk = (intent: BulkIntent) => {
    bulkFetcher.submit(
      { intent, ids: JSON.stringify([...selected]) },
      { method: "POST" },
    );
  };

  const confirmBulk = () => {
    if (bulkIntent) runBulk(bulkIntent);
    setBulkIntent(null);
  };

  const bulkCopy = bulkIntent
    ? bulkConfirmation(bulkIntent, selected.size)
    : null;
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
      body: discount.parked
        ? `${discount.title} starts on ${starts}${ends}. If the start date has passed, it starts applying at checkout straight away.`
        : `${discount.title} ended on ${formatShopDate(discount.endsAt ?? "", offsetMinutes)}. Publishing clears its end date, so it applies at checkout until you move it back to draft.`,
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

      {bulkError && (
        <s-banner tone="critical" heading={bulkError.message}>
          <s-unordered-list>
            {(bulkError.failures ?? []).map((failure) => (
              <s-list-item key={failure.title}>
                {failure.title}: {failure.message}
              </s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      {/* Bulk edit: its own bar, directly above the list. */}
      <s-section padding="base" accessibilityLabel="Bulk edit">
        <s-stack
          direction="inline"
          gap="base"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">
              {selected.size > 0 ? `${selected.size} selected` : "Bulk edit"}
            </s-text>
            <s-text color="subdued">
              {selected.size === 0
                ? "Tick discounts to publish, move to draft or delete them together."
                : (selectionNote ?? "")}
            </s-text>
          </s-stack>

          <s-stack direction="inline" gap="small-200">
            <s-button
              commandFor={BULK_MODAL_ID}
              command="--show"
              {...(selected.size === 0 || anyActive || busy
                ? { disabled: true }
                : {})}
              {...(busyIntent === "bulk-publish" ? { loading: true } : {})}
              onClick={() => setBulkIntent("bulk-publish")}
            >
              Publish
            </s-button>
            <s-button
              commandFor={BULK_MODAL_ID}
              command="--show"
              {...(selected.size === 0 || anyDraft || busy
                ? { disabled: true }
                : {})}
              {...(busyIntent === "bulk-draft" ? { loading: true } : {})}
              onClick={() => setBulkIntent("bulk-draft")}
            >
              Move to draft
            </s-button>
            <s-button
              tone="critical"
              commandFor={BULK_MODAL_ID}
              command="--show"
              {...(selected.size === 0 || busy ? { disabled: true } : {})}
              {...(busyIntent === "bulk-delete" ? { loading: true } : {})}
              onClick={() => setBulkIntent("bulk-delete")}
            >
              Delete
            </s-button>
            {selected.size > 0 && (
              <s-button
                variant="tertiary"
                {...(busy ? { disabled: true } : {})}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section padding="none" {...(heading ? { heading } : {})}>
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-checkbox
                  accessibilityLabel="Select every discount in this list"
                  {...(allSelected ? { checked: true } : {})}
                  {...(someSelected ? { indeterminate: true } : {})}
                  {...(busy || discounts.length === 0
                    ? { disabled: true }
                    : {})}
                  onChange={(event) => toggleAll(event.currentTarget.checked)}
                />
                <s-text>Title</s-text>
              </s-stack>
            </s-table-header>
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
                    {/* Ticking the box selects the row; clicking anywhere
                        else on the row still opens the discount. A grid keeps a long
                        title wrapping beside the box, not under it. */}
                    <s-grid
                      gridTemplateColumns="auto 1fr"
                      gap="small"
                      alignItems="center"
                    >
                      <s-checkbox
                        accessibilityLabel={`Select ${discount.title}`}
                        {...(selected.has(discount.id)
                          ? { checked: true }
                          : {})}
                        {...(busy ? { disabled: true } : {})}
                        onChange={(event) =>
                          toggleOne(discount.id, event.currentTarget.checked)
                        }
                      />
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
                    </s-grid>
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
                            run("draft", numericId, discount.method)
                          }
                        >
                          Move to draft
                        </s-button>
                      ) : (
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

      <s-modal id={BULK_MODAL_ID} heading={bulkCopy?.heading ?? "Confirm"}>
        <s-paragraph>{bulkCopy?.body ?? ""}</s-paragraph>

        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor={BULK_MODAL_ID}
          command="--hide"
          onClick={() => setBulkIntent(null)}
        >
          Cancel
        </s-button>

        <s-button
          slot="primary-action"
          variant="primary"
          tone={bulkCopy?.critical ? "critical" : "auto"}
          commandFor={BULK_MODAL_ID}
          command="--hide"
          onClick={confirmBulk}
        >
          {bulkCopy?.confirmLabel ?? "Confirm"}
        </s-button>
      </s-modal>
    </>
  );
}
