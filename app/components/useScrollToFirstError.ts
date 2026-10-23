import { useEffect } from "react";

import { hasErrors, type DiscountFormErrors } from "../lib/discount-form";

/**
 * What counts as a problem on the page: a Polaris field showing an error, a
 * critical banner (the save failed, or a section level error such as
 * overlapping tiers), and critical text (errors beside the product pickers).
 * querySelector returns the first in page order, which is the top one.
 */
const PROBLEM_SELECTOR = [
  '[error]:not([error=""])',
  's-banner[tone="critical"]',
  's-text[tone="critical"]',
].join(", ");

/**
 * The element that actually takes up space for a problem. Polaris elements
 * can have no box of their own, with what you see drawn inside them, and
 * the browser cannot scroll to an element without a box.
 */
function boxOf(element: HTMLElement): HTMLElement {
  if (element.getBoundingClientRect().height > 0) return element;

  const inside = element.shadowRoot
    ? [...element.shadowRoot.querySelectorAll<HTMLElement>("*")].find(
        (child) => child.getBoundingClientRect().height > 0,
      )
    : undefined;
  if (inside) return inside;

  let parent = element.parentElement;
  while (parent && parent.getBoundingClientRect().height === 0) {
    parent = parent.parentElement;
  }
  return parent ?? element;
}

/**
 * After a save that failed, scrolls the first problem into view and puts the
 * cursor in it when it is a field, so a merchant who saved with an empty
 * field out of sight sees what to fix.
 *
 * It runs when the errors change, which is on a save attempt: client checks
 * set new errors when Save is clicked, and the server's come back after it.
 * Typing does not change them, so it never scrolls while the merchant types.
 */
export function useScrollToFirstError(
  errors: DiscountFormErrors,
  formError: string | null,
) {
  useEffect(() => {
    if (!formError && !hasErrors(errors)) return;

    // After the errors have been drawn.
    const frame = requestAnimationFrame(() => {
      const problem = document.querySelector<HTMLElement>(PROBLEM_SELECTOR);
      if (!problem) return;

      boxOf(problem).scrollIntoView({ behavior: "smooth", block: "center" });
      if (problem.hasAttribute("error")) problem.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [errors, formError]);
}
