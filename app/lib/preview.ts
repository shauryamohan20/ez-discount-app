/**
 * The live preview runs the real Function code, the same files Shopify runs at
 * checkout, against a demo cart in the browser. Nothing here decides who gets
 * what; it only builds the Function's input and reads its output back as
 * money, so the preview cannot disagree with checkout.
 *
 * The Function imports its generated types and enums from
 * extensions/tiered-discount/generated/api.ts, which is committed for this
 * reason. Regenerate it whenever a Function .graphql file changes.
 */
import { cartDeliveryOptionsDiscountsGenerateRun } from "../../extensions/tiered-discount/src/cart_delivery_options_discounts_generate_run";
import { cartLinesDiscountsGenerateRun } from "../../extensions/tiered-discount/src/cart_lines_discounts_generate_run";
import type {
  CartInput,
  CartOperation,
  DeliveryInput,
  DeliveryOperation,
  DiscountClass,
} from "../../extensions/tiered-discount/generated/api";
import type { ShopifyDiscountClass } from "./tiers";

/** One line of the demo cart. Prices are in the shop's currency. */
export type DemoLine = {
  id: string;
  title: string;
  unitPrice: number;
  quantity: number;
  productId: string;
  inSelectedCollection: boolean;
  inBuyCollection: boolean;
  inGetCollection: boolean;
  /** The real picture of a picked product or collection, if it has one. */
  image: string | null;
  /** The placeholder picture shown when there is no real one. Display only. */
  art: DemoArt;
  /** Which colour the picture uses. Display only. */
  tint: number;
};

export type DemoArt =
  "tshirt" | "hoodie" | "cap" | "socks" | "bag" | "box" | "tag";

/** Who is shopping, which decides the customer eligibility rules. */
export type DemoShopper = "guest" | "newCustomer" | "returning";

export const DEMO_SHOPPER_LABELS: Record<DemoShopper, string> = {
  guest: "Guest, not signed in",
  newCustomer: "Signed in, no previous orders",
  returning: "Signed in, has ordered before",
};

export function isDemoShopper(value: unknown): value is DemoShopper {
  return value === "guest" || value === "newCustomer" || value === "returning";
}

export type DemoShipping = { handle: string; title: string; price: number };

export const DEMO_SHIPPING: DemoShipping = {
  handle: "demo-standard",
  title: "Standard shipping",
  price: 8,
};

export type PreviewLine = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  /** Before any discount. */
  total: number;
  discount: number;
  /** How many units the discount touched. */
  discountedUnits: number;
  message: string | null;
};

export type PreviewResult = {
  lines: PreviewLine[];
  subtotal: number;
  productDiscount: number;
  orderDiscount: number;
  orderMessage: string | null;
  shippingPrice: number;
  shippingDiscount: number;
  shippingMessage: string | null;
  total: number;
};

