import {
  MAX_TITLE_LENGTH,
  emptyTierRow,
  type DiscountFormErrors,
  type DiscountFormValues,
  type TierRowValues,
} from "../lib/discount-form";
import { MAX_TIERS } from "../lib/tiers";

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
  const update = (patch: Partial<DiscountFormValues>) => {
    onChange({ ...values, ...patch });
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

      <s-section heading="Tiers">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            The discount uses the highest tier the cart qualifies for, counting
            every item in the cart.
          </s-paragraph>

          {errors.tiers && (
            <s-banner tone="critical">
              <s-paragraph>{errors.tiers}</s-paragraph>
            </s-banner>
          )}

          {values.tiers.map((tier, index) => {
            const tierErrors = rowErrors[String(index)] ?? {};

            return (
              <s-stack
                key={index}
                direction="inline"
                gap="base"
                alignItems="end"
              >
                <s-number-field
                  label="Minimum quantity"
                  value={tier.minQuantity}
                  min={1}
                  step={1}
                  inputMode="numeric"
                  {...(tierErrors.minQuantity
                    ? { error: tierErrors.minQuantity }
                    : {})}
                  {...(disabled ? { disabled: true } : {})}
                  onInput={(event) =>
                    updateTier(index, { minQuantity: event.currentTarget.value })
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
                    updateTier(index, { percentage: event.currentTarget.value })
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
