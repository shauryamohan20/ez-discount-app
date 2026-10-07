import { useAppBridge } from "@shopify/app-bridge-react";

import {
  MAX_TITLE_LENGTH,
  emptyTierRow,
  type DiscountFormErrors,
  type DiscountFormValues,
  type ResourceRef,
  type TierRowValues,
} from "../lib/discount-form";
import {
  CUSTOMER_ELIGIBILITY_LABELS,
  MAX_TIERS,
  isCustomerEligibility,
  type AppliesToType,
} from "../lib/tiers";

type Props = {
  values: DiscountFormValues;
  errors: DiscountFormErrors;
  disabled?: boolean;
  onChange: (values: DiscountFormValues) => void;
};

export function TieredDiscountForm({
  values,
  errors,
  disabled = false,
  onChange,
}: Props) {
  const shopify = useAppBridge();

  const update = (patch: Partial<DiscountFormValues>) => {
    onChange({ ...values, ...patch });
  };

  const selected =
    values.appliesToType === "collections" ? values.collections : values.products;

  const pickResources = async () => {
    const isCollections = values.appliesToType === "collections";

    const picked = await shopify.resourcePicker({
      type: isCollections ? "collection" : "product",
      multiple: true,
      action: "select",
      selectionIds: selected.map((resource) => ({ id: resource.id })),
    });

    // The picker returns undefined when the merchant cancels, which is not the
    // same as clearing the selection.
    if (!picked) return;

    const refs: ResourceRef[] = picked.map((resource) => ({
      id: String(resource.id),
      title: String(resource.title ?? ""),
    }));

    update(isCollections ? { collections: refs } : { products: refs });
  };

  const removeResource = (id: string) => {
    if (values.appliesToType === "collections") {
      update({
        collections: values.collections.filter(
          (collection) => collection.id !== id,
        ),
      });
      return;
    }

    update({ products: values.products.filter((product) => product.id !== id) });
  };

  const updateTier = (index: number, patch: Partial<TierRowValues>) => {
    update({
      tiers: values.tiers.map((tier, position) =>
        position === index ? { ...tier, ...patch } : tier,
      ),
    });
  };

  const addTier = () => {
    update({ tiers: [...values.tiers, emptyTierRow()] });
  };

  const removeTier = (index: number) => {
    update({ tiers: values.tiers.filter((_, position) => position !== index) });
  };

  const rowErrors = errors.rows ?? {};

  return (
    <>
      <s-section heading="Discount details">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Title"
            name="title"
            value={values.title}
            maxLength={MAX_TITLE_LENGTH}
            details="Customers see this name on the cart and at checkout."
            {...(errors.title ? { error: errors.title } : {})}
            {...(disabled ? { disabled: true } : {})}
            onInput={(event) => update({ title: event.currentTarget.value })}
          />

          <s-stack direction="inline" gap="base">
            <s-date-field
              label="Start date"
              name="startDate"
              value={values.startDate}
              {...(errors.startDate ? { error: errors.startDate } : {})}
              {...(disabled ? { disabled: true } : {})}
              onChange={(event) =>
                update({ startDate: event.currentTarget.value })
              }
            />
            <s-date-field
              label="End date"
              name="endDate"
              value={values.endDate}
              details="Leave empty to run with no end date."
              {...(errors.endDate ? { error: errors.endDate } : {})}
              {...(disabled ? { disabled: true } : {})}
              onChange={(event) =>
                update({ endDate: event.currentTarget.value })
              }
            />
          </s-stack>

          <s-checkbox
            label="Let this discount combine with shipping discounts"
            name="combinesWithShipping"
            checked={values.combinesWithShipping}
            {...(disabled ? { disabled: true } : {})}
            onChange={(event) =>
              update({ combinesWithShipping: event.currentTarget.checked })
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Applies to">
        <s-stack direction="block" gap="base">
          <s-choice-list
            name="appliesToType"
            label="Which products this discount applies to"
            labelAccessibilityVisibility="exclusive"
            values={[values.appliesToType]}
            {...(errors.appliesTo ? { error: errors.appliesTo } : {})}
            {...(disabled ? { disabled: true } : {})}
            onChange={(event) => {
              const list = event.currentTarget as HTMLElementTagNameMap["s-choice-list"];
              const next = list.values[0] as AppliesToType | undefined;

              if (next) update({ appliesToType: next });
            }}
          >
            <s-choice value="all">
              All products
              <s-text slot="details">Every item in the cart counts.</s-text>
            </s-choice>
            <s-choice value="products">
              Specific products
              <s-text slot="details">
                Only the products you choose count toward the quantity.
              </s-text>
            </s-choice>
            <s-choice value="collections">
              Specific collections
              <s-text slot="details">
                Only products in the collections you choose count toward the
                quantity.
              </s-text>
            </s-choice>
          </s-choice-list>

          {values.appliesToType !== "all" && (
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline">
                <s-button
                  variant="secondary"
                  {...(disabled ? { disabled: true } : {})}
                  onClick={pickResources}
                >
                  {selected.length > 0 ? "Edit selection" : "Browse"}
                </s-button>
              </s-stack>

              {selected.length === 0 ? (
                <s-text color="subdued">Nothing selected yet.</s-text>
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
                      <s-text>{resource.title || resource.id}</s-text>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        accessibilityLabel={`Remove ${resource.title}`}
                        {...(disabled ? { disabled: true } : {})}
                        onClick={() => removeResource(resource.id)}
                      >
                        Remove
                      </s-button>
                    </s-stack>
                  </s-box>
                ))
              )}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Eligible customers">
        <s-stack direction="block" gap="base">
          <s-select
            label="Who can use this discount"
            name="customerEligibility"
            value={values.customerEligibility}
            {...(disabled ? { disabled: true } : {})}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isCustomerEligibility(next)) {
                update({ customerEligibility: next });
              }
            }}
          >
            <s-option value="all">
              {CUSTOMER_ELIGIBILITY_LABELS.all}
            </s-option>
            <s-option value="signedIn">
              {CUSTOMER_ELIGIBILITY_LABELS.signedIn}
            </s-option>
            <s-option value="firstOrder">
              {CUSTOMER_ELIGIBILITY_LABELS.firstOrder}
            </s-option>
            <s-option value="returning">
              {CUSTOMER_ELIGIBILITY_LABELS.returning}
            </s-option>
          </s-select>

          {values.customerEligibility !== "all" && (
            <s-banner tone="info">
              <s-paragraph>
                A cart only qualifies once Shopify knows who the customer is.
                An automatic discount will not apply to a shopper who is
                browsing anonymously until they sign in or identify themselves
                at checkout.
              </s-paragraph>
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Tiers">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Each tier covers a range of quantities, counting only the items
            this discount applies to. Leave the to quantity
            empty for no upper limit, or set it to the same number as the from
            quantity to match an exact quantity. Ranges cannot overlap.
          </s-paragraph>

          {errors.tiers && (
            <s-banner tone="critical">
              <s-paragraph>{errors.tiers}</s-paragraph>
            </s-banner>
          )}

          {values.tiers.map((tier, index) => {
            const tierErrors = rowErrors[String(index)] ?? {};

            return (
              <s-box
                key={index}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignItems="start">
                    <s-number-field
                      label="From quantity"
                      value={tier.minQuantity}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      {...(tierErrors.minQuantity
                        ? { error: tierErrors.minQuantity }
                        : {})}
                      {...(disabled ? { disabled: true } : {})}
                      onInput={(event) =>
                        updateTier(index, {
                          minQuantity: event.currentTarget.value,
                        })
                      }
                    />
                    <s-number-field
                      label="To quantity"
                      value={tier.maxQuantity}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      details="Empty means no limit"
                      {...(tierErrors.maxQuantity
                        ? { error: tierErrors.maxQuantity }
                        : {})}
                      {...(disabled ? { disabled: true } : {})}
                      onInput={(event) =>
                        updateTier(index, {
                          maxQuantity: event.currentTarget.value,
                        })
                      }
                    />
                    <s-number-field
                      label="Percentage off"
                      value={tier.percentage}
                      min={0}
                      max={100}
                      suffix="%"
                      {...(tierErrors.percentage
                        ? { error: tierErrors.percentage }
                        : {})}
                      {...(disabled ? { disabled: true } : {})}
                      onInput={(event) =>
                        updateTier(index, {
                          percentage: event.currentTarget.value,
                        })
                      }
                    />
                  </s-stack>

                  <s-stack
                    direction="inline"
                    gap="base"
                    alignItems="start"
                    justifyContent="space-between"
                  >
                    <s-number-field
                      label="Discount only this many units"
                      value={tier.maxDiscountedUnits}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      details="Empty discounts every item in the cart"
                      {...(tierErrors.maxDiscountedUnits
                        ? { error: tierErrors.maxDiscountedUnits }
                        : {})}
                      {...(disabled ? { disabled: true } : {})}
                      onInput={(event) =>
                        updateTier(index, {
                          maxDiscountedUnits: event.currentTarget.value,
                        })
                      }
                    />

                    <s-button
                      variant="tertiary"
                      tone="critical"
                      accessibilityLabel={`Remove tier ${index + 1}`}
                      {...(disabled || values.tiers.length === 1
                        ? { disabled: true }
                        : {})}
                      onClick={() => removeTier(index)}
                    >
                      Remove
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            );
          })}

          <s-stack direction="inline">
            <s-button
              variant="secondary"
              {...(disabled || values.tiers.length >= MAX_TIERS
                ? { disabled: true }
                : {})}
              onClick={addTier}
            >
              Add tier
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </>
  );
}