type RunOptions = {
  /** The config metafield value exactly as the app would save it. */
  config: unknown;
  discountClasses: ShopifyDiscountClass[];
  lines: DemoLine[];
  shopper: DemoShopper;
  shipping?: DemoShipping;
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function buyerIdentityFor(
  shopper: DemoShopper,
): CartInput["cart"]["buyerIdentity"] {
  switch (shopper) {
    case "newCustomer":
      return { isAuthenticated: true, customer: { numberOfOrders: 0 } };
    case "returning":
      return { isAuthenticated: true, customer: { numberOfOrders: 3 } };
    default:
      return null;
  }
}

/** Only percentage values are produced by this Function. */
function percentageOf(value: {
  percentage?: { value: unknown } | null;
}): number {
  const percentage = Number(value.percentage?.value);
  return Number.isFinite(percentage) ? percentage : 0;
}

/** FIRST keeps the first candidate, MAXIMUM the largest, ALL every one. */
function chosen<T>(
  candidates: T[],
  strategy: string,
  size: (candidate: T) => number,
): T[] {
  if (strategy === "ALL") return candidates;
  if (strategy === "MAXIMUM") {
    const best = [...candidates].sort((a, b) => size(b) - size(a))[0];
    return best ? [best] : [];
  }

  return candidates.slice(0, 1);
}

export function runPreview({
  config,
  discountClasses,
  lines,
  shopper,
  shipping = DEMO_SHIPPING,
}: RunOptions): PreviewResult {
  const inCart = lines.filter((line) => line.quantity > 0);
  const subtotalCents = inCart.reduce(
    (sum, line) => sum + toCents(line.unitPrice) * line.quantity,
    0,
  );
  const subtotalAmount = (subtotalCents / 100).toFixed(2);
  const buyerIdentity = buyerIdentityFor(shopper);
  const classes = discountClasses as unknown as DiscountClass[];
  const discount = {
    discountClasses: classes,
    metafield: { jsonValue: config },
  };

  const cartInput: CartInput = {
    cart: {
      buyerIdentity,
      cost: { subtotalAmount: { amount: subtotalAmount } },
      lines: inCart.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        cost: { amountPerQuantity: { amount: line.unitPrice.toFixed(2) } },
        merchandise: {
          __typename: "ProductVariant",
          id: `${line.id}/variant`,
          product: {
            id: line.productId,
            inSelectedCollection: line.inSelectedCollection,
            inBuyCollection: line.inBuyCollection,
            inGetCollection: line.inGetCollection,
          },
        },
      })),
    },
    presentmentCurrencyRate: "1.0",
    discount,
  };

  const deliveryInput: DeliveryInput = {
    cart: {
      buyerIdentity,
      cost: { subtotalAmount: { amount: subtotalAmount } },
      deliveryGroups: [{ deliveryOptions: [{ handle: shipping.handle }] }],
    },
    presentmentCurrencyRate: "1.0",
    discount,
  };

  const cartOperations: CartOperation[] = inCart.length
    ? cartLinesDiscountsGenerateRun(cartInput).operations
    : [];
  const deliveryOperations: DeliveryOperation[] = inCart.length
    ? cartDeliveryOptionsDiscountsGenerateRun(deliveryInput).operations
    : [];

  const lineDiscounts = new Map<
    string,
    { cents: number; units: number; message: string | null }
  >();
  let orderDiscountCents = 0;
  let orderMessage: string | null = null;

  const priceOf = new Map(inCart.map((line) => [line.id, line]));

  for (const operation of cartOperations) {
    if (operation.productDiscountsAdd) {
      const { candidates, selectionStrategy } = operation.productDiscountsAdd;

      for (const candidate of chosen(candidates, selectionStrategy, () => 0)) {
        const percentage = percentageOf(candidate.value);

        for (const target of candidate.targets) {
          const line = target.cartLine ? priceOf.get(target.cartLine.id) : null;
          if (!line || !target.cartLine) continue;

          const units = target.cartLine.quantity ?? line.quantity;
          const cents = Math.round(
            (toCents(line.unitPrice) * units * percentage) / 100,
          );
          const existing = lineDiscounts.get(line.id);

          lineDiscounts.set(line.id, {
            cents: (existing?.cents ?? 0) + cents,
            units: (existing?.units ?? 0) + units,
            message: candidate.message ?? existing?.message ?? null,
          });
        }
      }
    }

    if (operation.orderDiscountsAdd) {
      const { candidates, selectionStrategy } = operation.orderDiscountsAdd;

      for (const candidate of chosen(candidates, selectionStrategy, (c) =>
        percentageOf(c.value),
      )) {
        // A capped discount comes back as a fixed amount instead.
        const fixed = Number(candidate.value.fixedAmount?.amount);
        orderDiscountCents += Number.isFinite(fixed)
          ? toCents(fixed)
          : Math.round((subtotalCents * percentageOf(candidate.value)) / 100);
        orderMessage = candidate.message ?? orderMessage;
      }
    }
  }

  let shippingDiscountCents = 0;
  let shippingMessage: string | null = null;
  const shippingCents = toCents(shipping.price);

  for (const operation of deliveryOperations) {
    if (!operation.deliveryDiscountsAdd) continue;

    const { candidates, selectionStrategy } = operation.deliveryDiscountsAdd;

    for (const candidate of chosen(candidates, selectionStrategy, (c) =>
      percentageOf(c.value),
    )) {
      const targetsOurs = candidate.targets.some(
        (target) => target.deliveryOption?.handle === shipping.handle,
      );
      if (!targetsOurs) continue;

      shippingDiscountCents = Math.max(
        shippingDiscountCents,
        Math.round((shippingCents * percentageOf(candidate.value)) / 100),
      );
      shippingMessage = candidate.message ?? shippingMessage;
    }
  }

  const previewLines: PreviewLine[] = inCart.map((line) => {
    const applied = lineDiscounts.get(line.id);
    const totalCents = toCents(line.unitPrice) * line.quantity;

    return {
      id: line.id,
      title: line.title,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: totalCents / 100,
      discount: Math.min(applied?.cents ?? 0, totalCents) / 100,
      discountedUnits: Math.min(applied?.units ?? 0, line.quantity),
      message: applied?.message ?? null,
    };
  });

  const productDiscountCents = previewLines.reduce(
    (sum, line) => sum + toCents(line.discount),
    0,
  );
  const orderCents = Math.min(
    orderDiscountCents,
    subtotalCents - productDiscountCents,
  );
  const deliveryCents = inCart.length ? shippingCents : 0;
  const shippingOffCents = inCart.length ? shippingDiscountCents : 0;

  return {
    lines: previewLines,
    subtotal: subtotalCents / 100,
    productDiscount: productDiscountCents / 100,
    orderDiscount: orderCents / 100,
    orderMessage,
    shippingPrice: deliveryCents / 100,
    shippingDiscount: shippingOffCents / 100,
    shippingMessage,
    total:
      (subtotalCents -
        productDiscountCents -
        orderCents +
        deliveryCents -
        shippingOffCents) /
      100,
  };
}

/** "$12.50" in the shop's currency, or "12.50" when it is not known. */
export function formatMoney(amount: number, currencyCode: string): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
      }).format(amount);
    } catch {
      // An unknown code falls through to a plain number.
    }
  }

  return amount.toFixed(2);
}

/** "2026-10-21" as "21 Oct 2026". The date is a calendar date, not an instant. */
export function formatCalendarDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
