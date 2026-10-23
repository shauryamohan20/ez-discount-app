import { useEffect, useMemo, useState } from "react";

import type { DiscountFormValues } from "../lib/discount-form";
import {
  DEMO_SHOPPER_LABELS,
  demoClock,
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
import { isWithinSchedule } from "../../extensions/tiered-discount/src/shared";
import {
  DAY_FULL_NAMES,
  SCHEDULE_TIME_OPTIONS,
  WEEK_ORDER,
  formatScheduleTime,
  type CustomerEligibility,
} from "../lib/tiers";

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
  // The demo day (0 is Sunday) and time the Function sees. Null follows the
  // schedule: its first day and its start time, so the discount shows as
  // running until the merchant picks another moment.
  const [demoDay, setDemoDay] = useState<number | null>(null);
  const [demoTime, setDemoTime] = useState<string | null>(null);
  const [inBrowser, setInBrowser] = useState(false);

  useEffect(() => setInBrowser(true), []);

  const preview = useMemo(() => buildPreview(values), [values]);
  const schedule = preview.schedule;
  const day =
    demoDay ??
    WEEK_ORDER.find((weekday) => schedule?.days.includes(weekday) ?? true) ??
    1;
  const time = demoTime ?? schedule?.startTime ?? "12:00";
  const clock = useMemo(
    () =>
      demoClock(
        day,
        time,
        schedule?.startTime ?? null,
        schedule?.endTime ?? null,
      ),
    [day, time, schedule],
  );
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
        clock,
      });
    } catch (error) {
      console.error("Live preview failed", error);
      return null;
    }
  }, [inBrowser, preview, lines, shopper, clock]);

  if (!result) return null;

  const money = (amount: number) => formatMoney(amount, currencyCode);
  const qualifies = shopperQualifies(shopper, values.customerEligibility);
  // The Function's own rule, so the preview cannot disagree with checkout.
  const running = isWithinSchedule(schedule, clock);

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
    ...(running
      ? []
      : [
          `On ${DAY_FULL_NAMES[day]} at ${formatScheduleTime(time)} the discount is outside its days and hours, so nothing applies. Change the demo day or time to see it.`,
        ]),
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
    // Sticks 16px from the top while the form scrolls. Shown at its normal
    // size; when it is taller than the screen, the page scrolls to the rest.
    <div style={{ position: "sticky", top: "16px" }}>
      <s-section heading="Demo cart">
        <s-stack direction="block" gap="base">
          {/* Details and What happens on the left, the cart on the right, when the panel is
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

                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                  <s-select
                    label="Day"
                    value={String(day)}
                    onChange={(event) =>
                      setDemoDay(Number(event.currentTarget.value))
                    }
                  >
                    {WEEK_ORDER.map((weekday) => (
                      <s-option key={weekday} value={String(weekday)}>
                        {DAY_FULL_NAMES[weekday]}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label="Time"
                    value={time}
                    onChange={(event) => setDemoTime(event.currentTarget.value)}
                  >
                    {SCHEDULE_TIME_OPTIONS.map((option) => (
                      <s-option key={option} value={option}>
                        {formatScheduleTime(option)}
                      </s-option>
                    ))}
                  </s-select>
                </s-grid>

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

                {/* Under the details, beside the cart, so the panel uses
                      the space next to the cart instead of growing taller. */}
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

              <DemoCart
                lines={lines}
                result={result}
                notes={cartLineNotes(
                  values,
                  lines,
                  result,
                  qualifies,
                  currencyCode,
                  running,
                )}
                money={money}
                onQuantity={changeQuantity}
              />
            </s-grid>
          </s-query-container>
        </s-stack>
      </s-section>
    </div>
  );
}
