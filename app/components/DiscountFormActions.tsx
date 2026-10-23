import { useEffect } from "react";
import { useBlocker } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

const SAVE_BAR_ID = "discount-save-bar";
const LEAVE_MODAL_ID = "discount-leave-confirmation";

type Props = {
  /** True while a save is being sent. */
  saving: boolean;
  /** Which button sent it, so only that one shows a spinner. */
  savingAs: "save" | "draft" | null;
  /** The discount being edited is a draft, so the main action publishes it. */
  isDraft?: boolean;
  /** The draft is a discount whose end date has passed, not a saved draft. */
  ended?: boolean;
  /** The form differs from what was loaded, so leaving would lose changes. */
  dirty: boolean;
  cancelHref: string;
  onSave: (saveAs: "save" | "draft") => void;
  /** Puts the form back to what was loaded. */
  onDiscard: () => void;
};

/**
 * The page actions every create and edit page shares: save (or publish, for a
 * draft), save as draft, and cancel. Rendered straight into s-page, so the
 * buttons land in its slots, along with a banner when editing a draft.
 *
 * It also guards unsaved changes, in the three ways the admin allows:
 *
 * - Leaving within the app (Cancel, breadcrumbs, the app menu, the back
 *   button) is stopped by React Router, and the app asks whether to save the
 *   discount as a draft first.
 * - Leaving to another part of the admin is covered by Shopify's save bar,
 *   shown while there are changes, after which Shopify asks itself. Its
 *   buttons are always labelled Save and Discard.
 * - Closing or reloading the tab shows the browser's own warning; browsers
 *   do not let a page choose that text.
 */
export function DiscountFormActions({
  saving,
  savingAs,
  isDraft = false,
  ended = false,
  dirty,
  cancelHref,
  onSave,
  onDiscard,
}: Props) {
  const shopify = useAppBridge();

  // Saving redirects to the list, which must not be stopped, so nothing is
  // guarded while a save is in flight.
  const guarded = dirty && !saving;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      guarded && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") void shopify.modal.show(LEAVE_MODAL_ID);
  }, [blocker.state, shopify]);

  useEffect(() => {
    if (guarded) void shopify.saveBar.show(SAVE_BAR_ID);
    else void shopify.saveBar.hide(SAVE_BAR_ID);
  }, [guarded, shopify]);

  // Hidden when the page goes, so it never stays over the next page.
  useEffect(
    () => () => {
      void shopify.saveBar.hide(SAVE_BAR_ID);
    },
    [shopify],
  );

  useEffect(() => {
    if (!guarded) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a value here to show their warning.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guarded]);

  const stay = () => {
    void shopify.modal.hide(LEAVE_MODAL_ID);
    if (blocker.state === "blocked") blocker.reset();
  };

  const leave = () => {
    // Proceed first, so closing the dialog does not count as keep editing.
    if (blocker.state === "blocked") blocker.proceed();
    void shopify.modal.hide(LEAVE_MODAL_ID);
  };

  const saveDraftAndLeave = () => {
    void shopify.modal.hide(LEAVE_MODAL_ID);
    // The save takes the merchant to the list once it succeeds. If it fails,
    // they stay here with the errors showing.
    if (blocker.state === "blocked") blocker.reset();
    onSave("draft");
  };

  return (
    <>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => onSave("save")}
        {...(saving && savingAs !== "draft" ? { loading: true } : {})}
        {...(saving ? { disabled: true } : {})}
      >
        {isDraft ? "Publish" : "Save"}
      </s-button>

      <s-button
        slot="secondary-actions"
        onClick={() => onSave("draft")}
        {...(saving && savingAs === "draft" ? { loading: true } : {})}
        {...(saving ? { disabled: true } : {})}
      >
        Save as draft
      </s-button>

      <s-button slot="secondary-actions" href={cancelHref}>
        Cancel
      </s-button>

      {isDraft && (
        <s-banner slot="supplemental-start" tone="info" heading="Draft">
          <s-paragraph>
            {ended
              ? "This discount's end date has passed, so it is a draft and does not apply at checkout. Change or clear the end date below, then publish it."
              : "This discount is a draft, so it does not apply at checkout. Publish it to run it on the dates below, or save it as a draft again to keep working on it."}
          </s-paragraph>
        </s-banner>
      )}

      <ui-save-bar id={SAVE_BAR_ID}>
        <button
          {...{ variant: "primary" }}
          onClick={() => onSave("save")}
          {...(saving ? { disabled: true } : {})}
        >
          Save
        </button>
        <button onClick={onDiscard}>Discard</button>
      </ui-save-bar>

      <s-modal
        id={LEAVE_MODAL_ID}
        heading="Save this discount as a draft before leaving?"
        // Closed with its X or Escape: the same as keep editing.
        onHide={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
      >
        <s-paragraph>
          You have changes that are not saved. Save the discount as a draft to
          keep them, or leave and lose them.
        </s-paragraph>

        <s-button slot="secondary-actions" onClick={stay}>
          Keep editing
        </s-button>
        <s-button slot="secondary-actions" tone="critical" onClick={leave}>
          Leave without saving
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={saveDraftAndLeave}
        >
          Save as draft
        </s-button>
      </s-modal>
    </>
  );
}

/** The button that sent the form, read back from the fetcher. */
export function savingAsFrom(formData: FormData | undefined) {
  if (!formData) return null;
  return formData.get("saveAs") === "draft" ? "draft" : "save";
}
