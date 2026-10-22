import { useAppBridge } from "@shopify/app-bridge-react";

import type { BxgyResource } from "../lib/bxgy-form";
import { pickerImage } from "../lib/resource-image";

type Props = {
  type: "product" | "collection";
  selected: BxgyResource[];
  onChange: (next: BxgyResource[]) => void;
  /** The most the merchant may pick. */
  max: number;
  disabled?: boolean;
  error?: string;
};

/**
 * A Browse button that opens Shopify's own resource picker, and the list of
 * what was picked with a Remove button on each. Titles are carried for display
 * only; what gets saved is the IDs.
 */
export function ResourceSelector({
  type,
  selected,
  onChange,
  max,
  disabled = false,
  error,
}: Props) {
  const shopify = useAppBridge();
  const noun = type === "product" ? "product" : "collection";

  const browse = async () => {
    let picked: Awaited<ReturnType<typeof shopify.resourcePicker>>;

    try {
      picked = await shopify.resourcePicker({
        type,
        multiple: max,
        action: "select",
        selectionIds: selected.map((resource) => ({ id: resource.id })),
      });
    } catch {
      // Without this the button would simply appear to do nothing.
      shopify.toast.show(`Could not open the ${noun} picker. Try again.`, {
        isError: true,
      });
      return;
    }

    // The picker resolves undefined when the merchant cancels, which is not
    // the same as clearing the selection.
    if (!picked) return;

    onChange(
      picked.map((resource) => ({
        id: String(resource.id),
        title: String(resource.title ?? ""),
        image: pickerImage(resource),
      })),
    );
  };

  const remove = (id: string) => {
    onChange(selected.filter((resource) => resource.id !== id));
  };

  return (
    <s-stack direction="block" gap="small-200">
      <s-stack direction="inline">
        <s-button
          variant="secondary"
          {...(disabled ? { disabled: true } : {})}
          onClick={browse}
        >
          {selected.length > 0 ? `Edit ${noun}s` : `Browse ${noun}s`}
        </s-button>
      </s-stack>

      {error && <s-text tone="critical">{error}</s-text>}

      {selected.length === 0 ? (
        <s-text color="subdued">No {noun}s selected yet.</s-text>
      ) : (
        selected.map((resource) => (
          <s-box
            key={resource.id}
            padding="small-100"
            borderWidth="base"
            borderRadius="base"
          >
            <s-stack
              direction="inline"
              gap="base"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text>{resource.title || "No longer available"}</s-text>
              <s-button
                variant="tertiary"
                tone="critical"
                accessibilityLabel={`Remove ${resource.title || noun}`}
                {...(disabled ? { disabled: true } : {})}
                onClick={() => remove(resource.id)}
              >
                Remove
              </s-button>
            </s-stack>
          </s-box>
        ))
      )}
    </s-stack>
  );
}
