import { useEffect, useMemo, useState } from "react";

import type { DiscountFormValues } from "../lib/discount-form";
import {
  DEMO_SHOPPER_LABELS,
  formatMoney,
  isDemoShopper,
  runPreview,
  type DemoLine,
  type DemoShopper,
} from "../lib/preview";
import {
  buildPreview,
  explainBuyXGetY,
  explainCommonOptions,
  explainOrderThresholds,
  cartLineNotes,
  explainQuantityTiers,
} from "../lib/preview-explain";
import { DemoCart } from "./DemoCart";
import type { CustomerEligibility } from "../lib/tiers";

type Props = {
  values: DiscountFormValues;
  currencyCode: string;
};

function shopperQualifies(
  shopper: DemoShopper,
  rule: CustomerEligibility,
): boolean {
  switch (rule) {
    case "signedIn":
      return shopper !== "guest";
    case "firstOrder":
      return shopper === "newCustomer";
    case "returning":
      return shopper === "returning";
    default:
      return true;
  }
}

/**
 * The live preview beside the form. It runs the real Function on a demo cart
 * every time the form changes, and explains every option in plain words. It
 * sits in the right column of the form and stays in view while it scrolls.
 *
 * It renders only in the browser, never on the server. Its prices and dates
 * are written in the viewer's own format, which can differ from the server's.
 * Any difference in the first render makes React throw the server markup away
 * and rebuild the page, which leaves App Bridge's title bar buttons (Save,
 * Cancel) pointing at elements that no longer exist.
 */
export function DiscountPreviewPanel({ values, currencyCode }: Props) {
  // Quantities the merchant changed, by demo line. The cart itself is rebuilt
  // from the form, so picking other products keeps the changes that still fit.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [shopper, setShopper] = useState<DemoShopper>("guest");
  const [inBrowser, setInBrowser] = useState(false);

  useEffect(() => setInBrowser(true), []);

  const preview = useMemo(() => buildPreview(values), [values]);
  const lines = useMemo<DemoLine[]>(
    () =>
      preview.lines.map((line) => ({
        ...line,
        quantity: quantities[line.id] ?? line.quantity,
      })),
    [preview, quantities],
  );
  const result = useMemo(() => {
    if (!inBrowser) return null;

    // The preview must never take the form down with it.
    try {
      return runPreview({
        config: preview.config,
        discountClasses: preview.discountClasses,
        lines,
        shopper,
      });
    } catch (error) {
      console.error("Live preview failed", error);
      return null;
    }
  }, [inBrowser, preview, lines, shopper]);

  if (!result) return null;

  const money = (amount: number) => formatMoney(amount, currencyCode);
  const qualifies = shopperQualifies(shopper, values.customerEligibility);

  const changeQuantity = (line: DemoLine, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [line.id]: Math.max(0, Math.min(99, line.quantity + delta)),
    }));
  };

  const kindExplanations =
    values.discountType === "order_threshold"
      ? explainOrderThresholds(values, result.subtotal, currencyCode)
      : values.discountType === "buy_x_get_y"
        ? explainBuyXGetY(values, result)
        : explainQuantityTiers(values, lines);

  const explanations = [
    ...(qualifies
      ? []
      : [
          `The demo shopper (${DEMO_SHOPPER_LABELS[
            shopper
          ].toLowerCase()}) does not qualify, so nothing applies. Change the shopper to see the discount.`,
        ]),
    ...kindExplanations,
    ...explainCommonOptions(values),
  ];

  return (
    <div style={{ position: "sticky", top: "16px" }}>
      <s-section heading="Demo cart">
        <s-stack direction="block" gap="base">
          {/* Details on the left and the cart on the right when the panel is
              wide enough, one above the other when it is not. */}
          <s-query-container>
            <s-grid
              gridTemplateColumns="@container (inline-size > 640px) 1fr 1fr, 1fr"
              gap="base"
              alignItems="start"
            >
              <s-stack direction="block" gap="base">
                <s-paragraph color="subdued">
                  A demo cart, run through the same code Shopify uses at
                  checkout. Change quantities to try it. Prices are examples.
                </s-paragraph>

                <s-select
                  label="Shopper"
                  value={shopper}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    if (isDemoShopper(next)) setShopper(next);
                  }}
                >
                  {(Object.keys(DEMO_SHOPPER_LABELS) as DemoShopper[]).map(
                    (key) => (
                      <s-option key={key} value={key}>
                        {DEMO_SHOPPER_LABELS[key]}
                      </s-option>
                    ),
                  )}
                </s-select>

                <s-stack direction="inline">
                  <s-button
                    variant="secondary"
                    icon="reset"
                    {...(Object.keys(quantities).length === 0
                      ? { disabled: true }
                      : {})}
                    onClick={() => setQuantities({})}
                  >
                    Reset demo cart
                  </s-button>
                </s-stack>
              </s-stack>

              <DemoCart
                lines={lines}
                result={result}
                notes={cartLineNotes(
                  values,
                  lines,
                  result,
                  qualifies,
                  currencyCode,
                )}
                money={money}
                onQuantity={changeQuantity}
              />
            </s-grid>
          </s-query-container>

          <s-divider />

          <s-stack direction="block" gap="small-200">
            <s-heading>What happens</s-heading>
            <s-unordered-list>
              {explanations.map((text) => (
                <s-list-item key={text}>{text}</s-list-item>
              ))}
            </s-unordered-list>
          </s-stack>
        </s-stack>
      </s-section>
    </div>
  );
}
