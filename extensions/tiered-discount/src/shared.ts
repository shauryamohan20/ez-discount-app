/**
 * Helpers used by both targets: the cart lines target and the delivery
 * options target. Each target has its own generated input type, so these take
 * the small structural shapes they need rather than either input type.
 */

export type CustomerEligibility =
  "all" | "signedIn" | "firstOrder" | "returning";

type BuyerIdentity =
  | {
      isAuthenticated: boolean;
      customer?: { numberOfOrders: number } | null;
    }
  | null
  | undefined;

/** Money is compared in whole cents so 99.99 and 100.00 never drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function isPercentage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
  );
}

/**
 * A cart with no identified customer cannot satisfy any rule that depends on
 * who the buyer is. That is not an edge case: an automatic discount runs on
 * anonymous carts too, and such a cart has no order history to read, so a
 * first order discount simply does not apply until the buyer is known.
 */
export function isCustomerEligible(
  buyerIdentity: BuyerIdentity,
  rule: CustomerEligibility | null | undefined,
): boolean {
  switch (rule) {
    case "signedIn":
      return buyerIdentity?.isAuthenticated === true;
    case "firstOrder": {
      const customer = buyerIdentity?.customer;
      return !!customer && customer.numberOfOrders === 0;
    }
    case "returning": {
      const customer = buyerIdentity?.customer;
      return !!customer && customer.numberOfOrders > 0;
    }
    default:
      return true;
  }
}

/** The config metafield as a plain object, or null when it is unusable. */
export function readConfig(jsonValue: unknown): Record<string, unknown> | null {
  if (!jsonValue || typeof jsonValue !== "object" || Array.isArray(jsonValue)) {
    return null;
  }

  return jsonValue as Record<string, unknown>;
}

/**
 * The store's clock, as the input query reads it: today's date in the store's
 * time zone, and whether the time is at or past the schedule's start and end
 * times (passed in as input query variables).
 */
export type StoreClock = {
  date: string;
  afterScheduleStart: boolean;
  afterScheduleEnd: boolean;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 0 is Sunday. Plain arithmetic on the date, so no clock is involved. */
export function weekdayOf(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  let year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Sakamoto's method.
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) year -= 1;
  return (
    (year +
      Math.floor(year / 4) -
      Math.floor(year / 100) +
      Math.floor(year / 400) +
      offsets[month - 1] +
      day) %
    7
  );
}

/**
 * Version 9 added schedule: the days of the week (0 is Sunday) and the daily
 * hours a discount runs, in the store's time zone. Missing or null means
 * always. Times are "HH:MM"; both or neither. A start later than the end is
 * a window across midnight, and its hours after midnight belong to the day
 * it started, so "Saturday 22:00 to 06:00" still runs at 02:00 on Sunday.
 *
 * A schedule that is there but unreadable switches the discount off, rather
 * than running it at times the merchant did not choose.
 */
export function isWithinSchedule(
  schedule: unknown,
  clock: StoreClock,
): boolean {
  if (schedule === undefined || schedule === null) return true;
  if (typeof schedule !== "object" || Array.isArray(schedule)) return false;

  const { days, startTime, endTime } = schedule as Record<string, unknown>;

  const allowedDays =
    days === undefined || days === null ? [0, 1, 2, 3, 4, 5, 6] : days;
  if (
    !Array.isArray(allowedDays) ||
    allowedDays.length === 0 ||
    !allowedDays.every(
      (day) =>
        typeof day === "number" &&
        Number.isInteger(day) &&
        day >= 0 &&
        day <= 6,
    )
  ) {
    return false;
  }

  const hasStart = startTime !== undefined && startTime !== null;
  const hasEnd = endTime !== undefined && endTime !== null;
  if (hasStart !== hasEnd) return false;

  let dayOffset = 0;
  if (hasStart) {
    if (typeof startTime !== "string" || typeof endTime !== "string")
      return false;
    if (!TIME.test(startTime) || !TIME.test(endTime) || startTime === endTime) {
      return false;
    }

    const { afterScheduleStart, afterScheduleEnd } = clock;
    if (startTime < endTime) {
      if (!afterScheduleStart || afterScheduleEnd) return false;
    } else if (afterScheduleStart) {
      // The evening part of a window across midnight.
    } else if (!afterScheduleEnd) {
      // The early morning part belongs to the day before.
      dayOffset = -1;
    } else {
      return false;
    }
  }

  const today = weekdayOf(clock.date);
  if (today === null) return false;

  return allowedDays.includes((today + dayOffset + 7) % 7);
}
