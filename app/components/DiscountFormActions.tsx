type Props = {
  /** True while a save is being sent. */
  saving: boolean;
  /** Which button sent it, so only that one shows a spinner. */
  savingAs: "save" | "draft" | null;
  /** The discount being edited is a draft, so the main action publishes it. */
  isDraft?: boolean;
  /** The draft is a discount whose end date has passed, not a saved draft. */
  ended?: boolean;
  cancelHref: string;
  onSave: (saveAs: "save" | "draft") => void;
};

/**
 * The page actions every create and edit page shares: save (or publish, for a
 * draft), save as draft, and cancel. Rendered straight into s-page, so the
 * buttons land in its slots, along with a banner when editing a draft.
 */
export function DiscountFormActions({
  saving,
  savingAs,
  isDraft = false,
  ended = false,
  cancelHref,
  onSave,
}: Props) {
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
    </>
  );
}

/** The button that sent the form, read back from the fetcher. */
export function savingAsFrom(formData: FormData | undefined) {
  if (!formData) return null;
  return formData.get("saveAs") === "draft" ? "draft" : "save";
}
