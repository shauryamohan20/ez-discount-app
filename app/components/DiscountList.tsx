import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import type { TieredDiscount } from "../models/discounts.server";
import { DiscountTable } from "./DiscountTable";

const TOAST_MESSAGES: Record<string, string> = {
  created: "Discount created",
  updated: "Discount updated",
};

type Props = {
  heading: string;
  discounts: TieredDiscount[];
  offsetMinutes: number;
  error: string | null;
  /** Where the Create button and the empty state point. */
  newHref: string;
  emptyHeading: string;
  emptySubheading: string;
  /** Rendered above the table, for example a currency note. */
  note?: ReactNode;
};

/**
 * The page for one kind of discount. Every kind uses it, so every kind gets
 * the same full width table, empty state and messages.
 */
export function DiscountList({
  heading,
  discounts,
  offsetMinutes,
  error,
  newHref,
  emptyHeading,
  emptySubheading,
  note,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();

  // Create and edit redirect here with ?toast=created or ?toast=updated.
  const toast = searchParams.get("toast");

  useEffect(() => {
    if (!toast) return;

    const message = TOAST_MESSAGES[toast];
    if (message) shopify.toast.show(message);

    setSearchParams({}, { replace: true });
  }, [toast, setSearchParams, shopify]);

  return (
    // Full width, so the table uses all the space the admin gives the app.
    <s-page heading={heading} inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app">
        EZ Discounts
      </s-link>

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
        <DiscountTable discounts={discounts} offsetMinutes={offsetMinutes} />
      )}
    </s-page>
  );
}
