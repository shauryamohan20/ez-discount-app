/**
 * The demo carts the live preview runs the Function on. Each kind gets a cart
 * built from what the merchant picked: the real names of the chosen products
 * and collections, next to an item that does not qualify, with quantities that
 * make the discount apply at first. Prices are examples in the shop currency.
 *
 * A side with nothing picked yet uses a stand in, so the preview keeps working
 * while the form is half filled. The stand in's ID goes into the preview config
 * too, so the Function treats it exactly like a real pick.
 */
import { selectionFor, type BxgyResource } from "./bxgy-form";
import type { DiscountFormValues, ResourceRef } from "./discount-form";
import type { DemoArt, DemoLine } from "./preview";
import type { BuyXGetY } from "./tiers";

export const STAND_IN_PRODUCT: ResourceRef = {
  id: "gid://shopify/Product/preview-stand-in",
  title: "A product you choose",
};

export const STAND_IN_GET_PRODUCT: ResourceRef = {
  id: "gid://shopify/Product/preview-stand-in-get",
  title: "A product customers get",
};

export const STAND_IN_COLLECTION: ResourceRef = {
  id: "gid://shopify/Collection/preview-stand-in",
  title: "a collection you choose",
};

export const STAND_IN_GET_COLLECTION: ResourceRef = {
  id: "gid://shopify/Collection/preview-stand-in-get",
  title: "a collection customers get from",
};

/** Lines whose product is not part of any selection. */
const OTHER_PRODUCT_ID = "gid://shopify/Product/preview-other";

const MAX_DEMO_ITEMS = 3;
const MAX_DEMO_QUANTITY = 20;

type LineOptions = {
  productId?: string;
  inSelectedCollection?: boolean;
  inBuyCollection?: boolean;
  inGetCollection?: boolean;
};

/** A picture that suits the line's name, so the demo cart reads at a glance. */
function artFor(key: string, title: string): DemoArt {
  if (key === "other") return "box";
  const name = title.toLowerCase();
  if (name.includes("t-shirt")) return "tshirt";
  if (name.includes("hoodie")) return "hoodie";
  if (name.includes("cap")) return "cap";
  if (name.includes("socks")) return "socks";
  if (name.startsWith("item from")) return "tag";
  return "bag";
}

