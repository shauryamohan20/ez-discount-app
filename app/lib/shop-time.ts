/**
 * Discount start and end dates are picked as plain calendar dates, but Shopify
 * stores them as instants. A merchant who picks "starts on the 10th" means
 * midnight in their store's time zone, not midnight UTC, so every conversion
 * goes through the shop's UTC offset in minutes (Shop.timezoneOffsetMinutes).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** -300 becomes "-05:00", 330 becomes "+05:30". */
export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");

  return `${sign}${hours}:${minutes}`;
}

/**
 * "2026-10-10" becomes "2026-10-10T00:00:00-05:00", or the last second of that
 * day when `endOfDay` is set, which is what an end date should mean.
 */
export function calendarDateToShopIso(
  date: string,
  offsetMinutes: number,
  endOfDay = false,
): string {
  const time = endOfDay ? "23:59:59" : "00:00:00";

  return `${date}T${time}${formatOffset(offsetMinutes)}`;
}

/** The calendar date an instant falls on in the shop's time zone. */
export function shopIsoToCalendarDate(
  iso: string | null | undefined,
  offsetMinutes: number,
): string {
  if (!iso) return "";

  const milliseconds = Date.parse(iso);
  if (Number.isNaN(milliseconds)) return "";

  return new Date(milliseconds + offsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * "Oct 10, 2026" for display. Formatting is done against a shifted UTC date so
 * the server and the browser always render the same string.
 */
export function formatShopDate(
  iso: string | null | undefined,
  offsetMinutes: number,
): string {
  if (!iso) return "";

  const milliseconds = Date.parse(iso);
  if (Number.isNaN(milliseconds)) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(milliseconds + offsetMinutes * 60_000));
}

/** Today's calendar date in the shop's time zone, for date field defaults. */
export function todayInShop(offsetMinutes: number): string {
  return shopIsoToCalendarDate(new Date().toISOString(), offsetMinutes);
}
