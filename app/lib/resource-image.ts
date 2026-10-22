/**
 * Pictures for the products and collections a merchant picks, so the demo
 * cart can show the real thing. A pick comes from App Bridge's resource
 * picker; a saved discount's picks are looked up again on its edit page.
 */

type PickerImage = { originalSrc?: unknown } | null | undefined;

/**
 * The picture a resource picker selection carries: a product's first image,
 * or a collection's image. Null when it has none.
 */
export function pickerImage(resource: unknown): string | null {
  if (typeof resource !== "object" || resource === null) return null;

  const { images, image } = resource as {
    images?: PickerImage[];
    image?: PickerImage;
  };
  const source = Array.isArray(images)
    ? images[0]?.originalSrc
    : image?.originalSrc;

  return typeof source === "string" && source ? source : null;
}

/**
 * A Shopify CDN image resized for a small thumbnail, so the cart does not
 * download a full size product photo. Shopify's CDN reads the width
 * parameter; any other address is left as it is.
 */
export function thumbnailUrl(url: string, size = 160): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("shopify.com")) return url;

    parsed.searchParams.set("width", String(size));
    return parsed.toString();
  } catch {
    return url;
  }
}
