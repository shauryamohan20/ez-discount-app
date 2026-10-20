import { useMemo, useState } from "react";

import type { DiscountFormValues } from "../lib/discount-form";
import {
  DEMO_SHIPPING,
  DEMO_SHOPPER_LABELS,
  formatMoney,
  isDemoShopper,
  runPreview,
  type DemoLine,
  type DemoShopper,
} from "../lib/preview";
import {
  buildPreviewConfig,
  explainCommonOptions,
  explainOrderThresholds,
} from "../lib/preview-explain";
import type { CustomerEligibility } from "../lib/tiers";

type Props = {
  values: DiscountFormValues;
  currencyCode: string;
};

/** A cart with no product targeting: three example items. */
function wholeOrderCart(): DemoLine[] {
  const line = (
    id: string,
    title: string,
    unitPrice: number,
    quantity: number,
  ) => ({
    id: `gid://shopify/CartLine/${id}`,
    title,
    unitPrice,
    quantity,
    productId: `gid://shopify/Product/demo-${id}`,
    inSelectedCollection: false,
    inBuyCollection: false,
    inGetCollection: false,
  });

  return [
    line("1", "Demo T-shirt", 20, 2),
    line("2", "Demo hoodie", 45, 1),
    line("3", "Demo cap", 15, 0),
  ];
}

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
 * sits in the page's aside column and stays in view while the form scrolls.
 */
export function DiscountPreviewPanel({ values, currencyCode }: Props) {
  const [lines, setLines] = useState<DemoLine[]>(wholeOrderCart);
  const [shopper, setShopper] = useState<DemoShopper>("guest");

  const preview = useMemo(() => buildPreviewConfig(values), [values]);
  const result = useMemo(
    () =>
      preview
        ? runPreview({
            config: preview.config,
            discountClasses: preview.discountClasses,
            lines,
            shopper,
          })
        : null,
    [preview, lines, shopper],
  );

  if (!preview || !result) return null;

  const money = (amount: number) => formatMoney(amount, currencyCode);
  const qualifies = shopperQualifies(shopper, values.customerEligibility);

  const changeQuantity = (id: string, delta: number) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id
          ? {
              ...line,
              quantity: Math.max(0, Math.min(99, line.quantity + delta)),
            }
          : line,
      ),
    );
  };

  const totalDiscount =
    result.productDiscount + result.orderDiscount + result.shippingDiscount;

  const explanations = [
    ...(qualifies
      ? []
      : [
          `The demo shopper (${DEMO_SHOPPER_LABELS[
            shopper
          ].toLowerCase()}) does not qualify, so nothing applies. Change the shopper to see the discount.`,
        ]),
    ...explainOrderThresholds(values, result.subtotal, currencyCode),
    ...explainCommonOptions(values),
  ];

  return (
    <div slot="aside" style={{ position: "sticky", top: "16px" }}>
      <s-section heading="Live preview">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            A demo cart, run through the same code Shopify uses at checkout.
            Change quantities to try it. Prices are examples.
          </s-paragraph>

          <s-select
            label="Shopper"
            value={shopper}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isDemoShopper(next)) setShopper(next);
            }}
          >
            {(Object.keys(DEMO_SHOPPER_LABELS) as DemoShopper[]).map((key) => (
              <s-option key={key} value={key}>
                {DEMO_SHOPPER_LABELS[key]}
              </s-option>
            ))}
          </s-select>

          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              {lines.map((line) => {
                const shown = result.lines.find(
                  (entry) => entry.id === line.id,
                );

                return (
                  <s-grid
                    key={line.id}
                    gridTemplateColumns="1fr auto"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-stack direction="block">
                      <s-text>{line.title}</s-text>
                      <s-text color="subdued">
                        {money(line.unitPrice)} each
                      </s-text>
                      {shown && shown.discount > 0 && (
                        <s-text tone="success">
                          {shown.message ?? "Discount"}: -
                          {money(shown.discount)}
                        </s-text>
                      )}
                    </s-stack>
                    <s-stack
                      direction="inline"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-button
                        variant="tertiary"
                        icon="minus"
                        accessibilityLabel={`One less ${line.title}`}
                        {...(line.quantity === 0 ? { disabled: true } : {})}
                        onClick={() => changeQuantity(line.id, -1)}
                      />
                      <s-text>{line.quantity}</s-text>
                      <s-button
                        variant="tertiary"
                        icon="plus"
                        accessibilityLabel={`One more ${line.title}`}
                        onClick={() => changeQuantity(line.id, 1)}
                      />
                    </s-stack>
                  </s-grid>
                );
              })}

              <s-divider />

              <s-grid gridTemplateColumns="1fr auto" gap="small-200">
                <s-text>Subtotal</s-text>
                <s-text>{money(result.subtotal)}</s-text>

                {result.productDiscount > 0 && (
                  <>
                    <s-text tone="success">Product discounts</s-text>
                    <s-text tone="success">
                      -{money(result.productDiscount)}
                    </s-text>
                  </>
                )}

                {result.orderDiscount > 0 && (
                  <>
                    <s-text tone="success">
                      {result.orderMessage ?? "Order discount"}
                    </s-text>
                    <s-text tone="success">
                      -{money(result.orderDiscount)}
                    </s-text>
                  </>
                )}

                <s-text>{DEMO_SHIPPING.title}</s-text>
                {result.shippingPrice === 0 ? (
                  <s-text color="subdued">Empty cart</s-text>
                ) : result.shippingDiscount >= result.shippingPrice ? (
                  <s-stack direction="inline" gap="small-200">
                    <s-text color="subdued">
                      <s>{money(result.shippingPrice)}</s>
                    </s-text>
                    <s-text tone="success">Free</s-text>
                  </s-stack>
                ) : (
                  <s-text>
                    {money(result.shippingPrice - result.shippingDiscount)}
                  </s-text>
                )}

                <s-text type="strong">Total</s-text>
                <s-text type="strong">{money(result.total)}</s-text>
              </s-grid>

              {totalDiscount > 0 && (
                <s-badge tone="success">
                  Customer saves {money(totalDiscount)}
                </s-badge>
              )}
            </s-stack>
          </s-box>

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