/** A steady colour per line, so a picture keeps its colour as the cart changes. */
function tintFor(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function demoLine(
  key: string,
  title: string,
  unitPrice: number,
  quantity: number,
  options: LineOptions = {},
): DemoLine {
  return {
    id: `gid://shopify/CartLine/${key}`,
    title,
    unitPrice,
    quantity,
    productId: options.productId ?? `gid://shopify/Product/preview-${key}`,
    inSelectedCollection: options.inSelectedCollection ?? false,
    inBuyCollection: options.inBuyCollection ?? false,
    inGetCollection: options.inGetCollection ?? false,
    art: artFor(key, title),
    tint: tintFor(key),
  };
}

/** The picked resources, or the stand in when nothing is picked yet. */
export function pickedOr<T extends ResourceRef | BxgyResource>(
  picked: T[],
  standIn: ResourceRef,
): ResourceRef[] {
  return picked.length ? picked.slice(0, MAX_DEMO_ITEMS) : [standIn];
}

/** Three example items, used when every product qualifies. */
export function genericCart(): DemoLine[] {
  return [
    demoLine("generic-1", "Demo T-shirt", 20, 2),
    demoLine("generic-2", "Demo hoodie", 45, 1),
    demoLine("generic-3", "Demo cap", 15, 0),
  ];
}

function otherLine(note: string, quantity: number): DemoLine {
  return demoLine("other", `Other product (${note})`, 20, quantity, {
    productId: OTHER_PRODUCT_ID,
  });
}

const PRICES = [25, 30, 18];

/** Quantity tiers: the chosen products or collections, plus one that does not count. */
export function quantityTierCart(values: DiscountFormValues): DemoLine[] {
  if (values.appliesToType === "products") {
    const products = pickedOr(values.products, STAND_IN_PRODUCT);

    return [
      ...products.map((product, index) =>
        demoLine(
          `qp-${product.id}`,
          product.title || "Chosen product",
          PRICES[index],
          index === 0 ? 2 : 0,
          { productId: product.id },
        ),
      ),
      otherLine("does not count", 1),
    ];
  }

  if (values.appliesToType === "collections") {
    const collections = pickedOr(values.collections, STAND_IN_COLLECTION);

    return [
      ...collections.map((collection, index) =>
        demoLine(
          `qc-${collection.id}`,
          `Item from ${collection.title || "a chosen collection"}`,
          PRICES[index],
          index === 0 ? 2 : 0,
          { inSelectedCollection: true },
        ),
      ),
      otherLine("not in the collections", 1),
    ];
  }

  return genericCart();
}

/**
 * The scope IDs the preview config uses: the picked ones, or the stand in's,
 * so the config always matches the cart.
 */
export function previewScopeIds(
  values: DiscountFormValues,
  side: "buy" | "get",
): string[] {
  const picked = selectionFor(values.bxgy, side).map((resource) => resource.id);
  if (picked.length) return picked;

  const kind =
    side === "buy" ? values.bxgy.buyScopeKind : values.bxgy.getScopeKind;
  if (kind === "products") {
    return [side === "buy" ? STAND_IN_PRODUCT.id : STAND_IN_GET_PRODUCT.id];
  }
  if (kind === "collections") {
    return [
      side === "buy" ? STAND_IN_COLLECTION.id : STAND_IN_GET_COLLECTION.id,
    ];
  }

  return [];
}

/**
 * Buy X Get Y: items customers buy and items they get. Quantities start at
 * exactly one application of the offer: the buy quantity of the first buy
 * item, and the get quantity of the first get item (or of a cheaper second
 * buy item when the get side is the same items).
 */
export function buyXGetYCart(
  values: DiscountFormValues,
  rules: BuyXGetY,
): DemoLine[] {
  const bxgy = values.bxgy;
  const buyQuantity = Math.min(rules.buyQuantity, MAX_DEMO_QUANTITY);
  const getQuantity = Math.min(rules.getQuantity, MAX_DEMO_QUANTITY);

  const buyCollectionIds = new Set(previewScopeIds(values, "buy"));
  const getCollectionIds = new Set(previewScopeIds(values, "get"));

  const buyLines: DemoLine[] = [];

  if (bxgy.buyScopeKind === "all") {
    buyLines.push(
      demoLine("buy-generic-1", "Demo T-shirt", 30, 0),
      demoLine("buy-generic-2", "Demo socks", 12, 0),
    );
  } else if (bxgy.buyScopeKind === "products") {
    pickedOr(bxgy.buyProducts, STAND_IN_PRODUCT)
      .slice(0, 2)
      .forEach((product, index) =>
        buyLines.push(
          demoLine(
            `buy-${product.id}`,
            product.title || "Chosen product",
            index === 0 ? 30 : 24,
            0,
            { productId: product.id },
          ),
        ),
      );
  } else {
    pickedOr(bxgy.buyCollections, STAND_IN_COLLECTION)
      .slice(0, 2)
      .forEach((collection, index) =>
        buyLines.push(
          demoLine(
            `buy-${collection.id}`,
            `Item from ${collection.title || "a chosen collection"}`,
            index === 0 ? 30 : 24,
            0,
            {
              inBuyCollection: true,
              inGetCollection:
                bxgy.getScopeKind === "collections" &&
                getCollectionIds.has(collection.id),
            },
          ),
        ),
      );
  }

  const usedProductIds = new Set(buyLines.map((line) => line.productId));
  const getLines: DemoLine[] = [];

  if (bxgy.getScopeKind === "products") {
    pickedOr(bxgy.getProducts, STAND_IN_GET_PRODUCT)
      .filter((product) => !usedProductIds.has(product.id))
      .slice(0, 2)
      .forEach((product, index) =>
        getLines.push(
          demoLine(
            `get-${product.id}`,
            product.title || "Chosen product",
            index === 0 ? 20 : 15,
            0,
            { productId: product.id },
          ),
        ),
      );
  } else if (bxgy.getScopeKind === "collections") {
    pickedOr(bxgy.getCollections, STAND_IN_GET_COLLECTION)
      .filter(
        (collection) =>
          bxgy.buyScopeKind !== "collections" ||
          !buyCollectionIds.has(collection.id),
      )
      .slice(0, 2)
      .forEach((collection, index) =>
        getLines.push(
          demoLine(
            `get-${collection.id}`,
            `Item from ${collection.title || "a chosen collection"}`,
            index === 0 ? 20 : 15,
            0,
            { inGetCollection: true },
          ),
        ),
      );
  }

  // Start at one application of the offer.
  if (buyLines.length) buyLines[0].quantity = buyQuantity;

  if (getLines.length) {
    getLines[0].quantity = getQuantity;
  } else if (bxgy.getScopeKind === "same_as_buy" && buyLines.length > 1) {
    buyLines[1].quantity = getQuantity;
  } else if (bxgy.getScopeKind === "same_as_buy" && buyLines.length) {
    buyLines[0].quantity = buyQuantity + getQuantity;
  }

  const lines = [...buyLines, ...getLines];

  if (bxgy.buyScopeKind !== "all") {
    lines.push(otherLine("not in this offer", 0));
  }

  return lines;
}
