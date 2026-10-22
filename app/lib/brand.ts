/**
 * The app's name and website, in one place so every page says the same thing.
 * The name Shopify shows in the admin comes from `name` in shopify.app.toml,
 * and the name of the discount type comes from the Function's locale file, so
 * change those too if this ever changes.
 */
export const APP_NAME = "EZ Master Discount";

/** https, because the http address only redirects here. */
export const APP_WEBSITE_URL = "https://www.ezmasterdiscount.com";

export const APP_WEBSITE_LABEL = "www.ezmasterdiscount.com";

/**
 * The app's accent colour and its light tint. Polaris draws its own buttons,
 * badges and links in the admin's colours, which apps cannot change, so the
 * accent goes on what the app draws itself: the demo cart, the product
 * pictures and the discount kind icons.
 */
export const ACCENT = "#0e6b4f";
export const ACCENT_SURFACE = "#E8F3EF";
