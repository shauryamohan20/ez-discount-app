import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  // The whole panel fits on screen at any screen size, without scrolling
  // inside it: when its content is taller than the space, CSS zoom shrinks
  // it evenly and lets it re-flow to fill the panel's width, and it stays
  // full size when there is room. The space runs from where the panel rests
  // at the top of the page to the bottom of the screen; below the form on
  // narrow screens it can rest far down, so that distance counts for at most
  // 120px.
  //
  // Polaris finishes redrawing its elements a moment after a size change, so
  // each round waits for drawing to settle before measuring. Fitting runs on
  // load, on resize and when the content changes, never in response to its
  // own zoom, and starts from the current zoom so the panel does not flash.
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fitRun = useRef(0);
  const restingTop = useRef<number | null>(null);

  const fitPanel = useCallback(() => {
    const run = ++fitRun.current;
    const settled = () =>
      new Promise<boolean>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(run === fitRun.current)),
        ),
      );

    void (async () => {
      if (!(await settled())) return;

      const panel = panelRef.current;
      const content = contentRef.current;
      if (!panel || !content) return;

      if (restingTop.current === null || window.scrollY === 0) {
        const top = panel.getBoundingClientRect().top;
        restingTop.current = Math.min(Math.max(top, 16), 120);
      }
      // 16px clear below the panel, plus 8px so rounding never tips it over.
      const available = Math.max(
        200,
        window.innerHeight - restingTop.current - 24,
      );

      const setZoom = (zoom: number) => {
        content.style.zoom = zoom >= 1 ? "" : String(zoom);
      };

      const height = () => content.getBoundingClientRect().height;

      // Nothing to do while the current zoom fits and leaves little room.
      const current = Number(content.style.zoom || 1);
      const now = height();
      if (now <= available + 1 && (current >= 1 || now >= available * 0.97)) {
        return;
      }

      // Zooming can switch the panel between one and two columns, so the
      // height jumps rather than changing smoothly. A search, measuring once
      // drawing settles at each step, finds the largest zoom that fits.
      const fitsAt = async (zoom: number) => {
        setZoom(zoom);
        if (!(await settled())) return null;
        return height() <= available + 1;
      };

      const fullSize = await fitsAt(1);
      if (fullSize !== false) return;

      let low = 0.4;
      let high = 1;
      for (let round = 0; round < 7; round++) {
        const middle = (low + high) / 2;
        const fits = await fitsAt(middle);
        if (fits === null) return;
        if (fits) low = middle;
        else high = middle;
      }

      setZoom(low);
      if (!(await settled())) return;

      // Never leave it taller than the space, whatever drawing settled on.
      const final = height();
      if (final > available + 1) {
        setZoom(Math.max(0.4, low * (available / final) - 0.005));
      }
    })();
  }, []);

  useEffect(() => {
    if (!inBrowser) return;

    window.addEventListener("resize", fitPanel);
    return () => {
      fitRun.current += 1;
      window.removeEventListener("resize", fitPanel);
    };
  }, [inBrowser, fitPanel]);

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

  // Refit whenever what the panel shows changes.
  useEffect(() => {
    if (result) fitPanel();
  }, [result, values, fitPanel]);

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
    <div
      ref={panelRef}
      style={{ position: "sticky", top: "16px", overflow: "hidden" }}
    >
      <div ref={contentRef}>
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
                  )}
                  money={money}
                  onQuantity={changeQuantity}
                />
              </s-grid>
            </s-query-container>
          </s-stack>
        </s-section>
      </div>
    </div>
  );
}
